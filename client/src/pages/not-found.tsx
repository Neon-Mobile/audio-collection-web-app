import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
      <div className="animate-fade-in">
        <Card className="w-full max-w-md mx-4 shadow-lg border-border/50">
          <CardContent className="pt-8 pb-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 mb-4">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Page Not Found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The page you're looking for doesn't exist.
            </p>
            <Button variant="outline" className="mt-6" onClick={() => window.location.href = "/"}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
