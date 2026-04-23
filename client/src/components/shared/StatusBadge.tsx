import { STATUS_CONFIG } from "../../../../shared/types";

interface StatusBadgeProps {
  status: string;
  approvedByRole?: string | null;
  size?: "sm" | "md";
  "data-testid"?: string;
}

export default function StatusBadge({
  status,
  approvedByRole,
  size = "md",
  "data-testid": testId,
}: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    color: "text-gray-600",
    bgColor: "bg-gray-100",
  };

  let overrideLabel = config.label;
  if (status === "approved") {
    if (approvedByRole === "admin") {
      overrideLabel = "Admin Approved";
    } else if (approvedByRole === "attorney") {
      overrideLabel = "Attorney Approved";
    }
  }

  const sizeClass =
    size === "sm" ? "text-xs px-2 py-0.5" : "text-xs px-2.5 py-1";
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center font-medium rounded-full badge-transition ${sizeClass} ${config.bgColor} ${config.color}`}
    >
      {overrideLabel}
    </span>
  );
}
