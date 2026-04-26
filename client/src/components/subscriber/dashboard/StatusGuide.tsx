import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "@/components/shared/StatusBadge";

const STATUS_ITEMS = [
  {
    status: "submitted",
    desc: "Your request has been received and is being prepared for our legal team.",
  },
  {
    status: "researching",
    desc: "Our team is researching applicable laws, statutes, and jurisdiction rules.",
  },
  {
    status: "drafting",
    desc: "Our attorneys are drafting your professional legal letter using research findings.",
  },
  {
    status: "generated_locked",
    desc: "Your letter is ready! Pay to unlock and submit for attorney review.",
  },
  {
    status: "pending_review",
    desc: "Letter is queued for a licensed attorney to review and approve.",
  },
  {
    status: "under_review",
    desc: "An attorney is actively reviewing and editing your letter.",
  },
  {
    status: "needs_changes",
    desc: "The attorney has requested additional information or changes from you.",
  },
  {
    status: "approved",
    desc: "Your letter has been approved by an attorney and is ready to download.",
  },
];

export function StatusGuide() {
  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-base font-semibold mb-4">Pipeline Status Guide</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {STATUS_ITEMS.map(item => (
            <div
              key={item.status}
              className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
            >
              <StatusBadge status={item.status} size="sm" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
