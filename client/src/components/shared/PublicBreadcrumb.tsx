import { Link } from "wouter";
import { ChevronRight, Home } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PublicBreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function PublicBreadcrumb({ items }: PublicBreadcrumbProps) {
  const trail: BreadcrumbItem[] = [{ label: "Home", href: "/" }, ...items];

  return (
    <nav
      className="pt-[64px] md:pt-[72px] bg-white border-b border-slate-100"
      aria-label="Breadcrumb"
      data-testid="public-breadcrumb"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
        <ol className="flex items-center gap-2 py-3 text-sm text-slate-400 overflow-x-auto">
          {trail.map((item, i) => {
            const isLast = i === trail.length - 1;
            return (
              <li key={i} className="flex items-center gap-2 whitespace-nowrap min-w-0">
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
                {isLast || !item.href ? (
                  <span
                    className={`${isLast ? "text-slate-700 font-medium" : ""} truncate`}
                    data-testid={`breadcrumb-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {i === 0 && <Home className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className="hover:text-slate-600 transition-colors truncate"
                    data-testid={`breadcrumb-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {i === 0 && <Home className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
