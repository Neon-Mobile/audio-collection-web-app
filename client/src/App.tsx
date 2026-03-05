import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute } from "@/components/protected-route";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Onboarding from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import TaskPage from "@/pages/task";
import RoomPage from "@/pages/room";
import Admin from "@/pages/admin";
import NotFound from "@/pages/not-found";

function InviteRedirect({ params }: { params: { code: string } }) {
  return <Redirect to={`/register?ref=${params.code}`} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/invite/:code">
        {(params) => <InviteRedirect params={params} />}
      </Route>
      <Route path="/onboarding">
        <ProtectedRoute>
          <Onboarding />
        </ProtectedRoute>
      </Route>
      <Route path="/task/:taskType">
        <ProtectedRoute>
          <TaskPage />
        </ProtectedRoute>
      </Route>
      <Route path="/room/:id">
        <ProtectedRoute>
          <RoomPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute>
          <Admin />
        </ProtectedRoute>
      </Route>
      <Route path="/">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

const SITE_PAUSED = true;

function PausedOverlay() {
  return (
    <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card border rounded-2xl shadow-lg p-8 max-w-md mx-4 text-center">
        <h2 className="text-xl font-semibold mb-3">Temporarily Paused</h2>
        <p className="text-muted-foreground">
          The site and all tasks are temporarily paused. Please check back later.
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          {SITE_PAUSED && <PausedOverlay />}
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
