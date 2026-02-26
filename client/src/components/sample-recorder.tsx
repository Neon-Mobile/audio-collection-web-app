import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, ArrowLeft, ChevronRight, Mic } from "lucide-react";
import { ONBOARDING_PROMPTS } from "@shared/schema";

async function uploadToS3WithRetry(
  url: string,
  body: Blob,
  contentType: string,
  maxRetries = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "PUT",
        body,
        headers: { "Content-Type": contentType },
      });
      if (res.ok) return;
      throw new Error(`S3 upload returned ${res.status}: ${res.statusText}`);
    } catch (err: any) {
      if (attempt === maxRetries) {
        throw new Error(`Upload failed after ${maxRetries} attempts: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
  }
}

type RecorderState = "idle" | "recording" | "uploading" | "done" | "error";

interface SampleRecorderProps {
  onComplete: () => void;
}

export default function SampleRecorder({ onComplete }: SampleRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [countdown, setCountdown] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
      recorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    setState("recording");
    setErrorMessage(null);

    const prompt = ONBOARDING_PROMPTS[0];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const blobPromise = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: mimeType }));
        };
        recorder.onerror = () => reject(new Error("Recording error"));
      });

      recorder.start(500);

      // Countdown timer
      let remaining = prompt.duration;
      setCountdown(remaining);
      countdownRef.current = setInterval(() => {
        remaining--;
        setCountdown(Math.max(0, remaining));
      }, 1000);

      // Auto-stop after duration
      setTimeout(() => {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }, prompt.duration * 1000);

      const blob = await blobPromise;

      // Stop stream
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;

      // Upload
      setState("uploading");
      setUploadProgress(0);

      const urlRes = await apiRequest("POST", "/api/onboarding/sample-upload-url", {
        promptIndex: 0,
        promptText: prompt.text,
        fileName: "sample-0.webm",
        duration: prompt.duration * 1000,
        fileSize: blob.size,
      });
      const { uploadUrl, sampleId } = await urlRes.json();

      await uploadToS3WithRetry(uploadUrl, blob, "audio/webm");
      setUploadProgress(50);

      // Process WebM -> WAV
      await apiRequest("POST", `/api/onboarding/samples/${sampleId}/process`);
      setUploadProgress(100);

      setState("done");
      toast({
        title: "Sample recorded",
        description: "Your voice sample has been uploaded and processed.",
      });

      await onComplete();
    } catch (err: any) {
      cleanup();
      setErrorMessage(err.message || "Recording failed");
      setState("error");
      toast({
        title: "Recording failed",
        description: err.message || "Could not complete recording",
        variant: "destructive",
      });
    }
  }, [cleanup, onComplete, toast]);

  const prompt = ONBOARDING_PROMPTS[0];

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Record a Voice Sample</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Prompt */}
        <Card className="border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{prompt.text}</p>
          </CardContent>
        </Card>

        {/* Recording countdown */}
        {state === "recording" && (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="text-sm text-muted-foreground">Recording...</span>
            </div>
            <div className="text-3xl font-mono font-bold tabular-nums">{countdown}s</div>
            <Progress value={((prompt.duration - countdown) / prompt.duration) * 100} />
          </div>
        )}

        {/* Upload progress */}
        {state === "uploading" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading and processing...
            </div>
            <Progress value={uploadProgress} />
          </div>
        )}

        {/* Error message */}
        {state === "error" && errorMessage && (
          <p className="text-sm text-destructive text-center">{errorMessage}</p>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          {(state === "idle" || state === "error") && (
            <>
              <Button
                variant="outline"
                onClick={() => window.history.back()}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={startRecording}
                className="flex-1 flex items-center justify-center gap-2"
                size="lg"
              >
                <Mic className="h-4 w-4" />
                {state === "error" ? "Retry" : "Record"}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {state === "uploading" && (
            <Button disabled className="flex-1" size="lg">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
