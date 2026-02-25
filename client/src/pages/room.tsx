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

  // Dual-track recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoteRecording, setIsRemoteRecording] = useState(false);
  const [hasRemoteParticipant, setHasRemoteParticipant] = useState(false);

  // Local track recorder
  const localRecorderRef = useRef<MediaRecorder | null>(null);
  const localChunksRef = useRef<Blob[]>([]);
  const localBlobRef = useRef<Blob | null>(null);

  // Remote track recorder
  const remoteRecorderRef = useRef<MediaRecorder | null>(null);
  const remoteChunksRef = useRef<Blob[]>([]);
  const remoteBlobRef = useRef<Blob | null>(null);

  const recordingStartRef = useRef<number | null>(null);
  const recordingDurationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Track how many recorders have stopped (to wait for both before uploading)
  const stoppedCountRef = useRef(0);
  const expectedStopsRef = useRef(0);

  // Audio elements for playing remote participants' audio
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

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

      callObject.on("participant-joined", () => updateParticipants(callObject));
      callObject.on("participant-updated", () => updateParticipants(callObject));
      callObject.on("participant-left", () => updateParticipants(callObject));

      // Play remote audio via track-started/stopped events
      callObject.on("track-started", handleTrackStarted);
      callObject.on("track-stopped", handleTrackStopped);

      callObject.on("recording-started", () => setIsCloudRecording(true));
      callObject.on("recording-stopped", () => setIsCloudRecording(false));
      callObject.on("recording-error", () => setIsCloudRecording(false));

      // Listen for recording state messages from other participants
      callObject.on("app-message", (msg: any) => {
        if (msg?.data?.type === "recording-started") setIsRemoteRecording(true);
        if (msg?.data?.type === "recording-stopped") setIsRemoteRecording(false);
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
    if (remoteRecorderRef.current && remoteRecorderRef.current.state !== "inactive") {
      remoteRecorderRef.current.stop();
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
    // Clean up remote audio elements
    audioElementsRef.current.forEach((audioEl) => {
      audioEl.srcObject = null;
    });
    audioElementsRef.current.clear();
    joinTimeRef.current = null;
    setParticipants([]);
    setIsCloudRecording(false);
    setIsRecording(false);
    setIsRemoteRecording(false);
  }, []);

  const toggleMic = useCallback(() => {
    if (callObjectRef.current) {
      const newState = !isMicMuted;
      callObjectRef.current.setLocalAudio(!newState);
      setIsMicMuted(newState);
    }
  }, [isMicMuted]);

  // Upload both recordings to the same processed folder
  const uploadRecordings = useCallback(async (localBlob: Blob, remoteBlob: Blob | null) => {
    if (!roomId) return;
    setIsUploading(true);

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const duration = recordingDuration;

      // Upload local track
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
      await fetch(localUploadUrl, { method: "PUT", body: localBlob, headers: { "Content-Type": "audio/webm" } });

      // Upload remote track if available
      let remoteRecId: string | null = null;
      if (remoteBlob && remoteBlob.size > 0) {
        const remoteUrlRes = await apiRequest("POST", "/api/recordings/upload-url", {
          roomId,
          fileName: `remote-${timestamp}.webm`,
          duration,
          fileSize: remoteBlob.size,
          format: "webm",
          sampleRate: 48000,
          channels: 1,
          recordingType: "remote",
          speakerId: "spk1",
        });
        const remoteData = await remoteUrlRes.json();
        remoteRecId = remoteData.recordingId;
        await fetch(remoteData.uploadUrl, { method: "PUT", body: remoteBlob, headers: { "Content-Type": "audio/webm" } });
      }

      // Process local track first to get the folder number
      toast({ title: "Recordings uploaded", description: "Processing audio..." });
      const processRes = await apiRequest("POST", `/api/recordings/${localRecId}/process`);
      const { processedFolder } = await processRes.json();

      // Process remote track into the same folder
      if (remoteRecId) {
        await apiRequest("POST", `/api/recordings/${remoteRecId}/process`, { folderNumber: processedFolder });
      }

      toast({ title: "Recordings processed", description: `Both tracks saved to folder ${processedFolder}.` });

      if (taskSession) {
        setShowCompletionDialog(true);
      }
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err.message || "Could not upload recordings",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [roomId, recordingDuration, taskSession, toast]);

  // Called when both recorders have stopped and blobs are ready
  const onBothRecordersStopped = useCallback(() => {
    const localBlob = localBlobRef.current;
    const remoteBlob = remoteBlobRef.current;
    localBlobRef.current = null;
    remoteBlobRef.current = null;

    if (localBlob && localBlob.size > 0) {
      uploadRecordings(localBlob, remoteBlob);
    }
  }, [uploadRecordings]);

  const startRecording = useCallback(async () => {
    if (!callObjectRef.current) return;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    // Reset state
    localBlobRef.current = null;
    remoteBlobRef.current = null;
    stoppedCountRef.current = 0;

    // Find remote participant's audio track
    const dailyParticipants = callObjectRef.current.participants();
    const remoteParticipant = Object.values(dailyParticipants).find(
      (p: DailyParticipant) => !p.local
    ) as DailyParticipant | undefined;
    const remoteTrack = remoteParticipant?.tracks?.audio?.persistentTrack;

    const hasRemote = !!remoteTrack;
    expectedStopsRef.current = hasRemote ? 2 : 1;

    try {
      // Start local mic recorder
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
        stoppedCountRef.current++;
        if (stoppedCountRef.current >= expectedStopsRef.current) {
          onBothRecordersStopped();
        }
      };
      localRecorderRef.current = localRecorder;

      // Start remote track recorder if available
      if (hasRemote && remoteTrack) {
        const remoteStream = new MediaStream([remoteTrack]);
        const remoteRecorder = new MediaRecorder(remoteStream, { mimeType });
        remoteChunksRef.current = [];

        remoteRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) remoteChunksRef.current.push(e.data);
        };
        remoteRecorder.onstop = () => {
          remoteBlobRef.current = new Blob(remoteChunksRef.current, { type: mimeType });
          stoppedCountRef.current++;
          if (stoppedCountRef.current >= expectedStopsRef.current) {
            onBothRecordersStopped();
          }
        };
        remoteRecorderRef.current = remoteRecorder;

        // Start both simultaneously
        localRecorder.start(1000);
        remoteRecorder.start(1000);
      } else {
        localRecorder.start(1000);
      }

      recordingStartRef.current = Date.now();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingDurationIntervalRef.current = setInterval(() => {
        if (recordingStartRef.current) {
          setRecordingDuration(Date.now() - recordingStartRef.current);
        }
      }, 100);

      // Notify other participants
      callObjectRef.current.sendAppMessage({ type: "recording-started" });
      toast({
        title: "Recording started",
        description: hasRemote ? "Recording both participants." : "Recording your audio only (no partner detected).",
      });
    } catch (err: any) {
      toast({
        title: "Recording failed",
        description: err.message || "Could not start recording",
        variant: "destructive",
      });
    }
  }, [toast, onBothRecordersStopped]);

  const stopRecording = useCallback(() => {
    if (recordingDurationIntervalRef.current) {
      clearInterval(recordingDurationIntervalRef.current);
      recordingDurationIntervalRef.current = null;
    }
    setIsRecording(false);

    if (localRecorderRef.current && localRecorderRef.current.state !== "inactive") {
      localRecorderRef.current.stop();
    }
    if (remoteRecorderRef.current && remoteRecorderRef.current.state !== "inactive") {
      remoteRecorderRef.current.stop();
    }
    remoteRecorderRef.current = null;

    // Notify other participants
    if (callObjectRef.current) {
      callObjectRef.current.sendAppMessage({ type: "recording-stopped" });
    }
  }, []);

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
          {isRecording && (
            <Badge variant="outline" className="gap-1 border-red-500 text-red-500">
              <Circle className="h-2 w-2 fill-current" />
              REC {formatDuration(recordingDuration)}
            </Badge>
          )}
          {isRemoteRecording && !isRecording && (
            <Badge variant="destructive" className="animate-pulse gap-1">
              <Circle className="h-2 w-2 fill-current" />
              Recording in progress
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

            {isRecording ? (
              <Button variant="outline" size="sm" onClick={stopRecording} className="border-red-500 text-red-500">
                <Circle className="mr-2 h-3 w-3 fill-red-500" />
                Stop Recording
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={startRecording}
                disabled={isUploading || !hasRemoteParticipant}
                title={!hasRemoteParticipant ? "Waiting for partner to join with audio" : undefined}
              >
                <Circle className="mr-2 h-3 w-3" />
                Record Both
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
          {!hasRemoteParticipant && !isRecording && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Waiting for your partner to join before recording...
            </p>
          )}
        </footer>
      )}

      {/* Task Completion Dialog */}
      <AlertDialog open={showCompletionDialog} onOpenChange={setShowCompletionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recordings saved!</AlertDialogTitle>
            <AlertDialogDescription>
              Both audio tracks have been processed. Is this task complete, or do you want to record again?
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
