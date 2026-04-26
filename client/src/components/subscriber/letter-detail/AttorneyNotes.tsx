import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

interface AttorneyNotesProps {
  actions: {
    id: number;
    noteText: string | null;
    createdAt: string | Date | number;
  }[];
}

export const AttorneyNotes = ({ actions }: AttorneyNotesProps) => {
  if (actions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          Attorney Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.map(action => (
          <div key={action.id} className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm text-foreground">{action.noteText}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(action.createdAt).toLocaleDateString()}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
