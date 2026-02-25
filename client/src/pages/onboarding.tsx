import { useState } from "react";
import { useAuthContext } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function Onboarding() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [primaryLanguage, setPrimaryLanguage] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const { user, submitOnboarding, isOnboardingPending } = useAuthContext();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  if (!user) {
    setLocation("/login");
    return null;
  }

  // Already onboarded and approved — go to dashboard
  if (user.onboardingCompletedAt && user.approved) {
    setLocation("/");
    return null;
  }

  // Onboarded but not approved — show pending message
  if (user.onboardingCompletedAt && !user.approved) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-2" />
            <CardTitle className="text-2xl">Application Submitted</CardTitle>
            <CardDescription>
              Your application is under review. You'll be able to access the platform once an admin approves your account.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await submitOnboarding({
        firstName,
        lastName,
        primaryLanguage,
        referralSource: referralSource || undefined,
      });
      toast({
        title: "Application submitted",
        description: "Your application is now pending review.",
      });
    } catch (err: any) {
      toast({
        title: "Submission failed",
        description: err.message || "Could not submit application",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-lg mx-4">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
          <CardDescription>Tell us a bit about yourself to get started</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="primaryLanguage">Primary Language</Label>
              <Input
                id="primaryLanguage"
                value={primaryLanguage}
                onChange={(e) => setPrimaryLanguage(e.target.value)}
                placeholder="e.g. English, Spanish, Mandarin"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="referralSource">How did you hear about us? (optional)</Label>
              <Input
                id="referralSource"
                value={referralSource}
                onChange={(e) => setReferralSource(e.target.value)}
                placeholder="e.g. Friend, social media, etc."
              />
            </div>
            <Button type="submit" className="w-full" disabled={isOnboardingPending}>
              {isOnboardingPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Application
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
