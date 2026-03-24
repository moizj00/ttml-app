import { STATUS_CONFIG } from "../../../../shared/types";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
  "data-testid"?: string;
}

export default function StatusBadge({ status, size = "md", "data-testid": testId }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, color: "text-gray-600", bgColor: "bg-gray-100" };
  const sizeClass = size === "sm" ? "text-xs px-2 py-0.5" : "text-xs px-2.5 py-1";
  return (
    <span data-testid={testId} className={`inline-flex items-center font-medium rounded-full ${sizeClass} ${config.bgColor} ${config.color}`}>
      {config.label}
    </span>
  );
}
