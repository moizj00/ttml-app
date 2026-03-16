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

const LOGO_MAIN = "/logo-main.png";

const SIZE_CONFIG: Record<BrandLogoSize, { h: number; mobileH: number }> = {
  sm: { h: 36, mobileH: 28 },
  md: { h: 44, mobileH: 38 },
  lg: { h: 52, mobileH: 40 },
  xl: { h: 60, mobileH: 44 },
};

function BrandLogoContent({
  size = "md",
  iconOnly = false,
  hideWordmarkOnMobile = false,
  variant,
}: Omit<BrandLogoProps, "href" | "className">) {
  const config = SIZE_CONFIG[size];

  if (hideWordmarkOnMobile) {
    return (
      <>
        <img
          src={LOGO_MAIN}
          alt="Talk to My Lawyer"
          style={{ height: config.mobileH }}
          className="object-contain flex-shrink-0 block md:hidden max-w-[120px] ml-[20px] mr-[20px]"
        />
        <img
          src={LOGO_MAIN}
          alt="Talk to My Lawyer"
          style={{ height: config.h }}
          className={cn(
            "object-contain flex-shrink-0 hidden md:block",
            variant === "dark" && "brightness-0 invert"
          )}
        />
      </>
    );
  }

  return (
    <img
      src={LOGO_MAIN}
      alt="Talk to My Lawyer"
      style={{ height: iconOnly ? config.mobileH : config.h }}
      className={cn(
        "object-contain flex-shrink-0 block max-w-full",
        variant === "dark" && "brightness-0 invert"
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
    <span className={cn("inline-flex items-center", className)}>
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
    <Link href={href} className="inline-flex items-center">
      {content}
    </Link>
  );
}
