import AppLayout from "@/components/shared/AppLayout";
import { trpc } from "@/lib/trpc";
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
  Loader2,
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

export default function TemplateGallery() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [voiceQuery, setVoiceQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());

  const { data: templates, isLoading } = trpc.templates.listActive.useQuery();

  const categories = useMemo(() => {
    if (!templates) return [];
    const cats = Array.from(new Set(templates.map((t) => t.category)));
    return cats.sort();
  }, [templates]);

  const allTags = useMemo(() => {
    if (!templates) return [];
    const tagSet = new Set<string>();
    for (const t of templates) {
      for (const tag of t.tags) tagSet.add(tag);
    }
    return Array.from(tagSet).sort();
  }, [templates]);

  const toggleTag = (tag: string) => {
    setActiveTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!templates) return [];
    let items = [...templates];

    if (activeCategory) {
      items = items.filter(t => t.category === activeCategory);
    }

    if (activeTags.size > 0) {
      items = items.filter(t => t.tags.some(tag => activeTags.has(tag)));
    }

    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter(t => {
        const fields = [t.title, t.scenarioDescription, t.category, ...t.tags, t.letterType].join(" ").toLowerCase();
        return fields.includes(q);
      });
    }

    return items;
  }, [templates, search, activeCategory, activeTags]);

  const voiceMatches = useMemo(() => {
    if (!voiceQuery.trim() || !templates) return [];
    const q = voiceQuery.toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    return templates
      .filter(t => {
        const fields = [t.title, t.scenarioDescription, t.category, ...t.tags].join(" ").toLowerCase();
        return words.some(w => fields.includes(w));
      })
      .map(t => t.id);
  }, [voiceQuery, templates]);

  const handleUseTemplate = (template: typeof filtered[number]) => {
    sessionStorage.setItem(
      `template_prefill_${template.id}`,
      JSON.stringify({
        templateId: template.id,
        templateTitle: template.title,
        prefillData: template.prefillData,
      })
    );
    navigate(`/submit?templateId=${template.id}`);
  };

  const handleVoiceTranscript = (transcript: string) => {
    setVoiceQuery(transcript);
    setSearch(transcript);
  };

  const clearVoice = () => {
    setVoiceQuery("");
    setSearch("");
  };

  const groupedByCategory = useMemo(() => {
    if (!filtered.length) return [];
    const groups: Record<string, typeof filtered> = {};
    for (const t of filtered) {
      if (!groups[t.category]) groups[t.category] = [];
      groups[t.category].push(t);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <AppLayout
      breadcrumb={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Template Library" },
      ]}
    >
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">Template Library</h1>
          <p className="text-muted-foreground text-sm">
            Browse demand letter templates for common legal scenarios. Select one to pre-fill your intake form.
          </p>
        </div>

        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); setVoiceQuery(""); }}
              placeholder="Search templates — e.g., unpaid invoice, security deposit, defective product..."
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

        <div className="flex flex-wrap gap-2" data-testid="category-filter-pills">
          <button
            onClick={() => setActiveCategory(null)}
            data-testid="filter-pill-all"
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              activeCategory === null
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            All{templates ? ` (${templates.length})` : ""}
          </button>
          {categories.map(cat => {
            const count = templates ? templates.filter(t => t.category === cat).length : 0;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                data-testid={`filter-pill-${cat.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        {allTags.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Filter by tag</p>
            <div className="flex flex-wrap gap-1.5" data-testid="tag-filter-pills">
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  data-testid={`filter-tag-${tag.replace(/\s+/g, "-")}`}
                  className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors ${
                    activeTags.has(tag)
                      ? "bg-primary/10 text-primary border-primary/40"
                      : "bg-background border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  {tag}
                </button>
              ))}
              {activeTags.size > 0 && (
                <button
                  onClick={() => setActiveTags(new Set())}
                  data-testid="button-clear-tags"
                  className="text-[11px] px-2 py-1 text-muted-foreground hover:text-foreground underline"
                >
                  Clear tags
                </button>
              )}
            </div>
          </div>
        )}

        {(search || activeCategory || activeTags.size > 0) && templates && (
          <p className="text-xs text-muted-foreground" data-testid="text-results-count">
            Showing {filtered.length} of {templates?.length ?? 0} templates
            {activeCategory ? ` in "${activeCategory}"` : ""}
            {activeTags.size > 0 ? ` tagged "${Array.from(activeTags).join(", ")}"` : ""}
            {search ? ` matching "${search}"` : ""}
          </p>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16" data-testid="loading-state">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading templates...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/20 p-10 text-center space-y-2" data-testid="no-results-state">
            <FileText className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium text-foreground">No templates match your search</p>
            <p className="text-xs text-muted-foreground">Try different keywords or clear filters</p>
            <Button size="sm" variant="outline" onClick={() => { setSearch(""); setVoiceQuery(""); setActiveCategory(null); setActiveTags(new Set()); }} data-testid="button-clear-filters">
              Clear filters
            </Button>
          </div>
        ) : activeCategory || search ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                onUse={handleUseTemplate}
                highlighted={voiceMatches.includes(t.id)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {groupedByCategory.map(([category, items]) => (
              <div key={category}>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <span>{category}</span>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                    {items.length}
                  </span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map(t => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      onUse={handleUseTemplate}
                      highlighted={voiceMatches.includes(t.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-border bg-muted/30 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Prefer to start blank?
            </p>
            <p className="text-xs text-muted-foreground">
              Skip the library and fill out the form from scratch — you can still select a letter type in Step 1.
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

function TemplateCard<T extends { id: number; title: string; scenarioDescription: string; category: string; tags: string[]; letterType: string; prefillData: unknown; sortOrder: number }>({ template, onUse, highlighted }: {
  template: T;
  onUse: (template: T) => void;
  highlighted?: boolean;
}) {
  const colors = COLOR_MAP[template.letterType] ?? COLOR_MAP["general-legal"];
  const icon = TEMPLATE_ICONS[template.letterType] ?? <FileText className="w-6 h-6" />;
  const typeConfig = LETTER_TYPE_CONFIG[template.letterType];

  return (
    <div
      data-testid={`template-card-${template.id}`}
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

      <div className={`px-5 pt-5 pb-3 ${colors.bg}`}>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${colors.icon} bg-white/60 dark:bg-black/20 border border-white/40 dark:border-white/10`}>
          {icon}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
            {template.category}
          </span>
          {typeConfig && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
              <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
              {typeConfig.label}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col flex-1 px-5 py-4 space-y-3">
        <div className="space-y-1.5 flex-1">
          <p className="text-sm font-medium text-foreground leading-snug">
            {template.title}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {template.scenarioDescription}
          </p>
        </div>

        {template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {template.tags.slice(0, 4).map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}

        <Button
          size="sm"
          onClick={() => onUse(template)}
          data-testid={`button-use-template-${template.id}`}
          className="w-full gap-1.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
          variant="outline"
        >
          Use This Template
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
