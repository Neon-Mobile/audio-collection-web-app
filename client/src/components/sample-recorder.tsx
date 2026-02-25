import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, ArrowLeft, ChevronRight, Check, Mic } from "lucide-react";
import { ONBOARDING_PROMPTS } from "@shared/schema";

type RecorderState = "idle" | "recording" | "between" | "uploading" | "done" | "error";

interface SampleRecorderProps {
  onComplete: () => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function SampleRecorder({ onComplete }: SampleRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [currentPromptIndex, setCurrentPromptIndex] = useState(-1);
  const [countdown, setCountdown] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const streamRef = useRef<MediaStream | null>(null);
  const blobsRef = useRef<Blob[]>([]);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const recordPrompt = useCallback(
    (stream: MediaStream, duration: number): Promise<Blob> => {
      return new Promise((resolve, reject) => {
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";

        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: mimeType }));
        };

        recorder.onerror = (e) => {
          reject(new Error("Recording error"));
        };

        recorder.start(500); // collect data every 500ms

        // Countdown timer
        let remaining = duration;
        setCountdown(remaining);
        countdownRef.current = setInterval(() => {
          remaining--;
          setCountdown(Math.max(0, remaining));
        }, 1000);

        setTimeout(() => {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        }, duration * 1000);
      });
    },
    [],
  );

  const startRecording = useCallback(async () => {
    setState("recording");
    setErrorMessage(null);
    blobsRef.current = [];

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

      for (let i = 0; i < ONBOARDING_PROMPTS.length; i++) {
        const prompt = ONBOARDING_PROMPTS[i];
        setCurrentPromptIndex(i);
        setState("recording");

        const blob = await recordPrompt(stream, prompt.duration);
        blobsRef.current.push(blob);

        // Brief pause between prompts (except after last)
        if (i < ONBOARDING_PROMPTS.length - 1) {
          setState("between");
          await sleep(1000);
        }
      }

      // Stop stream
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      // Upload all samples
      setState("uploading");
      setUploadProgress(0);

      for (let i = 0; i < blobsRef.current.length; i++) {
        const blob = blobsRef.current[i];
        const prompt = ONBOARDING_PROMPTS[i];

        // Get presigned URL
        const urlRes = await apiRequest("POST", "/api/onboarding/sample-upload-url", {
          promptIndex: i,
          promptText: prompt.text,
          fileName: `sample-${i}.webm`,
          duration: prompt.duration * 1000,
          fileSize: blob.size,
        });
        const { uploadUrl, sampleId } = await urlRes.json();

        // Upload to S3
        await fetch(uploadUrl, {
          method: "PUT",
          body: blob,
          headers: { "Content-Type": "audio/webm" },
        });

        // Process WebM → WAV
        await apiRequest("POST", `/api/onboarding/samples/${sampleId}/process`);

        setUploadProgress(Math.round(((i + 1) / blobsRef.current.length) * 100));
      }

      setState("done");
      toast({
        title: "Samples recorded",
        description: "All audio samples have been uploaded and processed.",
      });

      // Signal completion to parent
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
  }, [recordPrompt, cleanup, onComplete, toast]);

  const isActive = state === "recording" || state === "between";

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Record a Sample</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Prompt list */}
        <Card className="border">
          <CardContent className="p-4 space-y-3">
            {ONBOARDING_PROMPTS.map((prompt, i) => {
              const isCurrentPrompt = isActive && i === currentPromptIndex;
              const isCompleted = isActive && i < currentPromptIndex;
              const isDone = state === "uploading" || state === "done";

              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                    isCurrentPrompt
                      ? "bg-primary/10 ring-2 ring-primary/30"
                      : isCompleted || isDone
                        ? "bg-muted/50"
                        : "bg-muted/20"
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                      isCurrentPrompt
                        ? "bg-primary text-primary-foreground"
                        : isCompleted || isDone
                          ? "bg-green-500 text-white"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isCurrentPrompt ? (
                      `${countdown}s`
                    ) : isCompleted || isDone ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      `${prompt.duration}s`
                    )}
                  </div>
                  <span
                    className={`text-sm pt-2 ${
                      isCurrentPrompt ? "font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {prompt.text}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Upload progress */}
        {state === "uploading" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading and processing samples...
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

          {isActive && (
            <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              Recording...
            </div>
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
