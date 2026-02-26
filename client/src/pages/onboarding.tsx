import { useState } from "react";
import { useAuthContext } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2 } from "lucide-react";
import SampleRecorder from "@/components/sample-recorder";

export default function Onboarding() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [primaryLanguage, setPrimaryLanguage] = useState("");
  const [countryOfEducation, setCountryOfEducation] = useState("");
  const [countryOfResidence, setCountryOfResidence] = useState("");
  const [occupation, setOccupation] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const { user, submitOnboarding, completeSamples, isOnboardingPending } = useAuthContext();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  if (!user) {
    setLocation("/login");
    return null;
  }

  // Already fully onboarded and approved — go to dashboard
  if (user.onboardingCompletedAt && user.samplesCompletedAt && user.approved) {
    setLocation("/");
    return null;
  }

  // Determine current step
  const step = !user.onboardingCompletedAt ? 1 : !user.samplesCompletedAt ? 2 : 3;

  // Step 3: Pending approval
  if (step === 3) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <div className="animate-fade-in">
          <Card className="w-full max-w-md mx-4 shadow-lg border-border/50">
            <CardHeader className="text-center pt-8 pb-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-50 dark:bg-green-950/30 mx-auto mb-3">
                <CheckCircle2 className="h-7 w-7 text-green-500" />
              </div>
              <CardTitle className="text-xl">Application Submitted</CardTitle>
              <CardDescription className="mt-2">
                Your application is under review. You'll be able to access the platform once an admin approves your account.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  // Step 2: Sample recordings
  if (step === 2) {
    const handleSamplesComplete = async () => {
      try {
        await completeSamples();
        toast({
          title: "Samples recorded",
          description: "Your application is now pending review.",
        });
      } catch (err: any) {
        toast({
          title: "Error",
          description: err.message || "Could not complete samples",
          variant: "destructive",
        });
      }
    };

    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <div className="animate-fade-in">
          <SampleRecorder onComplete={handleSamplesComplete} />
        </div>
      </div>
    );
  }

  // Step 1: Profile form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await submitOnboarding({
        firstName,
        lastName,
        gender,
        age: parseInt(age, 10),
        primaryLanguage,
        countryOfEducation,
        countryOfResidence,
        occupation,
        referralSource: referralSource || undefined,
      });
      toast({
        title: "Profile saved",
        description: "Now let's record a few audio samples.",
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
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-primary/5 py-8">
      <div className="w-full max-w-lg mx-4 animate-fade-in">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">1</div>
            <span className="text-sm font-medium">Profile</span>
          </div>
          <div className="w-8 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-medium">2</div>
            <span className="text-sm text-muted-foreground">Samples</span>
          </div>
          <div className="w-8 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-medium">3</div>
            <span className="text-sm text-muted-foreground">Review</span>
          </div>
        </div>

        <Card className="shadow-lg border-border/50">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">Complete Your Profile</CardTitle>
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
                    className="h-11"
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
                    className="h-11"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gender">Gender</Label>
                  <Select value={gender} onValueChange={setGender} required>
                    <SelectTrigger id="gender" className="h-11">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="non-binary">Non-binary</SelectItem>
                      <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="age">Age</Label>
                  <Input
                    id="age"
                    type="number"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="Age"
                    min={13}
                    max={120}
                    required
                    className="h-11"
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
                  className="h-11"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="countryOfEducation">Country of Education</Label>
                  <Input
                    id="countryOfEducation"
                    value={countryOfEducation}
                    onChange={(e) => setCountryOfEducation(e.target.value)}
                    placeholder="e.g. United States"
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="countryOfResidence">Country of Residence</Label>
                  <Input
                    id="countryOfResidence"
                    value={countryOfResidence}
                    onChange={(e) => setCountryOfResidence(e.target.value)}
                    placeholder="e.g. United States"
                    required
                    className="h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="occupation">Occupation</Label>
                <Input
                  id="occupation"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  placeholder="e.g. Software Engineer, Student, Teacher"
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="referralSource">How did you hear about us? (optional)</Label>
                <Input
                  id="referralSource"
                  value={referralSource}
                  onChange={(e) => setReferralSource(e.target.value)}
                  placeholder="e.g. Friend, social media, etc."
                  className="h-11"
                />
              </div>

              <Button type="submit" className="w-full h-11" disabled={isOnboardingPending || !gender}>
                {isOnboardingPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
