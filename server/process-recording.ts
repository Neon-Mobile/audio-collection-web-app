import * as fs from "node:fs";
import * as path from "node:path";
import * as childProcess from "node:child_process";
import * as os from "node:os";

import { storage } from "./storage";
import { downloadFromS3, uploadBufferToS3, copyInS3 } from "./s3";

async function runFfmpeg(args: string[]): Promise<void> {
  if (!args.includes("-y")) {
    args = ["-y", ...args];
  }

  console.log("ffmpeg", args.join(" "));

  const stderrPath = path.join(os.tmpdir(), `ffmpeg_process_${Date.now()}.log`);

  const child = childProcess.spawn("ffmpeg", args, {
    stdio: ["pipe", "pipe", fs.openSync(stderrPath, "w")],
  });

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on("error", (err) => {
      console.error("ffmpeg spawn error:", err.message);
      resolve(1);
    });
    child.on("close", resolve);
  });

  if (exitCode) {
    const log = fs.existsSync(stderrPath)
      ? fs.readFileSync(stderrPath, "utf-8").slice(-500)
      : "(no log)";
    throw new Error(`ffmpeg exited with code ${exitCode}: ${log}`);
  }

  // clean up log file on success
  try {
    fs.rmSync(stderrPath);
  } catch {}
}

/** Shared core: download WebM from S3, convert to WAV, upload both to processed/NNNN/ */
async function processAudioFile(
  s3Key: string,
  folderNumber: string,
): Promise<{ processedFolder: string; webmS3Key: string; wavS3Key: string }> {
  const folderPrefix = `processed/${folderNumber}`;
  const tmpDir = os.tmpdir();
  const webmPath = path.join(tmpDir, `audio-${folderNumber}-${Date.now()}.webm`);
  const wavPath = path.join(tmpDir, `audio-${folderNumber}-${Date.now()}.wav`);

  try {
    const webmBuffer = await downloadFromS3(s3Key);
    fs.writeFileSync(webmPath, webmBuffer);
    console.log(`Downloaded ${webmBuffer.length} bytes to ${webmPath}`);

    // Convert WebM → WAV (48kHz, mono, 16-bit PCM)
    await runFfmpeg([
      "-i", webmPath,
      "-ar", "48000",
      "-ac", "1",
      "-c:a", "pcm_s16le",
      wavPath,
    ]);

    const wavBuffer = fs.readFileSync(wavPath);
    console.log(`WAV conversion complete: ${wavBuffer.length} bytes`);

    // Copy original WebM and upload WAV to processed folder
    const webmS3Key = `${folderPrefix}/${folderNumber}.webm`;
    const wavS3Key = `${folderPrefix}/${folderNumber}.wav`;

    await copyInS3(s3Key, webmS3Key);
    await uploadBufferToS3(wavS3Key, wavBuffer, "audio/wav");

    console.log(`Uploaded to S3: ${webmS3Key}, ${wavS3Key}`);

    return { processedFolder: folderNumber, webmS3Key, wavS3Key };
  } finally {
    try { fs.rmSync(webmPath); } catch {}
    try { fs.rmSync(wavPath); } catch {}
  }
}

async function getNextFolderNumber(): Promise<string> {
  const count = await storage.getProcessedRecordingCount();
  return String(count + 1).padStart(4, "0");
}

export async function processRecording(recordingId: string) {
  const recording = await storage.getRecordingById(recordingId);
  if (!recording) {
    throw new Error(`Recording not found: ${recordingId}`);
  }

  if (recording.processedFolder) {
    console.log(`Recording ${recordingId} already processed in folder ${recording.processedFolder}`);
    return recording;
  }

  const folderNumber = await getNextFolderNumber();
  console.log(`Processing recording ${recordingId} → processed/${folderNumber}/`);

  const result = await processAudioFile(recording.s3Key, folderNumber);
  const updated = await storage.updateRecording(recordingId, {
    processedFolder: result.processedFolder,
    wavS3Key: result.wavS3Key,
  });

  return updated;
}

/** Convert onboarding sample WebM → WAV in-place (same S3 folder, no processed/ copy) */
export async function processOnboardingSample(sampleId: string) {
  const sample = await storage.getOnboardingSampleById(sampleId);
  if (!sample) {
    throw new Error(`Onboarding sample not found: ${sampleId}`);
  }

  if (sample.wavS3Key) {
    console.log(`Sample ${sampleId} already converted: ${sample.wavS3Key}`);
    return sample;
  }

  // Place WAV next to the WebM: onboarding-samples/{userId}/0.webm → 0.wav
  const wavS3Key = sample.s3Key.replace(/\.webm$/, ".wav");
  console.log(`Converting onboarding sample ${sampleId}: ${sample.s3Key} → ${wavS3Key}`);

  const tmpDir = os.tmpdir();
  const webmPath = path.join(tmpDir, `sample-${sampleId}.webm`);
  const wavPath = path.join(tmpDir, `sample-${sampleId}.wav`);

  try {
    const webmBuffer = await downloadFromS3(sample.s3Key);
    fs.writeFileSync(webmPath, webmBuffer);
    console.log(`Downloaded ${webmBuffer.length} bytes`);

    await runFfmpeg([
      "-i", webmPath,
      "-ar", "48000",
      "-ac", "1",
      "-c:a", "pcm_s16le",
      wavPath,
    ]);

    const wavBuffer = fs.readFileSync(wavPath);
    console.log(`WAV conversion complete: ${wavBuffer.length} bytes`);

    await uploadBufferToS3(wavS3Key, wavBuffer, "audio/wav");
    console.log(`Uploaded WAV to S3: ${wavS3Key}`);

    const updated = await storage.updateOnboardingSample(sampleId, { wavS3Key });
    return updated;
  } finally {
    try { fs.rmSync(webmPath); } catch {}
    try { fs.rmSync(wavPath); } catch {}
  }
}
