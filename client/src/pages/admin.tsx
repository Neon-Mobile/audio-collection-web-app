import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import type { Application } from "@shared/schema";
import { ArrowLeft, Search, Play, Pause, Volume2, User, Globe, MapPin, Calendar, GraduationCap, ChevronDown, ChevronUp, Download } from "lucide-react";

export default function Admin() {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: applications, isLoading } = useQuery<Application[]>({
    queryKey: ["/api/applications"],
  });

  const filtered = applications?.filter((app) => {
    const term = search.toLowerCase();
    return (
      app.firstName.toLowerCase().includes(term) ||
      app.lastName.toLowerCase().includes(term) ||
      app.primaryLanguage.toLowerCase().includes(term) ||
      app.ethnicity.toLowerCase().includes(term)
    );
  }) ?? [];

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const playAudio = (path: string, id: string) => {
    if (playingAudio === id) {
      audioRef.current?.pause();
      setPlayingAudio(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(path);
    audioRef.current = audio;
    audio.onended = () => setPlayingAudio(null);
    audio.play();
    setPlayingAudio(id);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-admin-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-foreground" data-testid="text-admin-title">Voice Atlas Admin</h1>
              <p className="text-sm text-muted-foreground">{filtered.length} application{filtered.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search applications..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-admin-search"
            />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-20 text-muted-foreground" data-testid="text-no-applications">
            {search ? "No applications match your search." : "No applications yet."}
          </div>
        )}

        {filtered.map((app) => {
          const isExpanded = expandedId === app.id;
          return (
            <div
              key={app.id}
              className="bg-card border border-border rounded-lg overflow-hidden transition-shadow hover:shadow-md"
              data-testid={`card-application-${app.id}`}
            >
              <div
                className="p-4 flex items-center justify-between cursor-pointer"
                onClick={() => toggleExpand(app.id)}
                data-testid={`button-expand-${app.id}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground" data-testid={`text-name-${app.id}`}>
                      {app.firstName} {app.lastName}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {app.primaryLanguage}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {app.locale}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(app.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(app.sampleAudioPath || app.languageAudioPath) && (
                    <Volume2 className="w-4 h-4 text-primary" />
                  )}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-border px-4 py-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <InfoItem label="Full Name" value={`${app.firstName} ${app.lastName}`} />
                    <InfoItem label="Primary Language" value={app.primaryLanguage} />
                    <InfoItem label="Other Languages" value={app.otherLanguages?.length ? app.otherLanguages.join(", ") : "None"} />
                    <InfoItem label="Referral Source" value={app.referralSource} />
                    <InfoItem label="Ethnicity" value={app.ethnicity} />
                    <InfoItem label="Gender" value={app.gender} />
                    <InfoItem label="Occupation" value={app.occupation} />
                    <InfoItem label="Date of Birth" value={app.dateOfBirth} />
                    <InfoItem label="Education Level" value={app.educationLevel} />
                    <InfoItem label="Education in Language" value={app.educationInLanguage} />
                    <InfoItem label="Accent Description" value={app.accentDescription} />
                    <InfoItem label="Accent Origin" value={app.accentOrigin || "Not specified"} />
                    <InfoItem label="Locale" value={app.locale} />
                    <InfoItem label="Birthplace" value={app.birthplace} />
                    <InfoItem label="Years at Birthplace" value={app.birthplaceYears} />
                    <InfoItem label="Current Address" value={app.currentAddress} />
                    {app.currentAddressLine2 && <InfoItem label="Address Line 2" value={app.currentAddressLine2} />}
                    <InfoItem label="Years at Current Address" value={app.currentAddressYears} />
                  </div>

                  {(app.sampleAudioPath || app.languageAudioPath) && (
                    <div className="border-t border-border pt-4">
                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Volume2 className="w-4 h-4" /> Audio Recordings
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {app.sampleAudioPath && (
                          <AudioPlayer
                            label="Sample Recording"
                            path={app.sampleAudioPath}
                            isPlaying={playingAudio === `sample-${app.id}`}
                            onToggle={() => playAudio(app.sampleAudioPath!, `sample-${app.id}`)}
                            testId={`audio-sample-${app.id}`}
                          />
                        )}
                        {app.languageAudioPath && (
                          <AudioPlayer
                            label={`${app.primaryLanguage} Recording`}
                            path={app.languageAudioPath}
                            isPlaying={playingAudio === `language-${app.id}`}
                            onToggle={() => playAudio(app.languageAudioPath!, `language-${app.id}`)}
                            testId={`audio-language-${app.id}`}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm text-foreground mt-0.5">{value}</p>
    </div>
  );
}

function AudioPlayer({ label, path, isPlaying, onToggle, testId }: { label: string; path: string; isPlaying: boolean; onToggle: () => void; testId: string }) {
  return (
    <div className="flex items-center gap-3 bg-muted/50 rounded-lg p-3 border border-border">
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9 flex-shrink-0"
        onClick={onToggle}
        data-testid={`button-play-${testId}`}
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </Button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{label}</p>
        <p className="text-xs text-muted-foreground">Audio recording</p>
      </div>
      <a href={path} download className="text-muted-foreground hover:text-foreground transition-colors">
        <Download className="w-4 h-4" />
      </a>
    </div>
  );
}
