import AppLayout from "@/components/shared/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { LETTER_TYPE_CONFIG } from "../../../../shared/types";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { useState, useMemo } from "react";
import {
  DollarSign,
  ShieldOff,
  FileWarning,
  Home,
  Briefcase,
  ShoppingBag,
  FileText,
  ArrowRight,
  Scale,
  Landmark,
  HeartHandshake,
  Building,
  Shield,
  Activity,
  BookMarked,
  Users,
  TreePine,
  Search,
  Mic,
  X,
} from "lucide-react";

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  "demand-letter": <DollarSign className="w-6 h-6" />,
  "cease-and-desist": <ShieldOff className="w-6 h-6" />,
  "contract-breach": <FileWarning className="w-6 h-6" />,
  "eviction-notice": <Home className="w-6 h-6" />,
  "employment-dispute": <Briefcase className="w-6 h-6" />,
  "consumer-complaint": <ShoppingBag className="w-6 h-6" />,
  "pre-litigation-settlement": <Scale className="w-6 h-6" />,
  "debt-collection": <Landmark className="w-6 h-6" />,
  "estate-probate": <BookMarked className="w-6 h-6" />,
  "landlord-tenant": <Building className="w-6 h-6" />,
  "insurance-dispute": <Shield className="w-6 h-6" />,
  "personal-injury-demand": <Activity className="w-6 h-6" />,
  "intellectual-property": <HeartHandshake className="w-6 h-6" />,
  "family-law": <Users className="w-6 h-6" />,
  "neighbor-hoa": <TreePine className="w-6 h-6" />,
  "general-legal": <FileText className="w-6 h-6" />,
};

const COLOR_MAP: Record<string, { bg: string; icon: string; badge: string; dot: string }> = {
  "demand-letter": {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    icon: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    dot: "bg-amber-400",
  },
  "cease-and-desist": {
    bg: "bg-red-50 dark:bg-red-950/30",
    icon: "text-red-600 dark:text-red-400",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    dot: "bg-red-400",
  },
  "contract-breach": {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    icon: "text-orange-600 dark:text-orange-400",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    dot: "bg-orange-400",
  },
  "eviction-notice": {
    bg: "bg-purple-50 dark:bg-purple-950/30",
    icon: "text-purple-600 dark:text-purple-400",
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    dot: "bg-purple-400",
  },
  "employment-dispute": {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    icon: "text-blue-600 dark:text-blue-400",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    dot: "bg-blue-400",
  },
  "consumer-complaint": {
    bg: "bg-green-50 dark:bg-green-950/30",
    icon: "text-green-600 dark:text-green-400",
    badge: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    dot: "bg-green-400",
  },
  "pre-litigation-settlement": {
    bg: "bg-teal-50 dark:bg-teal-950/30",
    icon: "text-teal-600 dark:text-teal-400",
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
    dot: "bg-teal-400",
  },
  "debt-collection": {
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
    icon: "text-yellow-600 dark:text-yellow-400",
    badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    dot: "bg-yellow-400",
  },
  "estate-probate": {
    bg: "bg-indigo-50 dark:bg-indigo-950/30",
    icon: "text-indigo-600 dark:text-indigo-400",
    badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
    dot: "bg-indigo-400",
  },
  "landlord-tenant": {
    bg: "bg-violet-50 dark:bg-violet-950/30",
    icon: "text-violet-600 dark:text-violet-400",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    dot: "bg-violet-400",
  },
  "insurance-dispute": {
    bg: "bg-cyan-50 dark:bg-cyan-950/30",
    icon: "text-cyan-600 dark:text-cyan-400",
    badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
    dot: "bg-cyan-400",
  },
  "personal-injury-demand": {
    bg: "bg-rose-50 dark:bg-rose-950/30",
    icon: "text-rose-600 dark:text-rose-400",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
    dot: "bg-rose-400",
  },
  "intellectual-property": {
    bg: "bg-fuchsia-50 dark:bg-fuchsia-950/30",
    icon: "text-fuchsia-600 dark:text-fuchsia-400",
    badge: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
    dot: "bg-fuchsia-400",
  },
  "family-law": {
    bg: "bg-pink-50 dark:bg-pink-950/30",
    icon: "text-pink-600 dark:text-pink-400",
    badge: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
    dot: "bg-pink-400",
  },
  "neighbor-hoa": {
    bg: "bg-lime-50 dark:bg-lime-950/30",
    icon: "text-lime-600 dark:text-lime-400",
    badge: "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300",
    dot: "bg-lime-500",
  },
  "general-legal": {
    bg: "bg-slate-50 dark:bg-slate-900/30",
    icon: "text-slate-600 dark:text-slate-400",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    dot: "bg-slate-400",
  },
};

const CATEGORY_GROUPS: { label: string; keys: string[] }[] = [
  {
    label: "Money & Contracts",
    keys: ["demand-letter", "contract-breach", "debt-collection", "pre-litigation-settlement"],
  },
  {
    label: "Property & Housing",
    keys: ["eviction-notice", "landlord-tenant", "neighbor-hoa"],
  },
  {
    label: "Workplace & Consumer",
    keys: ["employment-dispute", "consumer-complaint", "cease-and-desist"],
  },
  {
    label: "Personal & Family",
    keys: ["personal-injury-demand", "family-law", "estate-probate", "insurance-dispute"],
  },
  {
    label: "Business & IP",
    keys: ["intellectual-property"],
  },
  {
    label: "Other",
    keys: ["general-legal"],
  },
];

function matchesVoiceQuery(query: string, key: string, config: { label: string; description: string; tip: string }): boolean {
  const q = query.toLowerCase();
  const fields = [key, config.label, config.description, config.tip].join(" ").toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  return words.some(w => fields.includes(w));
}

export default function TemplateGallery() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [voiceQuery, setVoiceQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const handleUseTemplate = (letterType: string) => {
    navigate(`/submit?type=${encodeURIComponent(letterType)}`);
  };

  const allEntries = Object.entries(LETTER_TYPE_CONFIG);

  const filtered = useMemo(() => {
    let entries = allEntries;

    if (activeGroup) {
      const group = CATEGORY_GROUPS.find(g => g.label === activeGroup);
      if (group) {
        entries = entries.filter(([key]) => group.keys.includes(key));
      }
    }

    const q = search.trim().toLowerCase();
    if (q) {
      entries = entries.filter(([key, config]) => {
        const fields = [key, config.label, config.description, config.tip].join(" ").toLowerCase();
        return fields.includes(q);
      });
    }

    return entries;
  }, [search, activeGroup]);

  const voiceMatches = useMemo(() => {
    if (!voiceQuery.trim()) return [];
    return allEntries
      .filter(([key, config]) => matchesVoiceQuery(voiceQuery, key, config as any))
      .map(([key]) => key);
  }, [voiceQuery]);

  const handleVoiceTranscript = (transcript: string) => {
    setVoiceQuery(transcript);
    setSearch(transcript);
  };

  const clearVoice = () => {
    setVoiceQuery("");
    setSearch("");
  };

  return (
    <AppLayout
      breadcrumb={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Template Gallery" },
      ]}
    >
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Template Gallery</h1>
          <p className="text-muted-foreground text-sm">
            Browse {allEntries.length} letter templates across all major legal conflict types. Search or use voice to find the right one.
          </p>
        </div>

        {/* Search + Voice Input Bar */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); setVoiceQuery(""); }}
              placeholder="Search templates — e.g., eviction, unpaid invoice, trademark..."
              className="pl-9 pr-8"
              data-testid="input-template-search"
            />
            {search && (
              <button
                onClick={clearVoice}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
                data-testid="button-clear-search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Mic className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground hidden sm:inline">Describe your situation:</span>
            <VoiceInputButton
              fieldId="template-match"
              onTranscript={handleVoiceTranscript}
            />
          </div>
        </div>

        {/* Voice match banner */}
        {voiceQuery && voiceMatches.length > 0 && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex items-start gap-3" data-testid="voice-match-banner">
            <Mic className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                Based on what you said, we matched {voiceMatches.length} template{voiceMatches.length !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-muted-foreground truncate">"{voiceQuery}"</p>
            </div>
            <button onClick={clearVoice} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Category filter pills */}
        <div className="flex flex-wrap gap-2" data-testid="category-filter-pills">
          <button
            onClick={() => setActiveGroup(null)}
            data-testid="filter-pill-all"
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              activeGroup === null
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            All ({allEntries.length})
          </button>
          {CATEGORY_GROUPS.map(group => (
            <button
              key={group.label}
              onClick={() => setActiveGroup(activeGroup === group.label ? null : group.label)}
              data-testid={`filter-pill-${group.label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                activeGroup === group.label
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {group.label} ({group.keys.length})
            </button>
          ))}
        </div>

        {/* Results count */}
        {(search || activeGroup) && (
          <p className="text-xs text-muted-foreground" data-testid="text-results-count">
            Showing {filtered.length} of {allEntries.length} templates
            {activeGroup ? ` in "${activeGroup}"` : ""}
            {search ? ` matching "${search}"` : ""}
          </p>
        )}

        {/* Template grid */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/20 p-10 text-center space-y-2" data-testid="no-results-state">
            <FileText className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium text-foreground">No templates match your search</p>
            <p className="text-xs text-muted-foreground">Try different keywords or clear filters</p>
            <Button size="sm" variant="outline" onClick={() => { setSearch(""); setVoiceQuery(""); setActiveGroup(null); }} data-testid="button-clear-filters">
              Clear filters
            </Button>
          </div>
        ) : activeGroup || search ? (
          // Flat grid when filtered
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(([key, config]) => (
              <TemplateCard
                key={key}
                letterKey={key}
                config={config as any}
                onUse={handleUseTemplate}
                highlighted={voiceMatches.includes(key)}
              />
            ))}
          </div>
        ) : (
          // Grouped view when not filtered
          <div className="space-y-8">
            {CATEGORY_GROUPS.map(group => {
              const groupEntries = group.keys
                .map(k => [k, LETTER_TYPE_CONFIG[k]] as [string, typeof LETTER_TYPE_CONFIG[string]])
                .filter(([, c]) => c != null);
              if (groupEntries.length === 0) return null;
              return (
                <div key={group.label}>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                    <span>{group.label}</span>
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                      {groupEntries.length}
                    </span>
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupEntries.map(([key, config]) => (
                      <TemplateCard
                        key={key}
                        letterKey={key}
                        config={config as any}
                        onUse={handleUseTemplate}
                        highlighted={voiceMatches.includes(key)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Start blank CTA */}
        <div className="rounded-xl border border-border bg-muted/30 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Prefer to start blank?
            </p>
            <p className="text-xs text-muted-foreground">
              Skip the gallery and fill out the form from scratch — you can still select a letter type in Step 1.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/submit")}
            data-testid="button-start-blank"
          >
            Start from scratch
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

interface TemplateCardProps {
  letterKey: string;
  config: {
    label: string;
    description: string;
    targetWordCount: number;
    tip: string;
  };
  onUse: (key: string) => void;
  highlighted?: boolean;
}

function TemplateCard({ letterKey, config, onUse, highlighted }: TemplateCardProps) {
  const colors = COLOR_MAP[letterKey] ?? COLOR_MAP["general-legal"];
  const icon = TEMPLATE_ICONS[letterKey] ?? <FileText className="w-6 h-6" />;

  return (
    <div
      data-testid={`template-card-${letterKey}`}
      className={`group relative flex flex-col rounded-2xl border bg-card transition-all duration-200 overflow-hidden cursor-default
        ${highlighted
          ? "border-primary shadow-md shadow-primary/10 ring-1 ring-primary/20"
          : "border-border hover:border-primary/40 hover:shadow-md"
        }`}
    >
      {highlighted && (
        <div className="absolute top-2.5 right-2.5 z-10">
          <span className="text-[10px] font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-full flex items-center gap-1">
            <Mic className="w-2.5 h-2.5" />
            Match
          </span>
        </div>
      )}

      {/* Card header with color bg */}
      <div className={`px-5 pt-5 pb-3 ${colors.bg}`}>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${colors.icon} bg-white/60 dark:bg-black/20 border border-white/40 dark:border-white/10`}>
          {icon}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
            {config.label}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
            <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
            ~{config.targetWordCount}w
          </span>
        </div>
      </div>

      {/* Card body */}
      <div className="flex flex-col flex-1 px-5 py-4 space-y-3">
        <div className="space-y-1.5 flex-1">
          <p className="text-sm font-medium text-foreground leading-snug">
            {config.description}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {config.tip}
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => onUse(letterKey)}
          data-testid={`button-use-template-${letterKey}`}
          className="w-full gap-1.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
          variant="outline"
        >
          Use Template
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
