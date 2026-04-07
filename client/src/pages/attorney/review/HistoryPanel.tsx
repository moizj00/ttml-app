import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

interface LetterAction {
  id: number;
  action: string;
  noteText?: string | null;
  noteVisibility?: string | null;
  createdAt: string | Date;
}

interface Props {
  actions: LetterAction[] | null | undefined;
}

const NOTE_TRUNCATE_LENGTH = 120;

/** Parse retrigger flag embedded in noteText by requestChanges mutation */
function parseRetrigger(noteText: string): { clean: string; retrigger: boolean } {
  const marker = "[retrigger:true]";
  if (noteText.includes(marker)) {
    return { clean: noteText.replace(marker, "").trim(), retrigger: true };
  }
  return { clean: noteText, retrigger: false };
}

function ActionEntry({ action }: { action: LetterAction }) {
  const [expanded, setExpanded] = useState(false);
  const rawNote = action.noteText ?? "";
  const { clean: noteText, retrigger } = parseRetrigger(rawNote);
  const isLong = noteText.length > NOTE_TRUNCATE_LENGTH;
  const displayText = isLong && !expanded ? noteText.slice(0, NOTE_TRUNCATE_LENGTH) + "…" : noteText;

  return (
    <div className="flex gap-2.5">
      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-foreground capitalize">
            {action.action.replace(/_/g, " ")}
          </span>
          {action.noteVisibility === "internal" && (
            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              internal
            </span>
          )}
          {retrigger && (
            <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded flex items-center gap-1">
              <RefreshCw className="w-2.5 h-2.5" />
              pipeline re-run
            </span>
          )}
        </div>
        {noteText && (
          <div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              {displayText}
            </p>
            {isLong && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-0 text-xs text-primary mt-0.5"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <><ChevronUp className="w-3 h-3 mr-0.5" />Show less</>
                ) : (
                  <><ChevronDown className="w-3 h-3 mr-0.5" />Show more</>
                )}
              </Button>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          {new Date(action.createdAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export function HistoryPanel({ actions }: Props) {
  return (
    <Card className="h-full border-border">
      <CardContent className="p-3">
        {!actions || actions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No actions recorded yet.
          </p>
        ) : (
          <div className="space-y-3">
            {actions.map(action => (
              <ActionEntry key={action.id} action={action} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
