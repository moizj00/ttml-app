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
  loading?: "lazy" | "eager";
}

const LOGO_FULL = "/logo-full.png";
const LOGO_ICON = "/logo-icon-badge.png";

const SIZE_CONFIG: Record<BrandLogoSize, { h: number; mobileH: number }> = {
  sm: { h: 36, mobileH: 28 },
  md: { h: 44, mobileH: 32 },
  lg: { h: 52, mobileH: 36 },
  xl: { h: 60, mobileH: 40 },
};

function BrandLogoContent({
  size = "md",
  iconOnly = false,
  hideWordmarkOnMobile = false,
  variant,
  loading = "eager",
}: Omit<BrandLogoProps, "href" | "className">) {
  const config = SIZE_CONFIG[size];

  if (iconOnly) {
    return (
      <img
        src={LOGO_ICON}
        alt="Talk to My Lawyer logo"
        width={config.mobileH}
        height={config.mobileH}
        style={{ height: config.mobileH }}
        loading={loading}
        className={cn(
          "object-contain flex-shrink-0 block",
          variant === "dark" && "brightness-0 invert"
        )}
      />
    );
  }

  if (hideWordmarkOnMobile) {
    return (
      <>
        <img
          src={LOGO_FULL}
          alt="Talk to My Lawyer"
          width={Math.round(config.mobileH * 4.5)}
          height={config.mobileH}
          style={{ height: config.mobileH }}
          loading={loading}
          className="object-contain flex-shrink-0 block md:hidden"
        />
        <img
          src={LOGO_FULL}
          alt="Talk to My Lawyer"
          width={Math.round(config.h * 4.5)}
          height={config.h}
          style={{ height: config.h }}
          loading={loading}
          className="object-contain flex-shrink-0 hidden md:block pt-[1px] pb-[1px]"
        />
      </>
    );
  }

  return (
    <img
      src={LOGO_FULL}
      alt="Talk to My Lawyer"
      width={Math.round(config.h * 4.5)}
      height={config.h}
      style={{ height: config.h }}
      loading={loading}
      className="object-contain flex-shrink-0 block max-w-full"
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
  loading = "eager",
}: BrandLogoProps) {
  const content = (
    <span className={cn("inline-flex items-center", className)}>
      <BrandLogoContent
        size={size}
        iconOnly={iconOnly}
        hideWordmarkOnMobile={hideWordmarkOnMobile}
        variant={variant}
        loading={loading}
      />
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="inline-flex items-center">
      {content}
    </Link>
  );
}
