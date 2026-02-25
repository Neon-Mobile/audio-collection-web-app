import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuthContext } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Check, Download, Shield, ShieldOff } from "lucide-react";
import type { User, Room, Recording } from "@shared/schema";

export default function Admin() {
  const { user } = useAuthContext();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">Admin Panel</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <Tabs defaultValue="users">
          <TabsList className="mb-6">
            <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
            <TabsTrigger value="rooms">Rooms ({allRooms.length})</TabsTrigger>
            <TabsTrigger value="recordings">Recordings ({allRecordings.length})</TabsTrigger>
          </TabsList>

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
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Onboarding</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.username}</TableCell>
                          <TableCell>
                            <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                              {u.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {u.approved ? (
                              <Badge className="bg-green-500">Approved</Badge>
                            ) : (
                              <Badge variant="outline">Pending</Badge>
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
                                <Badge className="bg-green-500">Active</Badge>
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
