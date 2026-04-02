import { Card, CardContent } from "@/components/ui/card";

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
              <div key={action.id} className="flex gap-2.5">
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
                  </div>
                  {action.noteText && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {action.noteText}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {new Date(action.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
