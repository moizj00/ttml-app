import { STATUS_CONFIG } from "../../../../shared/types";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

export default function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, color: "text-gray-600", bgColor: "bg-gray-100" };
  const sizeClass = size === "sm" ? "text-xs px-2 py-0.5" : "text-xs px-2.5 py-1";
  return (
    <span className={`inline-flex items-center font-medium rounded-full ${sizeClass} ${config.bgColor} ${config.color}`}>
      {config.label}
    </span>
  );
}
