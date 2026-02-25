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
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <SampleRecorder onComplete={handleSamplesComplete} />
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select value={gender} onValueChange={setGender} required>
                  <SelectTrigger id="gender">
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="countryOfEducation">Country of Education</Label>
                <Input
                  id="countryOfEducation"
                  value={countryOfEducation}
                  onChange={(e) => setCountryOfEducation(e.target.value)}
                  placeholder="e.g. United States"
                  required
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

            <Button type="submit" className="w-full" disabled={isOnboardingPending || !gender}>
              {isOnboardingPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
