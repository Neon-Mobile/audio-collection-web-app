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

export async function processRecording(recordingId: string) {
  const recording = await storage.getRecordingById(recordingId);
  if (!recording) {
    throw new Error(`Recording not found: ${recordingId}`);
  }

  if (recording.processedFolder) {
    console.log(`Recording ${recordingId} already processed in folder ${recording.processedFolder}`);
    return recording;
  }

  // Determine next folder number
  const count = await storage.getProcessedRecordingCount();
  const folderNumber = String(count + 1).padStart(4, "0");
  const folderPrefix = `processed/${folderNumber}`;

  console.log(`Processing recording ${recordingId} → ${folderPrefix}/`);

  // Download WebM from S3 to temp
  const tmpDir = os.tmpdir();
  const webmPath = path.join(tmpDir, `recording-${recordingId}.webm`);
  const wavPath = path.join(tmpDir, `recording-${recordingId}.wav`);

  try {
    const webmBuffer = await downloadFromS3(recording.s3Key);
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

    await copyInS3(recording.s3Key, webmS3Key);
    await uploadBufferToS3(wavS3Key, wavBuffer, "audio/wav");

    console.log(`Uploaded to S3: ${webmS3Key}, ${wavS3Key}`);

    // Update recording in DB
    const updated = await storage.updateRecording(recordingId, {
      processedFolder: folderNumber,
      wavS3Key,
    });

    return updated;
  } finally {
    // Clean up temp files
    try { fs.rmSync(webmPath); } catch {}
    try { fs.rmSync(wavPath); } catch {}
  }
}
