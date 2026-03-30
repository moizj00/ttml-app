import AppLayout from "@/components/shared/AppLayout";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { LETTER_TYPE_CONFIG } from "../../../../shared/types";
import {
  DollarSign,
  ShieldOff,
  FileWarning,
  Home,
  Briefcase,
  ShoppingBag,
  FileText,
  ArrowRight,
} from "lucide-react";

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  "demand-letter": <DollarSign className="w-7 h-7" />,
  "cease-and-desist": <ShieldOff className="w-7 h-7" />,
  "contract-breach": <FileWarning className="w-7 h-7" />,
  "eviction-notice": <Home className="w-7 h-7" />,
  "employment-dispute": <Briefcase className="w-7 h-7" />,
  "consumer-complaint": <ShoppingBag className="w-7 h-7" />,
  "general-legal": <FileText className="w-7 h-7" />,
};

const TEMPLATE_TIPS: Record<string, string> = {
  "demand-letter": "Best for unpaid debts, invoices, or property damage claims.",
  "cease-and-desist": "Used to stop harassment, defamation, or IP infringement.",
  "contract-breach": "For when a party has failed to uphold agreed-upon terms.",
  "eviction-notice": "Formally notifies a tenant to vacate a rental property.",
  "employment-dispute": "Covers wrongful termination, discrimination, or wage issues.",
  "consumer-complaint": "File formal complaints against businesses or service providers.",
  "general-legal": "Any other legal correspondence that doesn't fit the above.",
};

const COLOR_MAP: Record<string, { bg: string; icon: string; badge: string }> = {
  "demand-letter": {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    icon: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
  "cease-and-desist": {
    bg: "bg-red-50 dark:bg-red-950/30",
    icon: "text-red-600 dark:text-red-400",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  },
  "contract-breach": {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    icon: "text-orange-600 dark:text-orange-400",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  },
  "eviction-notice": {
    bg: "bg-purple-50 dark:bg-purple-950/30",
    icon: "text-purple-600 dark:text-purple-400",
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  },
  "employment-dispute": {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    icon: "text-blue-600 dark:text-blue-400",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  "consumer-complaint": {
    bg: "bg-green-50 dark:bg-green-950/30",
    icon: "text-green-600 dark:text-green-400",
    badge: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  },
  "general-legal": {
    bg: "bg-slate-50 dark:bg-slate-900/30",
    icon: "text-slate-600 dark:text-slate-400",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
};

export default function TemplateGallery() {
  const [, navigate] = useLocation();

  const handleUseTemplate = (letterType: string) => {
    navigate(`/submit?type=${encodeURIComponent(letterType)}`);
  };

  return (
    <AppLayout
      breadcrumb={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Template Gallery" },
      ]}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Template Gallery</h1>
          <p className="text-muted-foreground">
            Choose a letter type to get started. You can fill out the form by typing or using
            voice dictation on any field.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(LETTER_TYPE_CONFIG).map(([key, config]) => {
            const colors = COLOR_MAP[key] ?? COLOR_MAP["general-legal"];
            const icon = TEMPLATE_ICONS[key] ?? <FileText className="w-7 h-7" />;
            const tip = TEMPLATE_TIPS[key] ?? "";

            return (
              <div
                key={key}
                data-testid={`template-card-${key}`}
                className="group relative flex flex-col rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200 overflow-hidden"
              >
                <div className={`p-5 pb-3 ${colors.bg}`}>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${colors.bg} ${colors.icon} border border-current/10`}>
                    {icon}
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
                    {config.label}
                  </span>
                </div>

                <div className="flex flex-col flex-1 p-5 pt-3 space-y-3">
                  <div className="space-y-1 flex-1">
                    <p className="text-sm font-medium text-foreground leading-snug">
                      {config.description}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {tip}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">
                      ~{config.targetWordCount} words
                    </span>
                    <Button
                      size="sm"
                      onClick={() => handleUseTemplate(key)}
                      data-testid={`button-use-template-${key}`}
                      className="gap-1.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                      variant="outline"
                    >
                      Use Template
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

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
