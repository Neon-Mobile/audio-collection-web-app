import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Globe, Mic, Wifi, Volume2, CheckCircle2, ChevronRight, ArrowLeft, Target, MapPin, Calendar, Lock, RotateCcw, Loader2 } from "lucide-react";
import micSetupImage from "@assets/image_1771896839717.png";

function LocationAutocomplete({ value, onChange, placeholder, testId }: { value: string; onChange: (v: string) => void; placeholder: string; testId: string }) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`, {
          headers: { "Accept-Language": "en" },
        });
        const data = await res.json();
        const results = data.map((item: any) => item.display_name as string);
        setSuggestions(results);
        setOpen(results.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, []);

  const handleInputChange = (val: string) => {
    setQuery(val);
    onChange(val);
    fetchSuggestions(val);
  };

  const handleSelect = (suggestion: string) => {
    setQuery(suggestion);
    onChange(suggestion);
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          placeholder={placeholder}
          className="text-sm pr-8"
          data-testid={testId}
        />
        {loading && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin absolute right-2 top-1/2 -translate-y-1/2" />}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto" data-testid={`${testId}-dropdown`}>
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(s)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors border-b border-border last:border-0"
              data-testid={`${testId}-option-${i}`}
            >
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span className="line-clamp-2">{s}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const LANGUAGES = [
  "English", "Spanish", "French", "Portuguese", "Hindi",
  "Mandarin", "Arabic (MSA)", "Arabic (Other)", "German", "Japanese",
  "Korean", "Russian", "Italian", "Dutch", "Swedish",
  "Turkish", "Bengali", "Tamil", "Telugu", "Marathi",
  "Hinglish", "Urdu", "Tagalog", "Indonesian", "Vietnamese",
  "Thai", "Polish",
];

const PRIMARY_LANGUAGES = [...LANGUAGES];

const REFERRAL_SOURCES = [
  "Indeed", "Upwork", "LinkedIn",
  "Friend or Family", "Google", "Facebook",
  "TikTok", "Instagram", "Reddit",
  "Fiverr", "Ziprecruiter", "Other",
];

const HIGH_DEMAND = ["Telugu", "Tamil", "Marathi", "Hinglish", "German", "Mandarin"];

const ETHNICITIES = [
  "Asian", "Black or African American", "Hispanic or Latino",
  "Middle Eastern or North African", "Native American or Alaska Native",
  "Native Hawaiian or Pacific Islander", "White or Caucasian",
  "Two or more races", "Prefer not to say", "Other",
];

const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say", "Other"];

const EDUCATION_LEVELS = [
  "High school or less",
  "College or university (Bachelors)",
  "Graduate degree (Master's or PhD)",
];

const EDUCATION_IN_LANGUAGE_LEVELS = [
  "None",
  "High school or less",
  "College or university (Bachelors)",
  "Graduate degree (Master's or PhD)",
];

const LOCALE_MAP: Record<string, string[]> = {
  "Spanish": ["Spain", "Argentina", "Bolivia", "Mexico", "Colombia", "United States", "Chile", "Costa Rica", "Cuba", "Dominican Republic", "Ecuador", "El Salvador", "Guatemala", "Honduras", "Nicaragua", "Panama", "Paraguay", "Peru", "Puerto Rico", "Uruguay", "Venezuela", "Other"],
  "English": ["United States", "United Kingdom", "Canada", "Australia", "New Zealand", "Ireland", "South Africa", "India", "Philippines", "Singapore", "Nigeria", "Jamaica", "Other"],
  "French": ["France", "Canada (Quebec)", "Belgium", "Switzerland", "Senegal", "Ivory Coast", "Haiti", "Cameroon", "Algeria", "Morocco", "Tunisia", "Other"],
  "Portuguese": ["Brazil", "Portugal", "Angola", "Mozambique", "Cape Verde", "Other"],
  "Hindi": ["India (North)", "India (Central)", "India (West)", "Fiji", "Other"],
  "Mandarin": ["Mainland China (North)", "Mainland China (South)", "Taiwan", "Singapore", "Malaysia", "Other"],
  "Arabic (MSA)": ["Egypt", "Saudi Arabia", "UAE", "Jordan", "Lebanon", "Iraq", "Morocco", "Tunisia", "Algeria", "Sudan", "Other"],
  "Arabic (Other)": ["Egypt", "Lebanon", "Syria", "Iraq", "Gulf States", "Morocco", "Tunisia", "Algeria", "Other"],
  "German": ["Germany (North)", "Germany (South)", "Austria", "Switzerland", "Other"],
  "Japanese": ["Tokyo", "Osaka/Kansai", "Kyushu", "Hokkaido", "Other"],
  "Korean": ["Seoul", "Busan", "Gyeongsang", "Jeolla", "Other"],
  "Russian": ["Moscow", "Saint Petersburg", "Siberia", "Ukraine (Russian-speaking)", "Kazakhstan", "Other"],
  "Italian": ["Italy (North)", "Italy (Central)", "Italy (South)", "Switzerland (Italian)", "Other"],
  "Dutch": ["Netherlands", "Belgium (Flemish)", "Suriname", "Other"],
  "Swedish": ["Sweden", "Finland (Swedish-speaking)", "Other"],
  "Turkish": ["Turkey (Istanbul)", "Turkey (Anatolia)", "Cyprus", "Other"],
  "Bengali": ["Bangladesh", "India (West Bengal)", "Other"],
  "Tamil": ["India (Tamil Nadu)", "Sri Lanka", "Singapore", "Malaysia", "Other"],
  "Telugu": ["India (Andhra Pradesh)", "India (Telangana)", "Other"],
  "Marathi": ["India (Maharashtra)", "Other"],
  "Hinglish": ["India (Urban North)", "India (Urban West)", "Other"],
  "Urdu": ["Pakistan", "India", "Other"],
  "Tagalog": ["Philippines (Metro Manila)", "Philippines (Luzon)", "Philippines (Visayas)", "Other"],
  "Indonesian": ["Indonesia (Java)", "Indonesia (Sumatra)", "Indonesia (Other)", "Other"],
  "Vietnamese": ["Vietnam (North)", "Vietnam (Central)", "Vietnam (South)", "Other"],
  "Thai": ["Thailand (Central)", "Thailand (North)", "Thailand (South)", "Other"],
  "Polish": ["Poland", "United States (Polish diaspora)", "United Kingdom", "Other"],
};

const SAMPLE_PROMPTS: Record<string, { speak: string; silence: number }[]> = {
  "Spanish": [
    { speak: 'Speak: "El veloz murci\u00e9lago hind\u00fa com\u00eda feliz cardillo y kiwi."', silence: 6 },
    { speak: "Be quiet", silence: 3 },
    { speak: 'Speak: "El veloz murci\u00e9lago hind\u00fa com\u00eda feliz cardillo y kiwi."', silence: 6 },
  ],
  "English": [
    { speak: 'Speak: "The quick brown fox jumps over the lazy dog near the bank of the river."', silence: 6 },
    { speak: "Be quiet", silence: 3 },
    { speak: 'Speak: "The quick brown fox jumps over the lazy dog near the bank of the river."', silence: 6 },
  ],
  "default": [
    { speak: "Speak: Read a short sentence in your primary language.", silence: 6 },
    { speak: "Be quiet", silence: 3 },
    { speak: "Speak: Read the same sentence again.", silence: 6 },
  ],
};

const LANGUAGE_RECORDING_PROMPTS: Record<string, { text: string; duration: number }[]> = {
  "Spanish": [
    { text: "Tell us about yourself", duration: 60 },
    { text: "Be silent", duration: 30 },
    { text: "Tell us about your hobbies", duration: 60 },
    { text: "Be silent", duration: 30 },
  ],
  "English": [
    { text: "Tell us about yourself", duration: 60 },
    { text: "Be silent", duration: 30 },
    { text: "Tell us about your hobbies", duration: 60 },
    { text: "Be silent", duration: 30 },
  ],
  "default": [
    { text: "Tell us about yourself", duration: 60 },
    { text: "Be silent", duration: 30 },
    { text: "Tell us about your hobbies", duration: 60 },
    { text: "Be silent", duration: 30 },
  ],
};

const pageVariants = {
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, x: -40, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } },
};

function CountdownCircle({ duration, timeLeft, isActive, isDone, promptIndex }: { duration: number; timeLeft: number; isActive: boolean; isDone: boolean; promptIndex: number }) {
  const size = 32;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const elapsed = duration - timeLeft;
  const dashOffset = isActive ? (circumference / duration) * elapsed : 0;

  if (isDone) {
    return (
      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
        <CheckCircle2 className="w-4 h-4 text-white" />
      </div>
    );
  }

  return (
    <div className="relative w-8 h-8 flex-shrink-0">
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} />
        {isActive && (
          <circle
            key={`active-${promptIndex}`}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        )}
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-semibold ${isActive ? "text-primary" : "text-muted-foreground"}`}>
        {isActive ? `${timeLeft}s` : `${duration}s`}
      </span>
    </div>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [primaryLanguage, setPrimaryLanguage] = useState("");
  const [otherLanguages, setOtherLanguages] = useState<string[]>([]);
  const [referralSource, setReferralSource] = useState("");
  const [ethnicity, setEthnicity] = useState("");
  const [gender, setGender] = useState("");
  const [occupation, setOccupation] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [educationLevel, setEducationLevel] = useState("");
  const [educationInLanguage, setEducationInLanguage] = useState("");
  const [accentDescription, setAccentDescription] = useState("");
  const [accentOrigin, setAccentOrigin] = useState("");
  const [locale, setLocale] = useState("");
  const [birthplace, setBirthplace] = useState("");
  const [birthplaceYears, setBirthplaceYears] = useState("");
  const [currentAddress, setCurrentAddress] = useState("");
  const [currentAddressLine2, setCurrentAddressLine2] = useState("");
  const [currentAddressYears, setCurrentAddressYears] = useState("");
  const [sampleAudioPath, setSampleAudioPath] = useState<string | null>(null);
  const [languageAudioPath, setLanguageAudioPath] = useState<string | null>(null);
  const { toast } = useToast();

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/applications", {
        firstName,
        lastName,
        primaryLanguage,
        otherLanguages,
        referralSource,
        ethnicity,
        gender,
        occupation,
        dateOfBirth,
        educationLevel,
        educationInLanguage,
        accentDescription,
        accentOrigin,
        locale,
        birthplace,
        birthplaceYears,
        currentAddress,
        currentAddressLine2: currentAddressLine2 || null,
        currentAddressYears,
        sampleAudioPath,
        languageAudioPath,
      });
      return res.json();
    },
    onSuccess: () => {
      setStep(20);
    },
    onError: () => {
      toast({ title: "Something went wrong", description: "Please try again later.", variant: "destructive" });
    },
  });

  const TOTAL_FORM_STEPS = 19;
  const progress = step > 0 && step < 20 ? Math.min((step / TOTAL_FORM_STEPS) * 100, 100) : 0;

  const canProceed = () => {
    switch (step) {
      case 0: return true;
      case 1: return true;
      case 2: return firstName.trim() !== "" && lastName.trim() !== "";
      case 3: return primaryLanguage !== "";
      case 4: return true;
      case 5: return referralSource !== "";
      case 6: return ethnicity !== "";
      case 7: return gender !== "";
      case 8: return occupation.trim() !== "";
      case 9: return dateOfBirth !== "";
      case 10: return educationLevel !== "";
      case 11: return educationInLanguage !== "";
      case 12: return accentDescription.trim() !== "";
      case 13: return locale !== "";
      case 14: return birthplace.trim() !== "" && birthplaceYears.trim() !== "";
      case 15: return currentAddress.trim() !== "" && currentAddressYears.trim() !== "";
      case 16: return true;
      case 17: return true;
      case 18: return true;
      case 19: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    setStep((s) => s + 1);
  };

  const toggleLanguage = (lang: string) => {
    setOtherLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const stepContent = () => {
    switch (step) {
      case 0: return <WelcomeStep onStart={() => setStep(1)} />;
      case 1: return <TutorialStep onContinue={() => setStep(2)} />;
      case 2: return <NameStep firstName={firstName} lastName={lastName} onFirstNameChange={setFirstName} onLastNameChange={setLastName} onSubmit={handleNext} canProceed={canProceed()} />;
      case 3: return <PrimaryLanguageStep value={primaryLanguage} onChange={setPrimaryLanguage} onSubmit={handleNext} canProceed={canProceed()} />;
      case 4: return <OtherLanguagesStep selected={otherLanguages} onToggle={toggleLanguage} onSubmit={handleNext} />;
      case 5: return <ReferralStep selected={referralSource} onSelect={setReferralSource} onSubmit={handleNext} canProceed={canProceed()} />;
      case 6: return <EthnicityStep value={ethnicity} onChange={setEthnicity} onSubmit={handleNext} canProceed={canProceed()} />;
      case 7: return <GenderStep value={gender} onChange={setGender} onSubmit={handleNext} canProceed={canProceed()} />;
      case 8: return <OccupationStep value={occupation} onChange={setOccupation} onSubmit={handleNext} canProceed={canProceed()} />;
      case 9: return <DateOfBirthStep value={dateOfBirth} onChange={setDateOfBirth} onSubmit={handleNext} canProceed={canProceed()} />;
      case 10: return <EducationStep value={educationLevel} onChange={setEducationLevel} onSubmit={handleNext} canProceed={canProceed()} />;
      case 11: return <EducationInLanguageStep value={educationInLanguage} onChange={setEducationInLanguage} primaryLanguage={primaryLanguage} onSubmit={handleNext} canProceed={canProceed()} />;
      case 12: return <AccentStep accentDescription={accentDescription} accentOrigin={accentOrigin} onDescriptionChange={setAccentDescription} onOriginChange={setAccentOrigin} onSubmit={handleNext} canProceed={canProceed()} />;
      case 13: return <LocaleStep value={locale} onChange={setLocale} primaryLanguage={primaryLanguage} onSubmit={handleNext} canProceed={canProceed()} />;
      case 14: return <BirthplaceStep birthplace={birthplace} years={birthplaceYears} onBirthplaceChange={setBirthplace} onYearsChange={setBirthplaceYears} onSubmit={handleNext} onBack={() => setStep(13)} canProceed={canProceed()} />;
      case 15: return <CurrentAddressStep address={currentAddress} addressLine2={currentAddressLine2} years={currentAddressYears} onAddressChange={setCurrentAddress} onAddressLine2Change={setCurrentAddressLine2} onYearsChange={setCurrentAddressYears} onSubmit={handleNext} onBack={() => setStep(14)} canProceed={canProceed()} />;
      case 16: return <NetworkTestStep onSubmit={handleNext} onBack={() => setStep(15)} />;
      case 17: return <RecordingInstructionsStep onNext={handleNext} onBack={() => setStep(16)} />;
      case 18: return <RecordSampleStep primaryLanguage={primaryLanguage} onSubmit={handleNext} onBack={() => setStep(17)} onAudioUploaded={setSampleAudioPath} />;
      case 19: return <RecordInLanguageStep primaryLanguage={primaryLanguage} onSubmit={() => submitMutation.mutate()} onBack={() => setStep(18)} isPending={submitMutation.isPending} onAudioUploaded={setLanguageAudioPath} />;
      case 20: return <SuccessStep />;
      default: return null;
    }
  };

  const maxWidth = [4, 5].includes(step) ? "max-w-2xl" : (step >= 14 && step <= 19) ? "max-w-xl" : "max-w-lg";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {step > 0 && step < 20 && (
        <div className="w-full">
          <div className="h-1 bg-muted">
            <motion.div className="h-full bg-primary" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
          </div>
        </div>
      )}
      {step > 0 && step < 14 && (
        <div className="px-6 pt-4">
          <button onClick={() => setStep((s) => Math.max(0, s - 1))} className="flex items-center gap-1 text-muted-foreground text-sm hover-elevate rounded-md px-2 py-1" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
      )}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <AnimatePresence mode="wait">
          <motion.div key={step} variants={pageVariants} initial="initial" animate="animate" exit="exit" className={`${maxWidth} w-full`}>
            {stepContent()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function WelcomeStep({ onStart }: { onStart: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
          <Globe className="w-5 h-5 text-primary" />
        </div>
      </div>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground" data-testid="text-title">Applying to Voice Atlas</h1>
        <p className="text-muted-foreground mt-3 text-base leading-relaxed max-w-md">The application usually takes about 15 minutes and includes a short audio audition, which should be completed from a quiet room.</p>
      </div>
      <Button onClick={onStart} size="lg" data-testid="button-start-application">Start Application <ChevronRight className="w-4 h-4 ml-1" /></Button>
    </div>
  );
}

function TutorialStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="text-tutorial-title">Audio Quality Tutorial</h2>
      <p className="text-muted-foreground text-sm leading-relaxed">Soon, you'll record an audio sample. These brief instructions will help you be successful.</p>
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2"><Volume2 className="w-4 h-4 text-primary flex-shrink-0" /><h3 className="font-semibold text-foreground text-sm">Find a Silent Environment</h3></div>
          <p className="text-muted-foreground text-sm leading-relaxed pl-6">Your surroundings must be completely free of background noise — no conversations, animals, appliances, or traffic. Even faint disruptions such as a distant siren, keyboard tapping, or a creaky chair may lead to your submission being declined.</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2"><Wifi className="w-4 h-4 text-primary flex-shrink-0" /><h3 className="font-semibold text-foreground text-sm">Use a Stable Internet Connection</h3></div>
          <p className="text-muted-foreground text-sm leading-relaxed pl-6">Cellular, mobile hotspot, and Home 5G connections are not supported by Voice Atlas. Please connect via a dependable WiFi network or a wired Ethernet connection before proceeding.</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2"><Mic className="w-4 h-4 text-primary flex-shrink-0" /><h3 className="font-semibold text-foreground text-sm">Prepare your Best Microphone</h3></div>
          <p className="text-muted-foreground text-sm leading-relaxed pl-6">For optimal audio quality, use a dedicated microphone rather than a built-in laptop mic. A USB condenser or professional XLR microphone will produce the best results.</p>
        </div>
      </div>
      <div className="rounded-lg overflow-hidden border border-border"><img src={micSetupImage} alt="Professional microphone setup" className="w-full h-auto object-cover" data-testid="img-microphone" /></div>
      <Button onClick={onContinue} data-testid="button-tutorial-continue">Continue <ChevronRight className="w-4 h-4 ml-1" /></Button>
    </div>
  );
}

function NameStep({ firstName, lastName, onFirstNameChange, onLastNameChange, onSubmit, canProceed }: { firstName: string; lastName: string; onFirstNameChange: (v: string) => void; onLastNameChange: (v: string) => void; onSubmit: () => void; canProceed: boolean }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="text-name-title">What is your <span className="text-primary font-bold">name</span>?*</h2>
        <p className="text-muted-foreground text-sm mt-2">We require this information to create your account with Voice Atlas.</p>
        <p className="text-muted-foreground text-sm mt-1">This must be your legal name and exactly match your government ID.</p>
      </div>
      <div className="space-y-5">
        <div className="space-y-2"><Label htmlFor="firstName" className="text-sm font-medium">First name*</Label><Input id="firstName" value={firstName} onChange={(e) => onFirstNameChange(e.target.value)} placeholder="Enter your first name" className="border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary text-base" data-testid="input-first-name" /></div>
        <div className="space-y-2"><Label htmlFor="lastName" className="text-sm font-medium">Last name*</Label><Input id="lastName" value={lastName} onChange={(e) => onLastNameChange(e.target.value)} placeholder="Enter your last name" className="border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary text-base" data-testid="input-last-name" /></div>
      </div>
      <Button onClick={onSubmit} disabled={!canProceed} data-testid="button-name-ok">OK <ChevronRight className="w-4 h-4 ml-1" /></Button>
    </div>
  );
}

function PrimaryLanguageStep({ value, onChange, onSubmit, canProceed }: { value: string; onChange: (v: string) => void; onSubmit: () => void; canProceed: boolean }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="text-primary-lang-title">What is your <span className="text-primary font-bold">primary language</span>?*</h2>
        <p className="text-muted-foreground text-sm mt-2">Select the language which you speak most frequently and most fluently. This is most likely the language you learned from birth and/or use in the workplace.</p>
      </div>
      <div className="bg-primary/5 border border-primary/20 rounded-md p-3">
        <p className="text-sm"><span className="font-semibold text-primary">Languages in high demand:</span></p>
        <p className="text-sm text-muted-foreground mt-1">{HIGH_DEMAND.join(", ")} -- if you speak one of these languages fluently, apply for these.</p>
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="border-0 border-b border-border rounded-none px-0 focus:ring-0 text-base" data-testid="select-primary-language"><SelectValue placeholder="Select a language" /></SelectTrigger>
        <SelectContent>{PRIMARY_LANGUAGES.map((lang) => (<SelectItem key={lang} value={lang}>{lang}</SelectItem>))}</SelectContent>
      </Select>
      <Button onClick={onSubmit} disabled={!canProceed} data-testid="button-primary-lang-ok">OK <ChevronRight className="w-4 h-4 ml-1" /></Button>
    </div>
  );
}

function OtherLanguagesStep({ selected, onToggle, onSubmit }: { selected: string[]; onToggle: (lang: string) => void; onSubmit: () => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="text-other-langs-title">What <span className="text-primary font-bold">other languages</span> do you speak fluently?</h2>
        <p className="text-muted-foreground text-sm mt-2">Only include languages that you have conversational fluency in. In the future you may be provided an opportunity to apply for these languages.</p>
      </div>
      <p className="text-xs text-muted-foreground">Choose as many as you like</p>
      <div className="grid grid-cols-3 gap-2">
        {LANGUAGES.map((lang) => (<button key={lang} onClick={() => onToggle(lang)} className={`px-3 py-2.5 text-sm rounded-md border text-left transition-colors ${selected.includes(lang) ? "bg-primary/10 border-primary text-primary font-medium" : "border-border bg-background text-foreground"}`} data-testid={`button-lang-${lang.toLowerCase().replace(/[^a-z]/g, '-')}`}>{lang}</button>))}
      </div>
      <Button onClick={onSubmit} data-testid="button-other-langs-ok">OK <ChevronRight className="w-4 h-4 ml-1" /></Button>
    </div>
  );
}

function ReferralStep({ selected, onSelect, onSubmit, canProceed }: { selected: string; onSelect: (v: string) => void; onSubmit: () => void; canProceed: boolean }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="text-referral-title">How did you <span className="text-primary font-bold">hear about us</span>?*</h2>
        <p className="text-muted-foreground text-sm mt-2">This helps our team better understand where to focus our efforts.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {REFERRAL_SOURCES.map((source) => (<button key={source} onClick={() => onSelect(source)} className={`px-3 py-2.5 text-sm rounded-md border text-left transition-colors ${selected === source ? "bg-primary/10 border-primary text-primary font-medium" : "border-border bg-background text-foreground"}`} data-testid={`button-referral-${source.toLowerCase().replace(/[^a-z]/g, '-')}`}>{source}</button>))}
      </div>
      <Button onClick={onSubmit} disabled={!canProceed} data-testid="button-referral-ok">OK <ChevronRight className="w-4 h-4 ml-1" /></Button>
    </div>
  );
}

function DropdownStep({ title, highlight, description, placeholder, options, value, onChange, onSubmit, canProceed, testIdPrefix }: { title: string; highlight: string; description: string; placeholder: string; options: string[]; value: string; onChange: (v: string) => void; onSubmit: () => void; canProceed: boolean; testIdPrefix: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground" data-testid={`text-${testIdPrefix}-title`}>{title} <span className="text-primary font-bold">{highlight}</span>?*</h2>
        <p className="text-muted-foreground text-sm mt-2">{description}</p>
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="border-0 border-b border-border rounded-none px-0 focus:ring-0 text-base" data-testid={`select-${testIdPrefix}`}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>{options.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent>
      </Select>
      <Button onClick={onSubmit} disabled={!canProceed} data-testid={`button-${testIdPrefix}-ok`}>OK <ChevronRight className="w-4 h-4 ml-1" /></Button>
    </div>
  );
}

function EthnicityStep({ value, onChange, onSubmit, canProceed }: { value: string; onChange: (v: string) => void; onSubmit: () => void; canProceed: boolean }) {
  return <DropdownStep title="What is your" highlight="ethnicity" description="This information helps us ensure diverse representation across our projects." placeholder="Select your ethnicity" options={ETHNICITIES} value={value} onChange={onChange} onSubmit={onSubmit} canProceed={canProceed} testIdPrefix="ethnicity" />;
}

function GenderStep({ value, onChange, onSubmit, canProceed }: { value: string; onChange: (v: string) => void; onSubmit: () => void; canProceed: boolean }) {
  return <DropdownStep title="What is your" highlight="gender" description="This helps us match you with appropriate voice projects." placeholder="Select your gender" options={GENDERS} value={value} onChange={onChange} onSubmit={onSubmit} canProceed={canProceed} testIdPrefix="gender" />;
}

function OccupationStep({ value, onChange, onSubmit, canProceed }: { value: string; onChange: (v: string) => void; onSubmit: () => void; canProceed: boolean }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="text-occupation-title">What is your <span className="text-primary font-bold">occupation</span>?*</h2>
        <p className="text-muted-foreground text-sm mt-2">Tell us what you do for a living or your current professional role.</p>
      </div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. Software Engineer, Teacher, Student" className="border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary text-base" data-testid="input-occupation" />
      <Button onClick={onSubmit} disabled={!canProceed} data-testid="button-occupation-ok">OK <ChevronRight className="w-4 h-4 ml-1" /></Button>
    </div>
  );
}

function DateOfBirthStep({ value, onChange, onSubmit, canProceed }: { value: string; onChange: (v: string) => void; onSubmit: () => void; canProceed: boolean }) {
  const [day, setDay] = useState(value ? value.split("-")[2] : "");
  const [month, setMonth] = useState(value ? value.split("-")[1] : "");
  const [year, setYear] = useState(value ? value.split("-")[0] : "");

  const days = Array.from({ length: 31 }, (_, i) => (i + 1).toString().padStart(2, "0"));
  const months = [
    { value: "01", label: "January" },
    { value: "02", label: "February" },
    { value: "03", label: "March" },
    { value: "04", label: "April" },
    { value: "05", label: "May" },
    { value: "06", label: "June" },
    { value: "07", label: "July" },
    { value: "08", label: "August" },
    { value: "09", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];
  
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1900 + 1 }, (_, i) => (currentYear - i).toString());

  useEffect(() => {
    if (day && month && year) {
      const dateStr = `${year}-${month}-${day}`;
      const selectedDate = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (selectedDate < today) {
        onChange(dateStr);
      } else {
        onChange("");
      }
    } else {
      onChange("");
    }
  }, [day, month, year, onChange]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="text-dob-title">What is your <span className="text-primary font-bold">date of birth</span>?*</h2>
        <p className="text-muted-foreground text-sm mt-2">You must be at least 18 years old to apply.</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground uppercase">Month</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="border-0 border-b border-border rounded-none px-0 focus:ring-0 text-base" data-testid="select-dob-month">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground uppercase">Day</Label>
          <Select value={day} onValueChange={setDay}>
            <SelectTrigger className="border-0 border-b border-border rounded-none px-0 focus:ring-0 text-base" data-testid="select-dob-day">
              <SelectValue placeholder="Day" />
            </SelectTrigger>
            <SelectContent>
              {days.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground uppercase">Year</Label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="border-0 border-b border-border rounded-none px-0 focus:ring-0 text-base" data-testid="select-dob-year">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button onClick={onSubmit} disabled={!canProceed} data-testid="button-dob-ok">OK <ChevronRight className="w-4 h-4 ml-1" /></Button>
    </div>
  );
}

function EducationStep({ value, onChange, onSubmit, canProceed }: { value: string; onChange: (v: string) => void; onSubmit: () => void; canProceed: boolean }) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="text-education-title">What is the highest level of education you have completed?</h2>
      <div className="flex flex-col gap-2">
        {EDUCATION_LEVELS.map((level) => (<button key={level} onClick={() => onChange(level)} className={`px-4 py-3 text-sm rounded-md border text-left transition-colors ${value === level ? "bg-primary/10 border-primary text-primary font-medium" : "border-border bg-background text-foreground"}`} data-testid={`button-edu-${level.toLowerCase().replace(/[^a-z]/g, '-')}`}>{level}</button>))}
      </div>
      <Button onClick={onSubmit} disabled={!canProceed} data-testid="button-education-ok">OK <ChevronRight className="w-4 h-4 ml-1" /></Button>
    </div>
  );
}

function EducationInLanguageStep({ value, onChange, primaryLanguage, onSubmit, canProceed }: { value: string; onChange: (v: string) => void; primaryLanguage: string; onSubmit: () => void; canProceed: boolean }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="text-education-lang-title">What is the most education you have completed in {primaryLanguage}?</h2>
        <p className="text-muted-foreground text-sm mt-2">Only include if the primary language was {primaryLanguage}.</p>
      </div>
      <div className="flex flex-col gap-2">
        {EDUCATION_IN_LANGUAGE_LEVELS.map((level) => (<button key={level} onClick={() => onChange(level)} className={`px-4 py-3 text-sm rounded-md border text-left transition-colors ${value === level ? "bg-primary/10 border-primary text-primary font-medium" : "border-border bg-background text-foreground"}`} data-testid={`button-edu-lang-${level.toLowerCase().replace(/[^a-z]/g, '-')}`}>{level}</button>))}
      </div>
      <Button onClick={onSubmit} disabled={!canProceed} data-testid="button-education-lang-ok">OK <ChevronRight className="w-4 h-4 ml-1" /></Button>
    </div>
  );
}

function AccentStep({ accentDescription, accentOrigin, onDescriptionChange, onOriginChange, onSubmit, canProceed }: { accentDescription: string; accentOrigin: string; onDescriptionChange: (v: string) => void; onOriginChange: (v: string) => void; onSubmit: () => void; canProceed: boolean }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="text-accent-title">Describe your accent to the best of your ability*</h2>
        <p className="text-muted-foreground text-sm mt-2">For example: "I speak English with a mild Southern accent, though most people say I sound fairly neutral," or "I have a slight New York accent, but it's not very strong."</p>
      </div>
      <div className="space-y-5">
        <Input value={accentDescription} onChange={(e) => onDescriptionChange(e.target.value)} placeholder="e.g. I speak Spanish with a Porteno accent" className="border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary text-base" data-testid="input-accent-description" />
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">How did you acquire or develop your accent?</Label>
          <Input value={accentOrigin} onChange={(e) => onOriginChange(e.target.value)} placeholder="e.g. Grew up in Buenos Aires" className="border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary text-base" data-testid="input-accent-origin" />
          <p className="text-xs text-muted-foreground">Shift + Enter to make a line break</p>
        </div>
      </div>
      <Button onClick={onSubmit} disabled={!canProceed} data-testid="button-accent-ok">OK <ChevronRight className="w-4 h-4 ml-1" /></Button>
    </div>
  );
}

function LocaleStep({ value, onChange, primaryLanguage, onSubmit, canProceed }: { value: string; onChange: (v: string) => void; primaryLanguage: string; onSubmit: () => void; canProceed: boolean }) {
  const locales = LOCALE_MAP[primaryLanguage] || ["Other"];
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-foreground text-center" data-testid="text-locale-title">Select Your Locale</h2>
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <p className="text-muted-foreground text-sm">You speak {primaryLanguage}. Let's get more specific:</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2"><Target className="w-4 h-4 text-primary flex-shrink-0" /><p className="text-sm text-muted-foreground">Your dialect helps us match you with the right projects</p></div>
          <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary flex-shrink-0" /><p className="text-sm text-muted-foreground">Select the region that best matches your speech</p></div>
        </div>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="w-full" data-testid="select-locale"><SelectValue placeholder="Select your locale" /></SelectTrigger>
          <SelectContent>{locales.map((loc) => (<SelectItem key={loc} value={loc}>{loc}</SelectItem>))}</SelectContent>
        </Select>
      </div>
      <div className="flex justify-center"><Button onClick={onSubmit} disabled={!canProceed} data-testid="button-locale-ok">OK <ChevronRight className="w-4 h-4 ml-1" /></Button></div>
    </div>
  );
}

function BirthplaceStep({ birthplace, years, onBirthplaceChange, onYearsChange, onSubmit, onBack, canProceed }: { birthplace: string; years: string; onBirthplaceChange: (v: string) => void; onYearsChange: (v: string) => void; onSubmit: () => void; onBack: () => void; canProceed: boolean }) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-foreground text-center" data-testid="text-birthplace-title">Location Information</h2>
      <div className="bg-card border border-border rounded-lg p-6 space-y-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary flex-shrink-0" /><p className="text-sm text-muted-foreground">Your birthplace helps us understand your accent</p></div>
          <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-primary flex-shrink-0" /><p className="text-sm text-muted-foreground">Time in a location affects how your accent develops</p></div>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">Where were you born?</Label>
          <LocationAutocomplete value={birthplace} onChange={onBirthplaceChange} placeholder="e.g. Belgrano, Buenos Aires, Argentina" testId="input-birthplace" />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">How long did you live there?</Label>
          <Input value={years} onChange={(e) => onYearsChange(e.target.value)} placeholder="e.g. 15" className="text-sm" data-testid="input-birthplace-years" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onBack} data-testid="button-birthplace-back"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
        <Button onClick={onSubmit} disabled={!canProceed} className="flex-1" data-testid="button-birthplace-next">Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
      </div>
    </div>
  );
}

function CurrentAddressStep({ address, addressLine2, years, onAddressChange, onAddressLine2Change, onYearsChange, onSubmit, onBack, canProceed }: { address: string; addressLine2: string; years: string; onAddressChange: (v: string) => void; onAddressLine2Change: (v: string) => void; onYearsChange: (v: string) => void; onSubmit: () => void; onBack: () => void; canProceed: boolean }) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-foreground text-center" data-testid="text-address-title">Location Information</h2>
      <div className="bg-card border border-border rounded-lg p-6 space-y-5">
        <h3 className="font-semibold text-foreground text-sm">What's your current address?</h3>
        <div className="space-y-2">
          <Label className="text-sm font-medium">Current Address</Label>
          <LocationAutocomplete value={address} onChange={onAddressChange} placeholder="e.g. 3 de Febrero 2300, Buenos Aires, Argentina" testId="input-current-address" />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">Address line 2 (Optional)</Label>
          <Input value={addressLine2} onChange={(e) => onAddressLine2Change(e.target.value)} placeholder="Apt, suite, etc." className="text-sm" data-testid="input-address-line2" />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">Years lived in current region</Label>
          <Input value={years} onChange={(e) => onYearsChange(e.target.value)} placeholder="e.g. 5" className="text-sm" data-testid="input-current-address-years" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onBack} data-testid="button-address-back"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
        <Button onClick={onSubmit} disabled={!canProceed} className="flex-1" data-testid="button-address-continue">Continue</Button>
      </div>
    </div>
  );
}

type SpeedLevel = "poor" | "fair" | "good" | "excellent";

function getSpeedLevel(downloadMbps: number, uploadMbps: number, latencyMs: number): SpeedLevel {
  if (downloadMbps < 1 || uploadMbps < 0.5 || latencyMs > 500) return "poor";
  if (downloadMbps < 5 || uploadMbps < 2 || latencyMs > 200) return "fair";
  if (downloadMbps < 25 || uploadMbps < 10 || latencyMs > 100) return "good";
  return "excellent";
}

const SPEED_CONFIG: Record<SpeedLevel, { label: string; color: string; bgColor: string; borderColor: string; description: string }> = {
  poor: { label: "Poor", color: "text-red-500", bgColor: "bg-red-500/10", borderColor: "border-red-500/40", description: "Your connection may cause issues with audio uploads. Consider using a stronger network." },
  fair: { label: "Fair", color: "text-yellow-500", bgColor: "bg-yellow-500/10", borderColor: "border-yellow-500/40", description: "Your connection should work, but uploads may be slow." },
  good: { label: "Good", color: "text-emerald-500", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/40", description: "Your connection is solid. You're all set to record." },
  excellent: { label: "Excellent", color: "text-primary", bgColor: "bg-primary/10", borderColor: "border-primary/40", description: "Your connection is excellent. Perfect for recording." },
};

function NetworkTestStep({ onSubmit, onBack }: { onSubmit: () => void; onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "ping" | "download" | "upload" | "done">("idle");
  const [latency, setLatency] = useState<number | null>(null);
  const [downloadSpeed, setDownloadSpeed] = useState<number | null>(null);
  const [uploadSpeed, setUploadSpeed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const makeUploadBlob = useCallback((sizeBytes: number) => {
    const data = new Uint8Array(sizeBytes);
    for (let offset = 0; offset < sizeBytes; offset += 65536) {
      crypto.getRandomValues(data.subarray(offset, Math.min(offset + 65536, sizeBytes)));
    }
    return data;
  }, []);

  const runTest = useCallback(async () => {
    setPhase("ping");
    setLatency(null);
    setDownloadSpeed(null);
    setUploadSpeed(null);
    setError(null);

    try {
      await fetch("/api/network-test/ping", { cache: "no-store" });

      const pings: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        const r = await fetch("/api/network-test/ping", { cache: "no-store" });
        if (!r.ok) throw new Error("Ping failed");
        await r.json();
        pings.push(performance.now() - t0);
      }
      pings.sort((a, b) => a - b);
      const trimmed = pings.slice(1, -1);
      const avgLatency = Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
      setLatency(avgLatency);

      setPhase("download");
      const dlSpeeds: number[] = [];
      for (let round = 0; round < 3; round++) {
        const sizeMB = round === 0 ? 2 : 5;
        const t0 = performance.now();
        const res = await fetch(`/api/network-test/download?size=${sizeMB}&r=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Download failed");
        const blob = await res.blob();
        const elapsed = (performance.now() - t0) / 1000;
        const mbps = (blob.size * 8) / (elapsed * 1_000_000);
        dlSpeeds.push(mbps);
      }
      dlSpeeds.sort((a, b) => a - b);
      const bestDl = dlSpeeds[dlSpeeds.length - 1];
      const medianDl = dlSpeeds[Math.floor(dlSpeeds.length / 2)];
      const dlResult = Math.round(((bestDl + medianDl) / 2) * 10) / 10;
      setDownloadSpeed(dlResult);

      setPhase("upload");
      const ulSpeeds: number[] = [];
      for (let round = 0; round < 3; round++) {
        const sizeBytes = round === 0 ? 1 * 1024 * 1024 : 2 * 1024 * 1024;
        const blob = makeUploadBlob(sizeBytes);
        const t0 = performance.now();
        const res = await fetch("/api/network-test/upload", {
          method: "POST",
          body: blob,
          headers: { "Content-Type": "application/octet-stream" },
        });
        if (!res.ok) throw new Error("Upload failed");
        await res.json();
        const elapsed = (performance.now() - t0) / 1000;
        const mbps = (sizeBytes * 8) / (elapsed * 1_000_000);
        ulSpeeds.push(mbps);
      }
      ulSpeeds.sort((a, b) => a - b);
      const bestUl = ulSpeeds[ulSpeeds.length - 1];
      const medianUl = ulSpeeds[Math.floor(ulSpeeds.length / 2)];
      const ulResult = Math.round(((bestUl + medianUl) / 2) * 10) / 10;
      setUploadSpeed(ulResult);

      setPhase("done");
    } catch {
      setError("Network test failed. Please check your connection and try again.");
      setPhase("idle");
    }
  }, [makeUploadBlob]);

  const speedLevel = phase === "done" && downloadSpeed !== null && uploadSpeed !== null && latency !== null
    ? getSpeedLevel(downloadSpeed, uploadSpeed, latency)
    : null;

  const config = speedLevel ? SPEED_CONFIG[speedLevel] : null;

  const phaseLabels = [
    { key: "ping", label: "Testing latency..." },
    { key: "download", label: "Testing download speed..." },
    { key: "upload", label: "Testing upload speed..." },
  ];

  const activePhaseIdx = phaseLabels.findIndex(p => p.key === phase);

  const isRunning = phase !== "idle" && phase !== "done";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground" data-testid="text-network-test-title">Network Test</h2>
        <p className="text-muted-foreground text-sm mt-2 max-w-md mx-auto">We'll check your connection to our server to make sure audio recordings can upload smoothly.</p>
      </div>

      {phase === "idle" && !error && (
        <div className="bg-card border border-border rounded-lg p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Wifi className="w-8 h-8 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">Tap the button below to test your download speed, upload speed, and latency. This usually takes a few seconds.</p>
          <Button onClick={runTest} size="lg" className="px-8" data-testid="button-network-start">
            <Wifi className="w-4 h-4 mr-2" /> Start Test
          </Button>
        </div>
      )}

      {isRunning && (
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          {phaseLabels.map((p, i) => {
            const isActive = p.key === phase;
            const isDone = activePhaseIdx > i;
            return (
              <div key={p.key} className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-300 ${isDone ? "bg-primary/10 border-primary/40" : isActive ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20" : "border-border"}`}>
                {isDone ? (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                ) : isActive ? (
                  <div className="w-8 h-8 rounded-full border-2 border-primary flex items-center justify-center flex-shrink-0">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full border-2 border-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-muted-foreground font-medium">{i + 1}</span>
                  </div>
                )}
                <p className={`text-sm ${isDone ? "text-foreground/70" : isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>{p.label}</p>
                {isActive && <span className="w-2 h-2 rounded-full bg-primary animate-pulse flex-shrink-0 ml-auto" />}
              </div>
            );
          })}
        </div>
      )}

      {phase === "done" && config && (
        <div className={`rounded-lg border-2 p-6 space-y-5 ${config.borderColor} ${config.bgColor}`}>
          <div className="text-center space-y-2">
            <div className={`inline-flex items-center gap-2 text-lg font-bold ${config.color}`} data-testid="text-speed-level">
              <Wifi className="w-5 h-5" />
              {config.label}
            </div>
            <p className="text-sm text-foreground/70">{config.description}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-background/60 rounded-lg p-3 text-center space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Latency</p>
              <p className="text-lg font-bold text-foreground" data-testid="text-latency">{latency} ms</p>
            </div>
            <div className="bg-background/60 rounded-lg p-3 text-center space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Download</p>
              <p className="text-lg font-bold text-foreground" data-testid="text-download-speed">{downloadSpeed} Mbps</p>
            </div>
            <div className="bg-background/60 rounded-lg p-3 text-center space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Upload</p>
              <p className="text-lg font-bold text-foreground" data-testid="text-upload-speed">{uploadSpeed} Mbps</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/40 rounded-lg p-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onBack} data-testid="button-network-back"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
        {(phase === "done" || error) && (
          <Button variant="outline" onClick={runTest} data-testid="button-network-rerun"><RotateCcw className="w-4 h-4 mr-1" /> Re-run Test</Button>
        )}
        {phase === "done" && (
          <Button onClick={onSubmit} className="flex-1" data-testid="button-network-continue">Continue <ChevronRight className="w-4 h-4 ml-1" /></Button>
        )}
      </div>
    </div>
  );
}

function RecordingInstructionsStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-foreground text-center" data-testid="text-recording-instructions-title">Recording Instructions</h2>
      <div className="bg-card border border-border rounded-lg p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><Mic className="w-4 h-4 text-primary" /></div>
          <p className="text-sm text-foreground"><span className="font-semibold text-primary">Audio samples</span> are submitted at this step.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><Volume2 className="w-4 h-4 text-primary" /></div>
          <p className="text-sm text-foreground"><span className="font-semibold text-primary">Speak naturally</span> at a comfortable volume</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><CheckCircle2 className="w-4 h-4 text-primary" /></div>
          <p className="text-sm text-foreground"><span className="font-semibold text-primary">One take</span> where you answer multiple questions together</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onBack} data-testid="button-instructions-back"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
        <Button onClick={onNext} className="flex-1" data-testid="button-instructions-next">Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
      </div>
    </div>
  );
}

function RecordSampleStep({ primaryLanguage, onSubmit, onBack, onAudioUploaded }: { primaryLanguage: string; onSubmit: () => void; onBack: () => void; onAudioUploaded: (path: string | null) => void }) {
  const prompts = SAMPLE_PROMPTS[primaryLanguage] || SAMPLE_PROMPTS["default"];
  const [recording, setRecording] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lastBlobRef = useRef<Blob | null>(null);

  const promptBoundaries = useMemo(() => {
    const boundaries: number[] = [];
    let cumulative = 0;
    for (const p of prompts) {
      cumulative += p.silence;
      boundaries.push(cumulative);
    }
    return boundaries;
  }, [prompts]);

  const totalDuration = promptBoundaries[promptBoundaries.length - 1];

  const activePromptIdx = useMemo(() => {
    if (!recording && !completed) return -1;
    if (completed) return -1;
    for (let i = 0; i < promptBoundaries.length; i++) {
      if (totalElapsed < promptBoundaries[i]) return i;
    }
    return -1;
  }, [recording, completed, totalElapsed, promptBoundaries]);

  const promptTimeLeft = useMemo(() => {
    if (activePromptIdx < 0) return 0;
    return promptBoundaries[activePromptIdx] - totalElapsed;
  }, [activePromptIdx, totalElapsed, promptBoundaries]);

  const isPromptDone = useCallback((i: number) => {
    if (completed) return true;
    return totalElapsed >= promptBoundaries[i];
  }, [completed, totalElapsed, promptBoundaries]);

  const uploadAudio = useCallback(async (blob: Blob) => {
    setUploading(true);
    setUploadFailed(false);
    lastBlobRef.current = blob;
    try {
      const res = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "sample-recording.webm", size: blob.size, contentType: "audio/webm" }),
      });
      const { uploadURL, objectPath } = await res.json();
      await fetch(uploadURL, { method: "PUT", body: blob, headers: { "Content-Type": "audio/webm" } });
      onAudioUploaded(objectPath);
      setUploaded(true);
    } catch {
      setUploadFailed(true);
      onAudioUploaded(null);
    } finally {
      setUploading(false);
    }
  }, [onAudioUploaded]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        uploadAudio(blob);
      };
      mediaRecorder.start();
      setRecording(true);
      setTotalElapsed(0);

      let elapsed = 0;
      timerRef.current = setInterval(() => {
        elapsed += 1;
        setTotalElapsed(elapsed);
        if (elapsed >= totalDuration) {
          clearInterval(timerRef.current!);
          mediaRecorder.stop();
          stream.getTracks().forEach(t => t.stop());
          setRecording(false);
          setCompleted(true);
        }
      }, 1000);
    } catch {
      setCompleted(true);
    }
  }, [prompts, uploadAudio, totalDuration]);

  const restart = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    setCompleted(false);
    setUploaded(false);
    setUploadFailed(false);
    setTotalElapsed(0);
    onAudioUploaded(null);
  };

  const retryUpload = () => {
    if (lastBlobRef.current) uploadAudio(lastBlobRef.current);
  };

  useEffect(() => { return () => { if (timerRef.current) clearInterval(timerRef.current); }; }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-foreground text-center" data-testid="text-record-sample-title">Record a Sample</h2>
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        {prompts.map((p, i) => {
          const isDone = isPromptDone(i);
          const isCurrent = activePromptIdx === i;
          return (
            <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-300 ${isDone ? "bg-primary/10 border-primary/40 shadow-sm" : isCurrent ? "bg-primary/5 border-primary/30 shadow-sm ring-1 ring-primary/20" : "border-border bg-transparent"}`}>
              <CountdownCircle duration={p.silence} timeLeft={isCurrent ? promptTimeLeft : p.silence} isActive={isCurrent} isDone={isDone} promptIndex={i} />
              <p className={`text-sm flex-1 ${isDone ? "text-foreground/70" : isCurrent ? "text-foreground font-medium" : "text-foreground"}`}>{p.speak}</p>
              {isCurrent && <span className="w-2 h-2 rounded-full bg-destructive animate-pulse flex-shrink-0" />}
            </div>
          );
        })}
      </div>
      {recording && (
        <p className="text-center text-sm text-primary font-medium flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          Recording in progress...
        </p>
      )}
      {uploading && (
        <p className="text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Uploading recording...
        </p>
      )}
      {uploadFailed && (
        <div className="text-center space-y-2">
          <p className="text-sm text-destructive">Upload failed. Please retry or re-record.</p>
          <Button variant="outline" size="sm" onClick={retryUpload} data-testid="button-retry-upload"><RotateCcw className="w-3 h-3 mr-1" /> Retry Upload</Button>
        </div>
      )}
      <div className="flex items-center gap-3">
        {!recording && !completed && (
          <>
            <Button variant="outline" onClick={onBack} data-testid="button-sample-back"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
            <Button onClick={startRecording} className="flex-1" data-testid="button-record-start">Record <ChevronRight className="w-4 h-4 ml-1" /></Button>
          </>
        )}
        {completed && !uploading && (
          <>
            <Button variant="outline" onClick={restart} className="flex-1" data-testid="button-record-restart"><RotateCcw className="w-4 h-4 mr-1" /> Restart</Button>
            <Button onClick={onSubmit} disabled={!uploaded} className="flex-1" data-testid="button-sample-submit">Submit <ChevronRight className="w-4 h-4 ml-1" /></Button>
          </>
        )}
      </div>
    </div>
  );
}

function RecordInLanguageStep({ primaryLanguage, onSubmit, onBack, isPending, onAudioUploaded }: { primaryLanguage: string; onSubmit: () => void; onBack: () => void; isPending: boolean; onAudioUploaded: (path: string | null) => void }) {
  const allPrompts = LANGUAGE_RECORDING_PROMPTS[primaryLanguage] || LANGUAGE_RECORDING_PROMPTS["default"];
  const [recording, setRecording] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [unlockedCount, setUnlockedCount] = useState(2);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lastBlobRef = useRef<Blob | null>(null);
  const [retries, setRetries] = useState(0);

  const promptBoundaries = useMemo(() => {
    const boundaries: number[] = [];
    let cumulative = 0;
    for (const p of allPrompts) {
      cumulative += p.duration;
      boundaries.push(cumulative);
    }
    return boundaries;
  }, [allPrompts]);

  const totalDuration = promptBoundaries[promptBoundaries.length - 1];

  const activePromptIdx = useMemo(() => {
    if (!recording && !completed) return -1;
    if (completed) return -1;
    for (let i = 0; i < promptBoundaries.length; i++) {
      if (totalElapsed < promptBoundaries[i]) return i;
    }
    return -1;
  }, [recording, completed, totalElapsed, promptBoundaries]);

  const promptTimeLeft = useMemo(() => {
    if (activePromptIdx < 0) return 0;
    return promptBoundaries[activePromptIdx] - totalElapsed;
  }, [activePromptIdx, totalElapsed, promptBoundaries]);

  const isPromptDone = useCallback((i: number) => {
    if (completed) return true;
    return totalElapsed >= promptBoundaries[i];
  }, [completed, totalElapsed, promptBoundaries]);

  const uploadAudio = useCallback(async (blob: Blob) => {
    setUploading(true);
    setUploadFailed(false);
    lastBlobRef.current = blob;
    try {
      const res = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "language-recording.webm", size: blob.size, contentType: "audio/webm" }),
      });
      const { uploadURL, objectPath } = await res.json();
      await fetch(uploadURL, { method: "PUT", body: blob, headers: { "Content-Type": "audio/webm" } });
      onAudioUploaded(objectPath);
      setUploaded(true);
    } catch {
      setUploadFailed(true);
      onAudioUploaded(null);
    } finally {
      setUploading(false);
    }
  }, [onAudioUploaded]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        uploadAudio(blob);
      };
      mediaRecorder.start();
      setRecording(true);
      setTotalElapsed(0);

      let elapsed = 0;
      let lastUnlocked = 2;
      timerRef.current = setInterval(() => {
        elapsed += 1;
        setTotalElapsed(elapsed);
        if (lastUnlocked < allPrompts.length && elapsed >= promptBoundaries[1]) {
          setUnlockedCount(allPrompts.length);
          lastUnlocked = allPrompts.length;
        }
        if (elapsed >= totalDuration) {
          clearInterval(timerRef.current!);
          mediaRecorder.stop();
          stream.getTracks().forEach(t => t.stop());
          setRecording(false);
          setCompleted(true);
        }
      }, 1000);
    } catch {
      setCompleted(true);
      setUnlockedCount(allPrompts.length);
    }
  }, [allPrompts, uploadAudio, totalDuration, promptBoundaries]);

  const restart = () => {
    if (retries >= 2) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    setCompleted(false);
    setUploaded(false);
    setUploadFailed(false);
    setTotalElapsed(0);
    setUnlockedCount(2);
    setRetries(r => r + 1);
    onAudioUploaded(null);
  };

  const retryUpload = () => {
    if (lastBlobRef.current) uploadAudio(lastBlobRef.current);
  };

  useEffect(() => { return () => { if (timerRef.current) clearInterval(timerRef.current); }; }, []);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground" data-testid="text-record-language-title">Record In {primaryLanguage}</h2>
        <p className="text-muted-foreground text-sm mt-2 max-w-md mx-auto">Complete one continuous recording made up of {allPrompts.length} parts. Parts 3 and 4 will appear once the Part 2 timer finishes. You can retry the full recording up to 3 times.</p>
      </div>
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        {allPrompts.map((p, i) => {
          const isDone = isPromptDone(i);
          const isCurrent = activePromptIdx === i;
          const isLocked = i >= unlockedCount && !isDone;
          return (
            <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-300 ${isDone ? "bg-primary/10 border-primary/40 shadow-sm" : isCurrent ? "bg-primary/5 border-primary/30 shadow-sm ring-1 ring-primary/20" : isLocked ? "bg-muted/50 border-border opacity-60" : "border-border bg-transparent"}`}>
              {isLocked ? (
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              ) : (
                <CountdownCircle duration={p.duration} timeLeft={isCurrent ? promptTimeLeft : p.duration} isActive={isCurrent} isDone={isDone} promptIndex={i} />
              )}
              <p className={`text-sm flex-1 ${isLocked ? "text-muted-foreground blur-[2px]" : isDone ? "text-foreground/70" : isCurrent ? "text-foreground font-medium" : "text-foreground"}`}>{isLocked ? "Coming up..." : p.text}</p>
              {isCurrent && <span className="w-2 h-2 rounded-full bg-destructive animate-pulse flex-shrink-0" />}
            </div>
          );
        })}
      </div>
      {recording && (
        <p className="text-center text-sm text-primary font-medium flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          Recording in progress...
        </p>
      )}
      {uploading && (
        <p className="text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Uploading recording...
        </p>
      )}
      {uploadFailed && (
        <div className="text-center space-y-2">
          <p className="text-sm text-destructive">Upload failed. Please retry or re-record.</p>
          <Button variant="outline" size="sm" onClick={retryUpload} data-testid="button-lang-retry-upload"><RotateCcw className="w-3 h-3 mr-1" /> Retry Upload</Button>
        </div>
      )}
      <div className="flex items-center gap-3">
        {!recording && !completed && (
          <>
            <Button variant="outline" onClick={onBack} data-testid="button-lang-record-back"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
            <Button onClick={startRecording} className="flex-1" data-testid="button-lang-record-start">Record <ChevronRight className="w-4 h-4 ml-1" /></Button>
          </>
        )}
        {completed && !uploading && (
          <>
            {retries < 2 && <Button variant="outline" onClick={restart} className="flex-1" data-testid="button-lang-record-restart"><RotateCcw className="w-4 h-4 mr-1" /> Restart</Button>}
            <Button onClick={onSubmit} disabled={isPending || !uploaded} className="flex-1" data-testid="button-lang-record-submit">{isPending ? "Submitting..." : "Submit"} {!isPending && <ChevronRight className="w-4 h-4 ml-1" />}</Button>
          </>
        )}
      </div>
    </div>
  );
}

function SuccessStep() {
  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center"><div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center"><CheckCircle2 className="w-8 h-8 text-primary" /></div></div>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="text-success-title">Application Submitted</h2>
        <p className="text-muted-foreground mt-3 text-base leading-relaxed max-w-md mx-auto">Thank you for applying to Voice Atlas. We'll review your application and get back to you within a few business days.</p>
      </div>
    </div>
  );
}
