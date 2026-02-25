import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuthContext } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Copy, LogIn, LogOut, Shield, Link2, Check, X } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import type { Room } from "@shared/schema";

function sanitizePreview(name: string): string {
  return name
    .replace(/[^A-Za-z0-9\-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

interface PendingInvitation {
  id: string;
  roomId: string;
  roomName: string;
  inviterEmail: string;
  createdAt: string;
}

export default function Dashboard() {
  const { user, logout } = useAuthContext();
  const [, setLocation] = useLocation();
  const [roomName, setRoomName] = useState("");
  const { toast } = useToast();

  // Redirect to onboarding if not completed (profile or samples) — skip for already-approved users
  if (user && !user.approved && (!user.onboardingCompletedAt || !user.samplesCompletedAt)) {
    setLocation("/onboarding");
    return null;
  }

  // Show pending message if not approved
  if (user && !user.approved) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <CardTitle>Pending Approval</CardTitle>
            <CardDescription>
              Your account is awaiting admin approval. You'll be able to create and join rooms once approved.
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

  const { data: rooms = [], isLoading: roomsLoading } = useQuery<Room[]>({
    queryKey: ["/api/rooms"],
    enabled: !!user?.approved,
  });

  const { data: pendingInvitations = [] } = useQuery<PendingInvitation[]>({
    queryKey: ["/api/invitations/pending"],
    enabled: !!user?.approved,
    refetchInterval: 30000,
  });

  const createRoomMutation = useMutation({
    mutationFn: async (name?: string) => {
      const res = await apiRequest("POST", "/api/rooms", { name: name || undefined });
      return res.json();
    },
    onSuccess: (room: Room) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Room created", description: `Room "${room.name}" is ready.` });
      setRoomName("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create room", description: err.message, variant: "destructive" });
    },
  });

  const referralMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/referrals/code");
      return res.json();
    },
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

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    createRoomMutation.mutate(roomName || undefined);
  };

  const copyRoomLink = (roomId: string) => {
    const url = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: "Room link copied to clipboard." });
  };

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Neon Audio Collection</h1>
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

      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-8">
        {/* Pending Invitations */}
        {pendingInvitations.length > 0 && (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="text-lg">Room Invitations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingInvitations.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">"{inv.roomName}"</p>
                    <p className="text-xs text-muted-foreground">Invited by {inv.inviterEmail}</p>
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

        {/* Create Room */}
        <Card>
          <CardHeader>
            <CardTitle>Create a Room</CardTitle>
            <CardDescription>
              Start a new audio call room. Leave the name blank for an auto-generated name.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateRoom} className="flex gap-3 items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="roomName">Room Name (optional)</Label>
                <Input
                  id="roomName"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="e.g. my-session"
                />
                {roomName && (
                  <p className="text-xs text-muted-foreground">
                    Will be created as: <code className="bg-muted px-1 rounded">{sanitizePreview(roomName)}</code>
                  </p>
                )}
              </div>
              <Button type="submit" disabled={createRoomMutation.isPending}>
                {createRoomMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Create Room
              </Button>
            </form>
          </CardContent>
        </Card>

        <Separator />

        {/* Room List */}
        <Card>
          <CardHeader>
            <CardTitle>My Rooms</CardTitle>
            <CardDescription>Rooms you've created. Share the link for others to join.</CardDescription>
          </CardHeader>
          <CardContent>
            {roomsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rooms.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No rooms yet. Create one above to get started.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rooms.map((room) => {
                    const isExpired = new Date(room.expiresAt) < new Date();
                    return (
                      <TableRow key={room.id}>
                        <TableCell className="font-medium">{room.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(room.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {isExpired ? (
                            <Badge variant="secondary">Expired</Badge>
                          ) : (
                            <span className="text-muted-foreground">
                              {new Date(room.expiresAt).toLocaleTimeString()}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyRoomLink(room.id)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          {!isExpired && (
                            <Button
                              size="sm"
                              onClick={() => setLocation(`/room/${room.id}`)}
                            >
                              <LogIn className="mr-1 h-4 w-4" />
                              Join
                            </Button>
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

        <Separator />

        {/* Invite a Friend */}
        <Card>
          <CardHeader>
            <CardTitle>Invite a Friend</CardTitle>
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
