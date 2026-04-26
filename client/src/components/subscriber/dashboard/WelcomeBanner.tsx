import { Link } from "wouter";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WelcomeBannerProps {
  subscriberId?: string | null;
}

export function WelcomeBanner({ subscriberId }: WelcomeBannerProps) {
  return (
    <div className="rounded-2xl bg-linear-to-r from-primary to-primary/80 p-5 text-primary-foreground sm:p-6">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-xl font-bold">Welcome to Talk to My Lawyer</h1>
        {subscriberId && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-white/20 text-primary-foreground"
            data-testid="text-subscriber-id"
          >
            {subscriberId}
          </span>
        )}
      </div>
      <p className="text-primary-foreground/80 text-sm mb-4">
        Submit a legal matter and get a professionally drafted,
        attorney-approved letter.
      </p>
      <Button asChild variant="secondary" size="sm">
        <Link href="/submit">
          <PlusCircle className="w-4 h-4 mr-2" />
          Submit New Letter
        </Link>
      </Button>
    </div>
  );
}
