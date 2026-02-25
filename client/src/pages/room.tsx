import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuthContext } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { TASK_TYPES } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mic, MicOff, PhoneOff, Copy, ArrowLeft, Circle, Mail, Info, ChevronDown, ChevronUp } from "lucide-react";
import type { Room as RoomType } from "@shared/schema";
import DailyIframe, { type DailyCall, type DailyParticipant } from "@daily-co/daily-js";

type CallState = "idle" | "joining" | "joined" | "leaving" | "error";

interface Participant {
  id: string;
  isLocal: boolean;
  audioOn: boolean;
  userName: string;
}

interface TaskSession {
  id: string;
  taskType: string;
  userId: string;
  partnerId: string | null;
  status: string;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export default function RoomPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuthContext();
  const { toast } = useToast();

  const [callState, setCallState] = useState<CallState>("idle");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCloudRecording, setIsCloudRecording] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const callObjectRef = useRef<DailyCall | null>(null);
  const joinTimeRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Local recording state
  const [isLocalRecording, setIsLocalRecording] = useState(false);
  const [localRecordingDuration, setLocalRecordingDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const localRecordingStartRef = useRef<number | null>(null);
  const localDurationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [instructionsExpanded, setInstructionsExpanded] = useState(true);
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);

  const inviteMutation = useMutation({
    mutationFn: async ({ roomId, email }: { roomId: string; email: string }) => {
      const res = await apiRequest("POST", `/api/rooms/${roomId}/invite`, { email });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invitation sent", description: "Your partner will receive an email and in-app notification." });
      setInviteEmail("");
    },
    onError: (err: Error) => {
      toast({ title: "Invitation failed", description: err.message, variant: "destructive" });
    },
  });

  const { data: room, isLoading: roomLoading } = useQuery<RoomType>({
    queryKey: ["/api/rooms", roomId],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${roomId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Room not found");
      return res.json();
    },
    enabled: !!roomId,
  });

  // Fetch task session linked to this room
  const { data: taskSession } = useQuery<TaskSession | null>({
    queryKey: ["/api/rooms", roomId, "task-session"],
    queryFn: async () => {
      const res = await fetch(`/api/rooms/${roomId}/task-session`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!roomId,
  });

  const taskDef = taskSession ? TASK_TYPES.find((t) => t.id === taskSession.taskType) : null;

  const completeTaskMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiRequest("PATCH", `/api/task-sessions/${sessionId}/complete`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Task completed!", description: "Great work. Heading back to your dashboard." });
      setLocation("/");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to complete task", description: err.message, variant: "destructive" });
    },
  });

  const updateParticipants = useCallback((callObject: DailyCall) => {
    const daily = callObject.participants();
    const mapped: Participant[] = Object.entries(daily).map(([id, p]: [string, DailyParticipant]) => ({
      id,
      isLocal: p.local,
      audioOn: p.audio !== false,
      userName: p.user_name || (p.local ? "You" : `Participant ${id.slice(0, 4)}`),
    }));
    setParticipants(mapped);
  }, []);

  const joinCall = useCallback(async () => {
    if (!room) return;

    setCallState("joining");
    setError(null);

    try {
      const tokenRes = await apiRequest("POST", `/api/rooms/${roomId}/token`);
      const { token, roomUrl } = await tokenRes.json();

      const callObject = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: false,
        dailyConfig: {
          micAudioMode: {
            bitrate: 320000,
            stereo: false,
          },
          userMediaAudioConstraints: {
            sampleRate: 48000,
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        },
      });

      callObjectRef.current = callObject;

      callObject.on("joined-meeting", () => {
        setCallState("joined");
        joinTimeRef.current = Date.now();
        durationIntervalRef.current = setInterval(() => {
          if (joinTimeRef.current) {
            setCallDuration(Date.now() - joinTimeRef.current);
          }
        }, 1000);
        updateParticipants(callObject);
      });

      callObject.on("left-meeting", () => {
        setCallState("idle");
        cleanup();
      });

      callObject.on("error", (e) => {
        setError(e?.errorMsg || "Call error occurred");
        setCallState("error");
        cleanup();
      });

      callObject.on("participant-joined", () => updateParticipants(callObject));
      callObject.on("participant-updated", () => updateParticipants(callObject));
      callObject.on("participant-left", () => updateParticipants(callObject));

      callObject.on("recording-started", () => setIsCloudRecording(true));
      callObject.on("recording-stopped", () => setIsCloudRecording(false));
      callObject.on("recording-error", () => setIsCloudRecording(false));

      await callObject.join({ url: roomUrl, token });
    } catch (err: any) {
      setError(err.message || "Failed to join call");
      setCallState("error");
    }
  }, [room, roomId, updateParticipants]);

  const leaveCall = useCallback(async () => {
    setCallState("leaving");
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (callObjectRef.current) {
      await callObjectRef.current.leave();
      callObjectRef.current.destroy();
      callObjectRef.current = null;
    }
    cleanup();
    setCallState("idle");
  }, []);

  const cleanup = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (localDurationIntervalRef.current) {
      clearInterval(localDurationIntervalRef.current);
      localDurationIntervalRef.current = null;
    }
    joinTimeRef.current = null;
    setParticipants([]);
    setIsCloudRecording(false);
    setIsLocalRecording(false);
  }, []);

  const toggleMic = useCallback(() => {
    if (callObjectRef.current) {
      const newState = !isMicMuted;
      callObjectRef.current.setLocalAudio(!newState);
      setIsMicMuted(newState);
    }
  }, [isMicMuted]);

  // Local recording
  const startLocalRecording = useCallback(async () => {
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

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      recordingChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (localDurationIntervalRef.current) {
          clearInterval(localDurationIntervalRef.current);
          localDurationIntervalRef.current = null;
        }
        setIsLocalRecording(false);

        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          await uploadRecording(blob);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000); // collect data every second
      localRecordingStartRef.current = Date.now();
      setIsLocalRecording(true);
      setLocalRecordingDuration(0);

      localDurationIntervalRef.current = setInterval(() => {
        if (localRecordingStartRef.current) {
          setLocalRecordingDuration(Date.now() - localRecordingStartRef.current);
        }
      }, 100);

      toast({ title: "Recording started", description: "Local recording is active." });
    } catch (err: any) {
      toast({
        title: "Recording failed",
        description: err.message || "Could not start recording",
        variant: "destructive",
      });
    }
  }, [toast]);

  const stopLocalRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const uploadRecording = async (blob: Blob) => {
    if (!roomId) return;
    setIsUploading(true);

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `local-recording-${timestamp}.webm`;

      const urlRes = await apiRequest("POST", "/api/recordings/upload-url", {
        roomId,
        fileName,
        duration: localRecordingDuration,
        fileSize: blob.size,
        format: "webm",
        sampleRate: 48000,
        channels: 1,
        recordingType: "local",
      });
      const { uploadUrl, recordingId: recId } = await urlRes.json();

      await fetch(uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": "audio/webm" },
      });

      // Trigger server-side WebM → WAV conversion
      toast({ title: "Recording uploaded", description: "Converting to WAV..." });
      const processRes = await apiRequest("POST", `/api/recordings/${recId}/process`);
      const { processedFolder } = await processRes.json();
      toast({ title: "Recording processed", description: `Saved to folder ${processedFolder} as WAV.` });

      // Show completion dialog if this room is linked to a task
      if (taskSession) {
        setShowCompletionDialog(true);
      }
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err.message || "Could not upload recording",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const copyRoomLink = () => {
    const url = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: "Room link copied to clipboard." });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (callObjectRef.current) {
        callObjectRef.current.leave().catch(() => {});
        callObjectRef.current.destroy();
      }
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      if (localDurationIntervalRef.current) clearInterval(localDurationIntervalRef.current);
    };
  }, []);

  if (roomLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <CardTitle>Room Not Found</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => setLocation("/")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isExpired = new Date(room.expiresAt) < new Date();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-semibold">{taskDef ? taskDef.name : room.name}</h1>
            <p className="text-xs text-muted-foreground">
              {callState === "joined" && `${formatDuration(callDuration)} elapsed`}
              {callState === "idle" && (isExpired ? "Room expired" : "Ready to join")}
              {callState === "joining" && "Connecting..."}
              {callState === "leaving" && "Leaving..."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isCloudRecording && (
            <Badge variant="destructive" className="animate-pulse gap-1">
              <Circle className="h-2 w-2 fill-current" />
              Cloud Recording
            </Badge>
          )}
          {isLocalRecording && (
            <Badge variant="outline" className="gap-1 border-red-500 text-red-500">
              <Circle className="h-2 w-2 fill-current" />
              Local {formatDuration(localRecordingDuration)}
            </Badge>
          )}
          {isUploading && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Uploading
            </Badge>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
        {callState === "idle" || callState === "error" ? (
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle>{error ? "Call Error" : isExpired ? "Room Expired" : "Join Call"}</CardTitle>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardHeader>
            <CardContent className="flex flex-col gap-3 items-center">
              {!isExpired && (
                <>
                  <Button size="lg" onClick={joinCall} className="w-full max-w-xs">
                    {error ? "Retry" : "Join Audio Call"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    <Info className="inline h-3 w-3 mr-1" />
                    Your audio is not recorded until you press the Record button
                  </p>
                </>
              )}
              <Button variant="outline" size="sm" onClick={copyRoomLink}>
                <Copy className="mr-2 h-4 w-4" />
                Copy Room Link
              </Button>
              {room.createdBy === user?.id && !isExpired && (
                <>
                  <Separator className="my-3" />
                  <div className="w-full max-w-xs space-y-2">
                    <Label className="text-sm">Invite a partner by email</Label>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="partner@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => inviteMutation.mutate({ roomId: roomId!, email: inviteEmail })}
                        disabled={inviteMutation.isPending || !inviteEmail}
                      >
                        {inviteMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Mail className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ) : callState === "joining" ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Connecting to call...</p>
          </div>
        ) : (
          /* Joined state */
          <div className="w-full max-w-3xl space-y-4">
            {/* Task Instructions Panel */}
            {taskDef && (
              <Card>
                <CardHeader
                  className="py-3 px-4 cursor-pointer"
                  onClick={() => setInstructionsExpanded(!instructionsExpanded)}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      Task: {taskDef.name}
                    </CardTitle>
                    {instructionsExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </CardHeader>
                {instructionsExpanded && (
                  <CardContent className="pt-0 pb-4 px-4 space-y-3">
                    <p className="text-xs text-muted-foreground">{taskDef.description}</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                      {taskDef.instructions.map((instruction, i) => (
                        <li key={i}>{instruction}</li>
                      ))}
                    </ol>
                    <div className="flex items-start gap-2 p-2 rounded bg-blue-50 dark:bg-blue-950/30 text-xs text-blue-700 dark:text-blue-300">
                      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>Recording does not start until you press the Record button. Press Stop when you're done.</span>
                    </div>
                  </CardContent>
                )}
              </Card>
            )}

            {/* Participant grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {participants.map((p) => (
                <Card key={p.id} className={`text-center ${p.isLocal ? "border-primary" : ""}`}>
                  <CardContent className="pt-6 pb-4">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-2">
                      <span className="text-2xl font-semibold text-muted-foreground">
                        {p.userName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate">{p.userName}</p>
                    <div className="mt-1">
                      {p.audioOn ? (
                        <Mic className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <MicOff className="h-4 w-4 text-muted-foreground mx-auto" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Controls bar */}
      {callState === "joined" && (
        <footer className="border-t px-4 py-4">
          <div className="flex items-center justify-center gap-4">
            <Button
              variant={isMicMuted ? "destructive" : "secondary"}
              size="lg"
              onClick={toggleMic}
              className="rounded-full h-14 w-14 p-0"
            >
              {isMicMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>

            <Button variant="outline" size="sm" onClick={copyRoomLink}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Link
            </Button>

            {isLocalRecording ? (
              <Button variant="outline" size="sm" onClick={stopLocalRecording} className="border-red-500 text-red-500">
                <Circle className="mr-2 h-3 w-3 fill-red-500" />
                Stop Recording
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={startLocalRecording} disabled={isUploading}>
                <Circle className="mr-2 h-3 w-3" />
                Record
              </Button>
            )}

            <Button
              variant="destructive"
              size="lg"
              onClick={leaveCall}
              className="rounded-full h-14 w-14 p-0"
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
          </div>
        </footer>
      )}

      {/* Task Completion Dialog */}
      <AlertDialog open={showCompletionDialog} onOpenChange={setShowCompletionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recording saved!</AlertDialogTitle>
            <AlertDialogDescription>
              Is this task complete, or do you want to record again?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Going</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (taskSession) {
                  completeTaskMutation.mutate(taskSession.id);
                }
              }}
              disabled={completeTaskMutation.isPending}
            >
              {completeTaskMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Mark Task Complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
