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
      // Wait before retry: 1s, 2s, 4s
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
  }
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
  const partnerLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [hasRemoteParticipant, setHasRemoteParticipant] = useState(false);

  // Local mic recorder (used by both creator and partner — each records their own mic)
  const localRecorderRef = useRef<MediaRecorder | null>(null);
  const localChunksRef = useRef<Blob[]>([]);
  const localBlobRef = useRef<Blob | null>(null);

  const recordingStartRef = useRef<number | null>(null);
  const finalDurationRef = useRef<number>(0);
  const recordingDurationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Partner's recording ID (creator receives this after partner uploads their track)
  const partnerRecordingIdRef = useRef<string | null>(null);
  // Ref for app-message handler to avoid stale closures
  const messageHandlerRef = useRef<(msg: any) => void>(() => {});

  // Audio elements for playing remote participants' audio
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const [inviteEmail, setInviteEmail] = useState("");
  const [instructionsExpanded, setInstructionsExpanded] = useState(true);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [failedUploadBlobs, setFailedUploadBlobs] = useState<{ local: Blob } | null>(null);
  const hasRecordedRef = useRef(false);
  const [blobsReady, setBlobsReady] = useState(false);

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
    onSuccess: async () => {
      if (callObjectRef.current) {
        await callObjectRef.current.leave();
        callObjectRef.current.destroy();
        callObjectRef.current = null;
      }
      cleanup();
      setCallState("idle");
      toast({ title: "Recording submitted!", description: "Your recording has been submitted for review." });
      setLocation("/");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to complete task", description: err.message, variant: "destructive" });
    },
  });

  const cancelTaskMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiRequest("PATCH", `/api/task-sessions/${sessionId}/cancel`);
      return res.json();
    },
    onSuccess: async () => {
      if (callObjectRef.current) {
        await callObjectRef.current.leave();
        callObjectRef.current.destroy();
        callObjectRef.current = null;
      }
      cleanup();
      setCallState("idle");
      toast({ title: "Task cancelled", description: "You can start a new session from the dashboard." });
      setLocation("/");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to cancel task", description: err.message, variant: "destructive" });
    },
  });

  // Handle remote audio track started — create <audio> element to play it
  const handleTrackStarted = useCallback((event: any) => {
    if (!event?.participant || event.participant.local) return;
    if (event.track?.kind !== "audio") return;

    const participantId = event.participant.session_id;
    const track = event.track as MediaStreamTrack;

    let audioEl = audioElementsRef.current.get(participantId);
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioElementsRef.current.set(participantId, audioEl);
    }
    audioEl.srcObject = new MediaStream([track]);
    console.log(`Playing remote audio for participant ${participantId}`);

    setHasRemoteParticipant(true);
  }, []);

  // Handle remote audio track stopped — clean up <audio> element
  const handleTrackStopped = useCallback((event: any) => {
    if (!event?.participant || event.participant.local) return;
    if (event.track?.kind !== "audio") return;

    const participantId = event.participant.session_id;
    const audioEl = audioElementsRef.current.get(participantId);
    if (audioEl) {
      audioEl.srcObject = null;
      audioElementsRef.current.delete(participantId);
    }
  }, []);

  const updateParticipants = useCallback((callObject: DailyCall) => {
    const daily = callObject.participants();
    const mapped: Participant[] = Object.entries(daily).map(([id, p]: [string, DailyParticipant]) => ({
      id,
      isLocal: p.local,
      audioOn: p.audio !== false,
      userName: p.user_name || (p.local ? "You" : `Participant ${id.slice(0, 4)}`),
    }));
    setParticipants(mapped);

    // Sync local mic muted state from Daily's actual state
    const localP = Object.values(daily).find((p: DailyParticipant) => p.local);
    if (localP) {
      setIsMicMuted(localP.audio === false);
    }

    // Check if any remote participant has playable audio
    const hasRemote = Object.values(daily).some(
      (p: DailyParticipant) => !p.local && (p.tracks?.audio?.state === "playable" || audioElementsRef.current.has(p.session_id))
    );
    setHasRemoteParticipant(hasRemote);
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

      callObject.on("participant-joined", () => {
        updateParticipants(callObject);
        // Partner reconnected — cancel any pending leave timer
        if (partnerLeaveTimerRef.current) {
          clearTimeout(partnerLeaveTimerRef.current);
          partnerLeaveTimerRef.current = null;
          toast({ title: "Partner reconnected", description: "Connection restored." });
        }
      });
      callObject.on("participant-updated", () => updateParticipants(callObject));
      callObject.on("participant-left", (event) => {
        updateParticipants(callObject);
        // If partner left, wait 30s before leaving (they may reconnect)
        const remaining = callObject.participants();
        const remoteCount = Object.values(remaining).filter((p: DailyParticipant) => !p.local).length;
        if (remoteCount === 0 && event?.participant && !event.participant.local) {
          toast({ title: "Partner disconnected", description: "Waiting 30 seconds for them to reconnect..." });
          partnerLeaveTimerRef.current = setTimeout(() => {
            partnerLeaveTimerRef.current = null;
            // Check again — they may have rejoined
            const current = callObject.participants();
            const stillAlone = Object.values(current).filter((p: DailyParticipant) => !p.local).length === 0;
            if (stillAlone) {
              callObject.leave().then(() => {
                callObject.destroy();
                callObjectRef.current = null;
              }).catch(() => {});
              cleanup();
              setCallState("idle");
              toast({ title: "Partner left", description: "Your partner did not reconnect." });
              setLocation("/");
            }
          }, 30000);
        }
      });

      // Play remote audio via track-started/stopped events
      callObject.on("track-started", handleTrackStarted);
      callObject.on("track-stopped", handleTrackStopped);

      callObject.on("recording-started", () => setIsCloudRecording(true));
      callObject.on("recording-stopped", () => setIsCloudRecording(false));
      callObject.on("recording-error", () => setIsCloudRecording(false));

      // Handle messages from other participants (recording commands, upload notifications)
      callObject.on("app-message", (msg: any) => {
        messageHandlerRef.current(msg);
      });

      await callObject.join({ url: roomUrl, token });
    } catch (err: any) {
      setError(err.message || "Failed to join call");
      setCallState("error");
    }
  }, [room, roomId, updateParticipants, handleTrackStarted, handleTrackStopped]);

  const leaveCall = useCallback(async () => {
    setCallState("leaving");
    if (localRecorderRef.current && localRecorderRef.current.state !== "inactive") {
      localRecorderRef.current.stop();
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
    if (recordingDurationIntervalRef.current) {
      clearInterval(recordingDurationIntervalRef.current);
      recordingDurationIntervalRef.current = null;
    }
    if (partnerLeaveTimerRef.current) {
      clearTimeout(partnerLeaveTimerRef.current);
      partnerLeaveTimerRef.current = null;
    }
    // Clean up remote audio elements
    audioElementsRef.current.forEach((audioEl) => {
      audioEl.srcObject = null;
    });
    audioElementsRef.current.clear();
    joinTimeRef.current = null;
    setParticipants([]);
    setIsCloudRecording(false);
    setIsRecording(false);
  }, []);

  const toggleMic = useCallback(() => {
    if (callObjectRef.current) {
      const newState = !isMicMuted;
      callObjectRef.current.setLocalAudio(!newState);
      setIsMicMuted(newState);
    }
  }, [isMicMuted]);

  // Upload creator's recording and process both tracks
  const uploadRecordings = useCallback(async (localBlob: Blob) => {
    if (!roomId) return;
    setIsUploading(true);
    setFailedUploadBlobs(null);

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const duration = finalDurationRef.current;

      // Upload creator's local track
      const localUrlRes = await apiRequest("POST", "/api/recordings/upload-url", {
        roomId,
        fileName: `local-${timestamp}.webm`,
        duration,
        fileSize: localBlob.size,
        format: "webm",
        sampleRate: 48000,
        channels: 1,
        recordingType: "local",
        speakerId: "spk0",
      });
      const { uploadUrl: localUploadUrl, recordingId: localRecId } = await localUrlRes.json();
      await uploadToS3WithRetry(localUploadUrl, localBlob, "audio/webm");

      // Process creator's track (creates the folder number)
      toast({ title: "Recording uploaded", description: "Processing audio..." });
      const processRes = await apiRequest("POST", `/api/recordings/${localRecId}/process`);
      const { processedFolder } = await processRes.json();

      // Process partner's track into the same folder (if partner uploaded)
      const partnerRecId = partnerRecordingIdRef.current;
      if (partnerRecId) {
        await apiRequest("POST", `/api/recordings/${partnerRecId}/process`, { folderNumber: processedFolder });
      }

      toast({ title: "Recordings processed", description: `Tracks saved to folder ${processedFolder}.` });

      // Auto-complete task and leave call
      if (taskSession) {
        completeTaskMutation.mutate(taskSession.id);
      } else {
        if (callObjectRef.current) {
          await callObjectRef.current.leave();
          callObjectRef.current.destroy();
          callObjectRef.current = null;
        }
        cleanup();
        setCallState("idle");
      }
    } catch (err: any) {
      setFailedUploadBlobs({ local: localBlob });
      toast({
        title: "Upload failed",
        description: err.message || "Could not upload recordings. You can retry without re-recording.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [roomId, taskSession, toast]);

  // Triggered by "End Call & Submit" button (creator only)
  const submitAndEndCall = useCallback(() => {
    const localBlob = localBlobRef.current;
    localBlobRef.current = null;

    if (localBlob && localBlob.size > 0) {
      uploadRecordings(localBlob);
    }
  }, [uploadRecordings]);

  // Helper: start recording own local mic (used by both creator and partner)
  const startLocalMicRecording = useCallback(async (): Promise<boolean> => {
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      localStreamRef.current = localStream;

      const localRecorder = new MediaRecorder(localStream, { mimeType });
      localChunksRef.current = [];

      localRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) localChunksRef.current.push(e.data);
      };
      localRecorder.onstop = () => {
        localStream.getTracks().forEach((t) => t.stop());
        localBlobRef.current = new Blob(localChunksRef.current, { type: mimeType });
      };
      localRecorderRef.current = localRecorder;
      localRecorder.start(1000);

      recordingStartRef.current = Date.now();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingDurationIntervalRef.current = setInterval(() => {
        if (recordingStartRef.current) {
          setRecordingDuration(Date.now() - recordingStartRef.current);
        }
      }, 100);
      return true;
    } catch (err: any) {
      toast({
        title: "Recording failed",
        description: err.message || "Could not start recording",
        variant: "destructive",
      });
      return false;
    }
  }, [toast]);

  // Helper: stop local mic recording and compute duration
  const stopLocalMicRecording = useCallback(() => {
    if (recordingDurationIntervalRef.current) {
      clearInterval(recordingDurationIntervalRef.current);
      recordingDurationIntervalRef.current = null;
    }
    finalDurationRef.current = recordingStartRef.current ? Date.now() - recordingStartRef.current : 0;
    setIsRecording(false);

    if (localRecorderRef.current && localRecorderRef.current.state !== "inactive") {
      localRecorderRef.current.stop();
    }
  }, []);

  // Creator: start recording + tell partner to record their mic too
  const startRecording = useCallback(async () => {
    if (!callObjectRef.current) return;

    localBlobRef.current = null;
    partnerRecordingIdRef.current = null;

    const ok = await startLocalMicRecording();
    if (!ok) return;

    hasRecordedRef.current = true;

    // Tell partner to start recording their own mic
    callObjectRef.current.sendAppMessage({ type: "start-recording" });
    toast({
      title: "Recording started",
      description: "Both participants are now recording.",
    });
  }, [toast, startLocalMicRecording]);

  // Creator: stop recording + tell partner to stop and upload
  const stopRecording = useCallback(() => {
    stopLocalMicRecording();
    setBlobsReady(true);

    // Tell partner to stop recording and upload their track
    if (callObjectRef.current) {
      callObjectRef.current.sendAppMessage({ type: "stop-recording" });
    }
  }, [stopLocalMicRecording]);

  // Partner: upload their local recording as spk1
  const uploadPartnerRecording = useCallback(async () => {
    // Wait for blob from onstop handler
    const start = Date.now();
    while (!localBlobRef.current && Date.now() - start < 5000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    const blob = localBlobRef.current;
    if (!blob || blob.size === 0 || !roomId) return;

    try {
      const duration = finalDurationRef.current;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const urlRes = await apiRequest("POST", "/api/recordings/upload-url", {
        roomId,
        fileName: `partner-${timestamp}.webm`,
        duration,
        fileSize: blob.size,
        format: "webm",
        sampleRate: 48000,
        channels: 1,
        recordingType: "remote",
        speakerId: "spk1",
      });
      const { uploadUrl, recordingId } = await urlRes.json();
      await uploadToS3WithRetry(uploadUrl, blob, "audio/webm");

      // Tell creator our recording ID so they can process it
      if (callObjectRef.current) {
        callObjectRef.current.sendAppMessage({ type: "partner-upload-complete", recordingId });
      }
      toast({ title: "Recording uploaded", description: "Your recording has been saved." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
  }, [roomId, toast]);

  // App-message handler — kept in ref to avoid stale closures
  useEffect(() => {
    messageHandlerRef.current = (msg: any) => {
      const data = msg?.data;
      if (!data?.type) return;

      const isCreator = room?.createdBy === user?.id;

      if (data.type === "start-recording" && !isCreator) {
        // Partner: start recording own mic
        localBlobRef.current = null;
        startLocalMicRecording().then((ok) => {
          if (ok) {
            hasRecordedRef.current = true;
            toast({ title: "Recording started", description: "Your partner started the recording." });
          }
        });
      } else if (data.type === "stop-recording" && !isCreator) {
        // Partner: stop recording and upload
        stopLocalMicRecording();
        toast({ title: "Recording stopped", description: "Uploading your audio..." });
        uploadPartnerRecording();
      } else if (data.type === "partner-upload-complete" && isCreator && data.recordingId) {
        // Creator: store partner's recording ID for processing
        partnerRecordingIdRef.current = data.recordingId;
      }
    };
  }, [room, user, startLocalMicRecording, stopLocalMicRecording, uploadPartnerRecording, toast]);

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
      if (recordingDurationIntervalRef.current) clearInterval(recordingDurationIntervalRef.current);
      if (partnerLeaveTimerRef.current) clearTimeout(partnerLeaveTimerRef.current);
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
      <header className="border-b bg-card/80 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
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
          {isRecording && (
            <Badge variant="outline" className="gap-1 border-red-500 text-red-500">
              <Circle className="h-2 w-2 fill-current" />
              REC {formatDuration(recordingDuration)}
            </Badge>
          )}
          {isUploading && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processing
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
                      <span>Recording does not start until you press the Record button. Both participants are recorded as separate tracks.</span>
                    </div>
                  </CardContent>
                )}
              </Card>
            )}

            {/* Recording notice */}
            {!isRecording && (
              <div className="flex items-center gap-3 p-4 rounded-lg border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700">
                <Info className="h-5 w-5 text-amber-600 shrink-0" />
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  You are not being recorded. Recording only starts when {room.createdBy === user?.id ? 'you press' : 'your partner presses'} <strong>"Record Both"</strong>{room.createdBy === user?.id ? ' below' : ''}.
                </p>
              </div>
            )}

            {/* Participant grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {participants.map((p) => (
                <Card key={p.id} className={`text-center transition-all ${p.isLocal ? "border-primary/30 shadow-md" : "hover:shadow-md"}`}>
                  <CardContent className="pt-6 pb-4">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2 ${p.isLocal ? "bg-primary/10" : "bg-muted"}`}>
                      <span className={`text-2xl font-semibold ${p.isLocal ? "text-primary" : "text-muted-foreground"}`}>
                        {p.userName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate">{p.userName}</p>
                    <div className="mt-1.5">
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
        <footer className="border-t bg-card/80 backdrop-blur-sm px-4 py-4">
          <div className="flex items-center justify-center gap-3">
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

            {isRecording && room.createdBy === user?.id ? (
              <Button variant="outline" size="sm" onClick={stopRecording} className="border-red-500 text-red-500">
                <Circle className="mr-2 h-3 w-3 fill-red-500" />
                Stop Recording
              </Button>
            ) : isRecording ? (
              null /* Partner sees REC badge in header; no stop button */
            ) : failedUploadBlobs ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => uploadRecordings(failedUploadBlobs.local)}
                disabled={isUploading}
                className="border-orange-500 text-orange-500"
              >
                <Loader2 className={`mr-2 h-3 w-3 ${isUploading ? "animate-spin" : "hidden"}`} />
                Retry Upload
              </Button>
            ) : !blobsReady ? (
              <Button
                variant="outline"
                size="sm"
                onClick={startRecording}
                disabled={isUploading || !hasRemoteParticipant || room.createdBy !== user?.id}
                title={
                  room.createdBy !== user?.id
                    ? "Only the room creator can start recording"
                    : !hasRemoteParticipant
                      ? "Waiting for partner to join with audio"
                      : undefined
                }
              >
                <Circle className="mr-2 h-3 w-3" />
                Record Both
              </Button>
            ) : null}

            {blobsReady && !failedUploadBlobs ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={submitAndEndCall}
                disabled={isUploading || completeTaskMutation.isPending}
              >
                {isUploading || completeTaskMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PhoneOff className="mr-2 h-4 w-4" />
                )}
                End Call & Submit
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (taskSession && !hasRecordedRef.current) {
                    setShowCancelDialog(true);
                  } else {
                    leaveCall();
                  }
                }}
                disabled={isUploading || isRecording}
              >
                <PhoneOff className="mr-2 h-4 w-4" />
                End Call
              </Button>
            )}
          </div>
          {!hasRemoteParticipant && !isRecording && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Waiting for your partner to join before recording...
            </p>
          )}
        </footer>
      )}

      {/* Cancel Task Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End task without recording?</AlertDialogTitle>
            <AlertDialogDescription>
              You haven't made a recording yet. This will cancel the current task so you can start over and invite a new partner if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (taskSession) {
                  cancelTaskMutation.mutate(taskSession.id);
                }
              }}
              disabled={cancelTaskMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelTaskMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              End Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
