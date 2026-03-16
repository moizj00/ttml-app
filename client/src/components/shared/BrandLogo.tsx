import { cn } from "@/lib/utils";
import { Link } from "wouter";

type BrandLogoVariant = "light" | "dark" | "sidebar";
type BrandLogoSize = "sm" | "md" | "lg" | "xl";

interface BrandLogoProps {
  href?: string;
  variant?: BrandLogoVariant;
  size?: BrandLogoSize;
  iconOnly?: boolean;
  hideWordmarkOnMobile?: boolean;
  className?: string;
}

const LOGO_ICON = "/logo-icon-badge.png";

const SIZE_CONFIG: Record<BrandLogoSize, { iconH: number; topSize: string; bottomSize: string; gap: string; topTracking: string }> = {
  sm: { iconH: 32, topSize: "text-[8px]", bottomSize: "text-[14px]", gap: "gap-2", topTracking: "tracking-[0.12em]" },
  md: { iconH: 40, topSize: "text-[9px]", bottomSize: "text-[16px]", gap: "gap-2.5", topTracking: "tracking-[0.14em]" },
  lg: { iconH: 48, topSize: "text-[10px]", bottomSize: "text-[18px]", gap: "gap-3", topTracking: "tracking-[0.15em]" },
  xl: { iconH: 56, topSize: "text-[11px]", bottomSize: "text-[20px]", gap: "gap-3", topTracking: "tracking-[0.15em]" },
};

function BrandLogoContent({
  variant = "light",
  size = "md",
  iconOnly = false,
  hideWordmarkOnMobile = false,
}: Omit<BrandLogoProps, "href" | "className">) {
  const config = SIZE_CONFIG[size];

  const topColor =
    variant === "sidebar" ? "text-sidebar-foreground/70" :
    variant === "dark" ? "text-slate-300" :
    "text-[#1e1b4b]";
  const bottomColor =
    variant === "sidebar" ? "text-sidebar-foreground" :
    variant === "dark" ? "text-white" :
    "text-[#312e81]";

  const icon = (
    <img
      src={LOGO_ICON}
      alt="Talk to My Lawyer"
      style={{ height: config.iconH, width: config.iconH, maxHeight: config.iconH }}
      className="object-contain flex-shrink-0 block"
    />
  );

  if (iconOnly) {
    return icon;
  }

  return (
    <span className={cn("inline-flex items-center", config.gap)}>
      {icon}
      <span
        className={cn(
          "flex flex-col leading-tight select-none",
          hideWordmarkOnMobile && "hidden md:flex"
        )}
      >
        <span
          className={cn(
            config.topSize,
            config.topTracking,
            "uppercase font-semibold",
            topColor
          )}
        >
          TALK TO MY
        </span>
        <span
          className={cn(
            config.bottomSize,
            "font-bold leading-none",
            bottomColor
          )}
          style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
        >
          Lawyer
        </span>
      </span>
    </span>
  );
}

export default function BrandLogo({
  href,
  variant = "light",
  size = "md",
  iconOnly = false,
  hideWordmarkOnMobile = false,
  className,
}: BrandLogoProps) {
  const content = (
    <span className={cn("inline-flex items-center overflow-hidden", className)}>
      <BrandLogoContent
        variant={variant}
        size={size}
        iconOnly={iconOnly}
        hideWordmarkOnMobile={hideWordmarkOnMobile}
      />
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="inline-flex items-center overflow-hidden">
      {content}
    </Link>
  );
}
