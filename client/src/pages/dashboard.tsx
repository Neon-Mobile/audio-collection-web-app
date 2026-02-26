import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuthContext } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TASK_TYPES } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, LogOut, Shield, Link2, Check, X, ArrowRight, Mic, MessageCircle, DollarSign, Users, Calendar } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";

interface PendingInvitation {
  id: string;
  roomId: string;
  roomName: string;
  inviterEmail: string;
  createdAt: string;
}

interface TaskSession {
  id: string;
  taskType: string;
  userId: string;
  partnerId: string | null;
  partnerEmail: string | null;
  partnerStatus: string;
  roomId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const TASK_ICONS: Record<string, typeof Mic> = {
  "whispered-conversation": Mic,
  "general-emotional": MessageCircle,
  "emotion-joy": MessageCircle,
  "emotion-surprise": MessageCircle,
  "emotion-fear": MessageCircle,
  "emotion-anger": MessageCircle,
  "emotion-sadness": MessageCircle,
  "emotion-confusion": MessageCircle,
  "emotion-pride": MessageCircle,
};

function getStatusLabel(status: string): { label: string; variant: "secondary" | "default" | "outline" } {
  switch (status) {
    case "inviting_partner":
      return { label: "Inviting Partner", variant: "secondary" };
    case "waiting_approval":
      return { label: "Waiting for Approval", variant: "secondary" };
    case "ready_to_record":
      return { label: "Ready to Record", variant: "default" };
    case "room_created":
      return { label: "Room Ready", variant: "default" };
    case "in_progress":
      return { label: "In Progress", variant: "default" };
    case "pending_review":
      return { label: "Pending Review", variant: "secondary" };
    case "completed":
      return { label: "Completed", variant: "outline" };
    default:
      return { label: status, variant: "outline" };
  }
}

export default function Dashboard() {
  const { user, logout } = useAuthContext();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Redirect to onboarding if not completed (profile or samples) — skip for already-approved users
  if (user && !user.approved && (!user.onboardingCompletedAt || !user.samplesCompletedAt)) {
    setLocation("/onboarding");
    return null;
  }

  // Show pending message if not approved
  if (user && !user.approved) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Card className="w-full max-w-md mx-4 shadow-lg border-border/50 animate-fade-in">
          <CardHeader className="text-center">
            <CardTitle>Pending Approval</CardTitle>
            <CardDescription>
              Your account is awaiting admin approval. You'll be able to start tasks once approved.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => logout().then(() => setLocation("/login"))}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: pendingInvitations = [] } = useQuery<PendingInvitation[]>({
    queryKey: ["/api/invitations/pending"],
    enabled: !!user?.approved,
    refetchInterval: 30000,
  });

  const { data: taskSessions = [], isLoading: sessionsLoading } = useQuery<TaskSession[]>({
    queryKey: ["/api/task-sessions"],
    enabled: !!user?.approved,
  });

  const acceptInvitation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/invitations/${id}`, { status: "accepted" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invitations/pending"] });
    },
  });

  const declineInvitation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/invitations/${id}`, { status: "declined" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invitations/pending"] });
      toast({ title: "Invitation declined" });
    },
  });

  const referralMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/referrals/code");
      return res.json();
    },
  });

  const copyReferralLink = () => {
    if (referralMutation.data?.link) {
      navigator.clipboard.writeText(referralMutation.data.link);
      toast({ title: "Copied!", description: "Referral link copied to clipboard." });
    }
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  const activeSessions = taskSessions.filter((s) => s.status !== "completed" && s.status !== "pending_review");
  const pendingReviewSessions = taskSessions.filter((s) => s.status === "pending_review");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold tracking-tight">Neon Audio</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">{user?.username}</span>
            <NotificationBell />
            {user?.role === "admin" && (
              <Button variant="outline" size="sm" onClick={() => setLocation("/admin")}>
                <Shield className="mr-1.5 h-3.5 w-3.5" />
                Admin
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-8 animate-fade-in">
        {/* Pending Invitations */}
        {pendingInvitations.length > 0 && (
          <Card className="border-primary/30 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Room Invitations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingInvitations.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">"{inv.roomName}"</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Invited by {inv.inviterEmail}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        acceptInvitation.mutate(inv.id);
                        setLocation(`/room/${inv.roomId}`);
                      }}
                    >
                      <Check className="mr-1 h-3 w-3" />
                      Join
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => declineInvitation.mutate(inv.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Available Tasks */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Available Tasks</h2>
            <span className="text-xs text-muted-foreground">{TASK_TYPES.length} tasks</span>
          </div>
          <div className="space-y-2">
            {TASK_TYPES.map((task) => {
              const Icon = TASK_ICONS[task.id] || Mic;
              const isExpired = new Date(task.availableUntil) < new Date();
              const deadlineDate = new Date(task.availableUntil).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              return (
                <div
                  key={task.id}
                  className={`group rounded-xl border bg-card p-4 transition-all duration-200 ${
                    isExpired
                      ? "opacity-50"
                      : "cursor-pointer hover:shadow-md hover:border-primary/20 hover:-translate-y-px"
                  }`}
                  onClick={() => !isExpired && setLocation(`/task/${task.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/8 shrink-0 transition-colors group-hover:bg-primary/12">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-[15px] tracking-tight">{task.name}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3.5 w-3.5" />
                            {"payType" in task && task.payType === "fixed"
                              ? `$${task.hourlyRate}, one time (~${"estimatedMinutes" in task ? task.estimatedMinutes : 15} min)`
                              : `$${task.hourlyRate}/hr`}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {isExpired ? (
                              <span className="text-destructive font-medium">Expired</span>
                            ) : (
                              <>Until {deadlineDate}</>
                            )}
                          </span>
                          {task.requiresPartner && (
                            <Badge variant="secondary" className="text-xs font-normal">
                              <Users className="h-3 w-3 mr-1" />
                              Partner Required
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {!isExpired && (
                      <Button variant="outline" size="sm" className="shrink-0 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        Start Task
                        <ArrowRight className="ml-2 h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Tasks */}
        {(sessionsLoading || activeSessions.length > 0) && (
          <>
            <Separator />
            <div>
              <h2 className="text-lg font-semibold tracking-tight mb-4">Active Tasks</h2>
              {sessionsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  {activeSessions.map((session) => {
                    const taskDef = TASK_TYPES.find((t) => t.id === session.taskType);
                    const Icon = TASK_ICONS[session.taskType] || Mic;
                    const statusInfo = getStatusLabel(session.status);
                    return (
                      <Card key={session.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/8 shrink-0">
                                <Icon className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">{taskDef?.name || session.taskType}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                                  {session.partnerEmail && (
                                    <span className="text-xs text-muted-foreground">
                                      with {session.partnerEmail}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setLocation(`/task/${session.taskType}`)}
                            >
                              Continue
                              <ArrowRight className="ml-1.5 h-3 w-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Pending Review */}
        {pendingReviewSessions.length > 0 && (
          <>
            <Separator />
            <div>
              <h2 className="text-lg font-semibold tracking-tight mb-4">Pending Review</h2>
              <div className="space-y-2">
                {pendingReviewSessions.map((session) => {
                  const taskDef = TASK_TYPES.find((t) => t.id === session.taskType);
                  const Icon = TASK_ICONS[session.taskType] || Mic;
                  return (
                    <Card key={session.id}>
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/30 shrink-0">
                              <Icon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{taskDef?.name || session.taskType}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 font-normal">Pending Review</Badge>
                                {session.partnerEmail && (
                                  <span className="text-xs text-muted-foreground">
                                    with {session.partnerEmail}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <Separator />

        {/* Invite a Friend */}
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Invite a Friend</CardTitle>
            <CardDescription>
              Share your referral link to invite friends to the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!referralMutation.data ? (
              <Button
                variant="outline"
                onClick={() => referralMutation.mutate()}
                disabled={referralMutation.isPending}
              >
                {referralMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="mr-2 h-4 w-4" />
                )}
                Generate Referral Link
              </Button>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={referralMutation.data.link}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button variant="outline" onClick={copyReferralLink}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
