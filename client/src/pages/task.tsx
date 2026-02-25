import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useAuthContext } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TASK_TYPES } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { NotificationBell } from "@/components/notification-bell";
import {
  Loader2,
  ArrowLeft,
  Send,
  Copy,
  UserPlus,
  Clock,
  CheckCircle2,
  Circle,
  LogIn,
  LogOut,
  Shield,
  DollarSign,
  Users,
} from "lucide-react";

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

export default function TaskPage() {
  const params = useParams<{ taskType: string }>();
  const taskType = params.taskType;
  const [, setLocation] = useLocation();
  const { user, logout } = useAuthContext();
  const { toast } = useToast();
  const [partnerEmail, setPartnerEmail] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);

  const taskDef = TASK_TYPES.find((t) => t.id === taskType);

  // Create or resume task session
  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/task-sessions", { taskType });
      return res.json() as Promise<TaskSession>;
    },
    onSuccess: (data) => {
      setSessionId(data.id);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to start task", description: err.message, variant: "destructive" });
    },
  });

  // Check for existing active session on mount
  const { data: existingSessions } = useQuery<TaskSession[]>({
    queryKey: ["/api/task-sessions"],
    enabled: !!user?.approved,
  });

  useEffect(() => {
    if (existingSessions && taskType && !sessionId) {
      const active = existingSessions.find(
        (s) => s.taskType === taskType && s.status !== "completed"
      );
      if (active) {
        setSessionId(active.id);
      }
    }
  }, [existingSessions, taskType, sessionId]);

  // Poll task session for partner status updates
  const { data: taskSession } = useQuery<TaskSession>({
    queryKey: ["/api/task-sessions", sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/task-sessions/${sessionId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch task session");
      return res.json();
    },
    enabled: !!sessionId,
    refetchInterval: 5000,
  });

  // Invite partner
  const invitePartnerMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", `/api/task-sessions/${sessionId}/invite-partner`, { email });
      return res.json() as Promise<TaskSession>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-sessions", sessionId] });
      toast({ title: "Invitation sent", description: "Your partner has been invited." });
      setPartnerEmail("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to invite", description: err.message, variant: "destructive" });
    },
  });

  // Generate referral link
  const referralMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/referrals/code");
      return res.json();
    },
  });

  // Create room
  const createRoomMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/task-sessions/${sessionId}/create-room`);
      return res.json() as Promise<TaskSession>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-sessions", sessionId] });
      toast({ title: "Room created", description: "Your partner has been notified. Join when ready!" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create room", description: err.message, variant: "destructive" });
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

  if (!taskDef) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <CardTitle>Task Not Found</CardTitle>
            <CardDescription>This task type does not exist.</CardDescription>
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

  // Determine current step
  const hasSession = !!sessionId && !!taskSession;
  const hasPartner = hasSession && taskSession.partnerEmail;
  const partnerApproved = hasSession && taskSession.partnerStatus === "approved";
  const roomCreated = hasSession && taskSession.roomId;

  const currentStep = !hasSession
    ? 1
    : !hasPartner
      ? 2
      : !partnerApproved
        ? 3
        : !roomCreated
          ? 4
          : 5;

  function StepIndicator({ step, label }: { step: number; label: string }) {
    const isCompleted = currentStep > step;
    const isActive = currentStep === step;
    return (
      <div className="flex items-center gap-3">
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
            isCompleted
              ? "bg-primary text-primary-foreground"
              : isActive
                ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : step}
        </div>
        <span className={`text-sm ${isActive ? "font-medium" : "text-muted-foreground"}`}>
          {label}
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
            <h1 className="text-xl font-semibold">Neon Audio Collection</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user?.username}</span>
            <NotificationBell />
            {user?.role === "admin" && (
              <Button variant="outline" size="sm" onClick={() => setLocation("/admin")}>
                <Shield className="mr-1 h-4 w-4" />
                Admin
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="mr-1 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        {/* Task Header */}
        <div>
          <h2 className="text-2xl font-bold">{taskDef.name}</h2>
          <p className="text-muted-foreground mt-1">{taskDef.description}</p>
          <div className="flex items-center gap-3 mt-2 text-sm">
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 font-semibold">
              ${taskDef.hourlyRate}/hr
            </Badge>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {taskDef.requiresPartner ? "Requires Partner" : "Solo"}
            </span>
          </div>
        </div>

        {/* Progress Steps */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3">
              <StepIndicator step={1} label="Read Instructions" />
              <StepIndicator step={2} label="Invite Your Partner" />
              <StepIndicator step={3} label="Partner Gets Approved" />
              <StepIndicator step={4} label="Create Room" />
              <StepIndicator step={5} label="Join & Record" />
            </div>
          </CardContent>
        </Card>

        {/* Step 1: Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              {taskDef.instructions.map((instruction, i) => (
                <li key={i} className="text-muted-foreground">
                  {instruction}
                </li>
              ))}
            </ol>
            {!hasSession && (
              <Button
                className="mt-4 w-full"
                onClick={() => createSessionMutation.mutate()}
                disabled={createSessionMutation.isPending}
              >
                {createSessionMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                Start This Task
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Invite Partner */}
        {hasSession && currentStep >= 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Invite Your Partner</CardTitle>
              <CardDescription>
                Enter your partner's email to invite them. If they're not on the platform yet, they'll get a sign-up link.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!hasPartner ? (
                <>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (partnerEmail) invitePartnerMutation.mutate(partnerEmail);
                    }}
                    className="flex gap-3"
                  >
                    <div className="flex-1">
                      <Label htmlFor="partnerEmail" className="sr-only">
                        Partner Email
                      </Label>
                      <Input
                        id="partnerEmail"
                        type="email"
                        value={partnerEmail}
                        onChange={(e) => setPartnerEmail(e.target.value)}
                        placeholder="partner@example.com"
                      />
                    </div>
                    <Button type="submit" disabled={!partnerEmail || invitePartnerMutation.isPending}>
                      {invitePartnerMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Send Invitation
                    </Button>
                  </form>
                  <Separator />
                  <div className="text-sm text-muted-foreground">
                    Or share your referral link directly:
                  </div>
                  {!referralMutation.data ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => referralMutation.mutate()}
                      disabled={referralMutation.isPending}
                    >
                      {referralMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      Generate Referral Link
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={referralMutation.data.link}
                        readOnly
                        className="font-mono text-xs"
                      />
                      <Button variant="outline" size="sm" onClick={copyReferralLink}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Invitation sent to {taskSession.partnerEmail}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Partner Status */}
        {hasPartner && currentStep >= 3 && !partnerApproved && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Partner Status</CardTitle>
              <CardDescription>
                Waiting for your partner to sign up and get approved.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                {taskSession.partnerStatus === "invited" && (
                  <>
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Badge variant="secondary">Invited</Badge>
                      <p className="text-sm text-muted-foreground mt-1">
                        Waiting for {taskSession.partnerEmail} to sign up
                      </p>
                    </div>
                  </>
                )}
                {taskSession.partnerStatus === "registered" && (
                  <>
                    <Clock className="h-5 w-5 text-yellow-500" />
                    <div>
                      <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                        Registered
                      </Badge>
                      <p className="text-sm text-muted-foreground mt-1">
                        {taskSession.partnerEmail} signed up — waiting for admin approval
                      </p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Create Room */}
        {partnerApproved && !roomCreated && (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="text-lg">Partner Approved!</CardTitle>
              <CardDescription>
                Your partner is ready. Create a room to start your recording session.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium">{taskSession!.partnerEmail}</p>
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => createRoomMutation.mutate()}
                disabled={createRoomMutation.isPending}
              >
                {createRoomMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                Create Room & Invite Partner
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Join Room */}
        {roomCreated && (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="text-lg">Room Ready!</CardTitle>
              <CardDescription>
                Your room has been created and your partner has been notified. Join when you're both ready.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => setLocation(`/room/${taskSession!.roomId}`)}>
                <LogIn className="mr-2 h-4 w-4" />
                Join Room
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
