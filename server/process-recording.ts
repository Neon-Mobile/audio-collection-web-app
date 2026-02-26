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

/** Shared core: download WebM from S3, convert to WAV, upload both to processed/{folderName}/ */
async function processAudioFile(
  s3Key: string,
  folderName: string,
  folderNumber: string,
  speakerId?: string,
): Promise<{ processedFolder: string; webmS3Key: string; wavS3Key: string }> {
  const folderPrefix = `processed/${folderName}`;
  const fileStem = speakerId ? `${folderNumber}_${speakerId}` : folderNumber;
  const tmpDir = os.tmpdir();
  const webmPath = path.join(tmpDir, `audio-${fileStem}-${Date.now()}.webm`);
  const wavPath = path.join(tmpDir, `audio-${fileStem}-${Date.now()}.wav`);

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
    const webmS3Key = `${folderPrefix}/${fileStem}.webm`;
    const wavS3Key = `${folderPrefix}/${fileStem}.wav`;

    await copyInS3(s3Key, webmS3Key);
    await uploadBufferToS3(wavS3Key, wavBuffer, "audio/wav");

    console.log(`Uploaded to S3: ${webmS3Key}, ${wavS3Key}`);

    return { processedFolder: folderName, webmS3Key, wavS3Key };
  } finally {
    try { fs.rmSync(webmPath); } catch {}
    try { fs.rmSync(wavPath); } catch {}
  }
}

async function getNextFolderNumber(): Promise<string> {
  const max = await storage.getMaxProcessedFolderNumber();
  return String(max + 1).padStart(4, "0");
}

export async function processRecording(recordingId: string, overrideFolderNumber?: string) {
  const recording = await storage.getRecordingById(recordingId);
  if (!recording) {
    throw new Error(`Recording not found: ${recordingId}`);
  }

  if (recording.processedFolder) {
    console.log(`Recording ${recordingId} already processed in folder ${recording.processedFolder}`);
    return recording;
  }

  // Check if another recording from the same room was already processed — reuse its folder
  const siblingRecordings = await storage.getRecordingsByRoom(recording.roomId);
  const sibling = siblingRecordings.find(r => r.id !== recordingId && r.processedFolder);

  let folderName: string;
  let folderNumber: string;

  if (sibling?.processedFolder) {
    folderName = sibling.processedFolder;
    folderNumber = folderName.match(/^(\d+)/)?.[1] ?? folderName;
    console.log(`Reusing folder from sibling recording: ${folderName}`);
  } else {
    folderNumber = overrideFolderNumber || await getNextFolderNumber();

    // Build folder name with both participants' short keys
    folderName = folderNumber;
    try {
      const sessions = await storage.getTaskSessionsByRoom(recording.roomId);
      const session = sessions[0];
      if (session) {
        const userIds = [session.userId, session.partnerId].filter(Boolean) as string[];
        const shortKeys: string[] = [];
        for (const uid of userIds) {
          const u = await storage.getUserById(uid);
          if (u?.shortKey) shortKeys.push(u.shortKey);
        }
        if (shortKeys.length > 0) {
          shortKeys.sort();
          folderName = `${folderNumber}_${shortKeys.join("_")}`;
        }
      }
    } catch (err) {
      console.warn("Could not resolve participant keys for folder name:", err);
    }
  }

  console.log(`Processing recording ${recordingId} → processed/${folderName}/`);

  const result = await processAudioFile(recording.s3Key, folderName, folderNumber, recording.speakerId ?? undefined);
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
