import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date consistently across the app.
 * @param date - Date string, Date object, Unix timestamp (number), or null/undefined
 * @param style - "short" = "Jan 5, 2026", "long" = "January 5, 2026", "datetime" = full locale string
 * @param options - { unix: true } if the input is a Unix timestamp in seconds
 */
export function formatDate(
  date: string | Date | number | null | undefined,
  style: "short" | "long" | "datetime" = "short",
  options?: { unix?: boolean }
): string {
  if (date == null) return "—";
  let d: Date;
  if (typeof date === "number") {
    d = options?.unix ? new Date(date * 1000) : new Date(date);
  } else {
    d = new Date(date);
  }
  if (isNaN(d.getTime())) return "—";

  switch (style) {
    case "short":
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    case "long":
      return d.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    case "datetime":
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
  }
}

/**
 * Format cents as a currency string consistently across the app.
 * @param cents - Amount in cents (integer)
 * @param currency - ISO currency code (default "USD")
 */
export function formatCurrency(
  cents: number,
  currency: string = "USD"
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
