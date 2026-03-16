import { cn } from "@/lib/utils";
import { Link } from "wouter";

type BrandLogoSize = "sm" | "md" | "lg" | "xl";

interface BrandLogoProps {
  href?: string;
  size?: BrandLogoSize;
  iconOnly?: boolean;
  hideWordmarkOnMobile?: boolean;
  className?: string;
  variant?: "light" | "dark" | "sidebar";
}

const LOGO_ICON = "/logo-icon-badge.png";
const LOGO_COMBINED = "/logo-full.png";

const SIZE_CONFIG: Record<BrandLogoSize, { iconH: number; combinedH: number }> = {
  sm: { iconH: 32, combinedH: 36 },
  md: { iconH: 40, combinedH: 44 },
  lg: { iconH: 48, combinedH: 52 },
  xl: { iconH: 56, combinedH: 60 },
};

function BrandLogoContent({
  size = "md",
  iconOnly = false,
  hideWordmarkOnMobile = false,
}: Omit<BrandLogoProps, "href" | "className">) {
  const config = SIZE_CONFIG[size];

  if (iconOnly) {
    return (
      <img
        src={LOGO_ICON}
        alt="Talk to My Lawyer"
        style={{ height: config.iconH, width: config.iconH }}
        className="object-contain flex-shrink-0 block"
      />
    );
  }

  return (
    <img
      src={LOGO_COMBINED}
      alt="talk-to-my Lawyer"
      style={{ height: config.combinedH }}
      className={cn(
        "object-contain flex-shrink-0 block",
        hideWordmarkOnMobile && "hidden md:block"
      )}
    />
  );
}

export default function BrandLogo({
  href,
  size = "md",
  iconOnly = false,
  hideWordmarkOnMobile = false,
  className,
  variant,
}: BrandLogoProps) {
  const content = (
    <span className={cn("inline-flex items-center overflow-hidden", className)}>
      <BrandLogoContent
        size={size}
        iconOnly={iconOnly}
        hideWordmarkOnMobile={hideWordmarkOnMobile}
        variant={variant}
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
