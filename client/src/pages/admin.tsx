import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuthContext } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Loader2, ArrowLeft, Check, X, Download, Shield, ShieldOff, Play, Square, Search, ArrowUpDown, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { TASK_TYPES } from "@shared/schema";
import type { User, Room, Recording, TaskSession } from "@shared/schema";

type EnrichedSession = TaskSession & { userEmail: string; recordings: Recording[] };

function RecordingRow({ rec, onDownload }: { rec: Recording; onDownload: (id: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <AudioPlayer recordingId={rec.id} />
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={() => onDownload(rec.id)}
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
      <span className="text-xs text-muted-foreground">
        {rec.recordingType}
        {rec.duration ? ` ${Math.round(rec.duration / 1000)}s` : ""}
      </span>
    </div>
  );
}

function AudioCell({ recordings, onDownload }: { recordings: Recording[]; onDownload: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const MAX_VISIBLE = 2;

  if (recordings.length === 0) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  const visible = expanded ? recordings : recordings.slice(0, MAX_VISIBLE);
  const hiddenCount = recordings.length - MAX_VISIBLE;

  return (
    <div className="flex flex-col gap-1">
      {visible.map((rec) => (
        <RecordingRow key={rec.id} rec={rec} onDownload={onDownload} />
      ))}
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer bg-transparent border-0 p-0"
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3" /> Show less</>
          ) : (
            <><ChevronDown className="h-3 w-3" /> {hiddenCount} more</>
          )}
        </button>
      )}
    </div>
  );
}

function AudioPlayer({ recordingId }: { recordingId: string }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (audioUrl && audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiRequest("GET", `/api/recordings/${recordingId}/download`);
      const { downloadUrl } = await res.json();
      setAudioUrl(downloadUrl);

      const audio = new Audio(downloadUrl);
      audioRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      audio.play();
      setIsPlaying(true);
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handlePlay} disabled={isLoading}>
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : isPlaying ? (
        <Square className="h-3.5 w-3.5" />
      ) : (
        <Play className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

function OnboardingSamplePlayer({ userId }: { userId: string }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (audioUrl && audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiRequest("GET", `/api/admin/onboarding-samples/${userId}/download`);
      const { downloadUrl } = await res.json();
      setAudioUrl(downloadUrl);

      const audio = new Audio(downloadUrl);
      audioRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      audio.play();
      setIsPlaying(true);
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handlePlay} disabled={isLoading}>
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : isPlaying ? (
        <Square className="h-3.5 w-3.5" />
      ) : (
        <Play className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

function ReviewerStatusSelect({ session }: { session: EnrichedSession }) {
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (reviewerStatus: string | null) => {
      const res = await apiRequest("PATCH", `/api/admin/task-sessions/${session.id}/reviewer-status`, {
        reviewerStatus,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/task-sessions"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const value = session.reviewerStatus || "unreviewed";

  return (
    <Select
      value={value}
      onValueChange={(v) => mutation.mutate(v === "unreviewed" ? null : v)}
      disabled={mutation.isPending}
    >
      <SelectTrigger className="h-8 w-[130px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unreviewed">Unreviewed</SelectItem>
        <SelectItem value="approved">Approved</SelectItem>
        <SelectItem value="rejected">Rejected</SelectItem>
        <SelectItem value="unsure">Unsure</SelectItem>
      </SelectContent>
    </Select>
  );
}

function PaidCheckbox({ session }: { session: EnrichedSession }) {
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (paid: boolean) => {
      const res = await apiRequest("PATCH", `/api/admin/task-sessions/${session.id}/paid`, { paid });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/task-sessions"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Checkbox
      checked={session.paid}
      onCheckedChange={(checked) => mutation.mutate(checked === true)}
      disabled={mutation.isPending}
    />
  );
}

export default function Admin() {
  const { user } = useAuthContext();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Task filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewerFilter, setReviewerFilter] = useState("all");
  const [paidFilter, setPaidFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  if (user?.role !== "admin") {
    setLocation("/");
    return null;
  }

  const { data: users = [], isLoading: usersLoading } = useQuery<(Omit<User, "password">)[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: allRooms = [], isLoading: roomsLoading } = useQuery<Room[]>({
    queryKey: ["/api/admin/rooms"],
  });

  const { data: allRecordings = [], isLoading: recordingsLoading } = useQuery<Recording[]>({
    queryKey: ["/api/admin/recordings"],
  });

  const { data: allTaskSessions = [], isLoading: sessionsLoading } = useQuery<EnrichedSession[]>({
    queryKey: ["/api/admin/task-sessions"],
  });

  const filteredSessions = useMemo(() => {
    let list = [...allTaskSessions];

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.userEmail?.toLowerCase().includes(q) ||
          s.partnerEmail?.toLowerCase().includes(q) ||
          TASK_TYPES.find((t) => t.id === s.taskType)?.name.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter((s) => s.status === statusFilter);
    }

    // Reviewer status filter
    if (reviewerFilter !== "all") {
      if (reviewerFilter === "unreviewed") {
        list = list.filter((s) => !s.reviewerStatus);
      } else {
        list = list.filter((s) => s.reviewerStatus === reviewerFilter);
      }
    }

    // Paid filter
    if (paidFilter !== "all") {
      list = list.filter((s) => (paidFilter === "paid" ? s.paid : !s.paid));
    }

    // Sort
    list.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        case "task":
          return (TASK_TYPES.find((t) => t.id === a.taskType)?.name || "").localeCompare(
            TASK_TYPES.find((t) => t.id === b.taskType)?.name || ""
          );
        case "status":
          return a.status.localeCompare(b.status);
        case "newest":
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return list;
  }, [allTaskSessions, searchQuery, statusFilter, reviewerFilter, paidFilter, sortBy]);

  const approveMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/approve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User approved" });
    },
  });

  const rejectRetryMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/reject-retry`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User reset", description: "They will need to re-record their onboarding sample." });
    },
  });

  const rejectBlockMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/reject-block`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User blocked", description: "Their email has been permanently blocked." });
    },
  });

  const [blockConfirmUserId, setBlockConfirmUserId] = useState<string | null>(null);

  const roleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated" });
    },
  });

  const downloadRecording = async (recordingId: string) => {
    try {
      const res = await apiRequest("GET", `/api/recordings/${recordingId}/download`);
      const { downloadUrl } = await res.json();
      window.open(downloadUrl, "_blank");
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    }
  };

  const approveSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiRequest("PATCH", `/api/admin/task-sessions/${sessionId}/approve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/task-sessions"] });
      toast({ title: "Recording approved" });
    },
  });

  const rejectSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiRequest("PATCH", `/api/admin/task-sessions/${sessionId}/reject`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/task-sessions"] });
      toast({ title: "Recording sent back for redo" });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending_review":
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 border-0">Pending Review</Badge>;
      case "completed":
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300 border-0">Completed</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 border-0">In Progress</Badge>;
      case "room_created":
        return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-300 border-0">Room Created</Badge>;
      default:
        return <Badge variant="secondary">{status.replace(/_/g, " ")}</Badge>;
    }
  };

  const getReviewerBadge = (status: string | null) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300 border-0">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300 border-0">Rejected</Badge>;
      case "unsure":
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 border-0">Unsure</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Unreviewed</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Admin Panel</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-7xl animate-fade-in">
        <Tabs defaultValue="tasks">
          <TabsList className="mb-6">
            <TabsTrigger value="tasks">Tasks ({allTaskSessions.length})</TabsTrigger>
            <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
            <TabsTrigger value="rooms">Rooms ({allRooms.length})</TabsTrigger>
            <TabsTrigger value="recordings">Recordings ({allRecordings.length})</TabsTrigger>
          </TabsList>

          {/* Tasks Tab */}
          <TabsContent value="tasks">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle>Task Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Filter bar */}
                <div className="flex flex-wrap gap-3 mb-4">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by email or task..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px] h-9">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending_review">Pending Review</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="room_created">Room Created</SelectItem>
                      <SelectItem value="ready_to_record">Ready to Record</SelectItem>
                      <SelectItem value="inviting_partner">Inviting Partner</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={reviewerFilter} onValueChange={setReviewerFilter}>
                    <SelectTrigger className="w-[150px] h-9">
                      <SelectValue placeholder="Reviewer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Reviews</SelectItem>
                      <SelectItem value="unreviewed">Unreviewed</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="unsure">Unsure</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={paidFilter} onValueChange={setPaidFilter}>
                    <SelectTrigger className="w-[120px] h-9">
                      <SelectValue placeholder="Paid" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-[140px] h-9">
                      <ArrowUpDown className="mr-1 h-3.5 w-3.5" />
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest First</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                      <SelectItem value="task">By Task</SelectItem>
                      <SelectItem value="status">By Status</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {sessionsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : filteredSessions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {allTaskSessions.length === 0 ? "No task sessions yet." : "No sessions match your filters."}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Task</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Partner</TableHead>
                          <TableHead>Audio</TableHead>
                          <TableHead>Reviewer</TableHead>
                          <TableHead className="text-center">Paid</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Updated</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSessions.map((session) => {
                          const taskDef = TASK_TYPES.find((t) => t.id === session.taskType);
                          return (
                            <TableRow key={session.id}>
                              <TableCell className="font-medium max-w-[180px]">
                                <span className="truncate block">{taskDef?.name || session.taskType}</span>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {session.userEmail}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {session.partnerEmail || "-"}
                              </TableCell>
                              <TableCell>
                                <AudioCell recordings={session.recordings} onDownload={downloadRecording} />
                              </TableCell>
                              <TableCell>
                                <ReviewerStatusSelect session={session} />
                              </TableCell>
                              <TableCell className="text-center">
                                <PaidCheckbox session={session} />
                              </TableCell>
                              <TableCell>
                                {getStatusBadge(session.status)}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                                {new Date(session.updatedAt).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-right">
                                {session.status === "pending_review" && (
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8"
                                      onClick={() => approveSessionMutation.mutate(session.id)}
                                      disabled={approveSessionMutation.isPending}
                                    >
                                      <Check className="mr-1 h-3.5 w-3.5" />
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8"
                                      onClick={() => rejectSessionMutation.mutate(session.id)}
                                      disabled={rejectSessionMutation.isPending}
                                    >
                                      <X className="mr-1 h-3.5 w-3.5" />
                                      Reject
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {filteredSessions.length > 0 && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    Showing {filteredSessions.length} of {allTaskSessions.length} sessions
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Username</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Referral</TableHead>
                        <TableHead>Key</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Onboarding</TableHead>
                        <TableHead>Sample</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.username}</TableCell>
                          <TableCell className="text-sm">
                            {(() => {
                              const data = u.onboardingData as Record<string, string> | null;
                              return data?.firstName
                                ? `${data.firstName} ${data.lastName || ""}`.trim()
                                : <span className="text-muted-foreground">-</span>;
                            })()}
                          </TableCell>
                          <TableCell className="text-sm">
                            {(u.onboardingData as Record<string, string> | null)?.referralSource || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell>
                            {u.shortKey ? (
                              <div className="flex items-center gap-1">
                                <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{u.shortKey}</code>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  onClick={() => {
                                    navigator.clipboard.writeText(u.shortKey!);
                                    toast({ title: "Copied!", description: `Key ${u.shortKey} copied.` });
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                              {u.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {u.approved ? (
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300 border-0">Approved</Badge>
                            ) : u.samplesCompletedAt ? (
                              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 border-0">Pending Review</Badge>
                            ) : (
                              <Badge variant="outline">Pending Sample</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {u.onboardingCompletedAt ? (
                              <span className="text-xs text-muted-foreground">
                                {new Date(u.onboardingCompletedAt).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not started</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {u.samplesCompletedAt ? (
                              <OnboardingSamplePlayer userId={u.id} />
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(u.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            {!u.approved && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => approveMutation.mutate(u.id)}
                                disabled={approveMutation.isPending}
                              >
                                <Check className="mr-1 h-4 w-4" />
                                Approve
                              </Button>
                            )}
                            {!u.approved && u.samplesCompletedAt && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => rejectRetryMutation.mutate(u.id)}
                                disabled={rejectRetryMutation.isPending}
                                className="text-orange-600 hover:text-orange-700"
                              >
                                <X className="mr-1 h-4 w-4" />
                                Retry
                              </Button>
                            )}
                            {!u.approved && u.id !== user?.id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setBlockConfirmUserId(u.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <X className="mr-1 h-4 w-4" />
                                Block
                              </Button>
                            )}
                            {u.id !== user?.id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  roleMutation.mutate({
                                    userId: u.id,
                                    role: u.role === "admin" ? "user" : "admin",
                                  })
                                }
                                disabled={roleMutation.isPending}
                              >
                                {u.role === "admin" ? (
                                  <><ShieldOff className="mr-1 h-4 w-4" /> Remove Admin</>
                                ) : (
                                  <><Shield className="mr-1 h-4 w-4" /> Make Admin</>
                                )}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Block Confirmation Dialog */}
          <AlertDialog open={!!blockConfirmUserId} onOpenChange={(open) => !open && setBlockConfirmUserId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Block this user permanently?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete their account and permanently block their email from registering again. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    if (blockConfirmUserId) {
                      rejectBlockMutation.mutate(blockConfirmUserId);
                      setBlockConfirmUserId(null);
                    }
                  }}
                >
                  Block Permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Rooms Tab */}
          <TabsContent value="rooms">
            <Card>
              <CardHeader>
                <CardTitle>All Rooms</CardTitle>
              </CardHeader>
              <CardContent>
                {roomsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : allRooms.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No rooms created yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Created By</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allRooms.map((room) => {
                        const isExpired = new Date(room.expiresAt) < new Date();
                        return (
                          <TableRow key={room.id}>
                            <TableCell className="font-medium">{room.name}</TableCell>
                            <TableCell className="text-muted-foreground">{room.createdBy}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(room.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(room.expiresAt).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {isExpired ? (
                                <Badge variant="secondary">Expired</Badge>
                              ) : (
                                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300 border-0">Active</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Recordings Tab */}
          <TabsContent value="recordings">
            <Card>
              <CardHeader>
                <CardTitle>All Recordings</CardTitle>
              </CardHeader>
              <CardContent>
                {recordingsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : allRecordings.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No recordings yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Format</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allRecordings.map((rec) => (
                        <TableRow key={rec.id}>
                          <TableCell className="font-medium truncate max-w-[200px]">
                            {rec.fileName}
                          </TableCell>
                          <TableCell>
                            <Badge variant={rec.recordingType === "cloud" ? "default" : "outline"}>
                              {rec.recordingType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{rec.format}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {rec.duration ? `${Math.round(rec.duration / 1000)}s` : "-"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {rec.fileSize ? `${(rec.fileSize / 1024 / 1024).toFixed(1)} MB` : "-"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(rec.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => downloadRecording(rec.id)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
