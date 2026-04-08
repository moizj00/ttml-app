import { FileText, MessageSquare } from "lucide-react";

interface LetterPreviewContentProps {
  content: string;
  subject: string;
  letterType: string;
  userVisibleActions: Array<{
    id: number;
    noteText: string | null;
    createdAt: string | Date;
  }>;
}

export function LetterPreviewContent({
  content,
  subject,
  letterType,
  userVisibleActions,
}: LetterPreviewContentProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 space-y-4">
      {/* Letter header info */}
      <div className="flex items-center gap-3 py-2">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{subject}</h3>
          <p className="text-xs text-muted-foreground">{letterType}</p>
        </div>
      </div>

      {/* Attorney notes (if any) */}
      {userVisibleActions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            Attorney Notes
          </p>
          {userVisibleActions.map((action) => (
            <div
              key={action.id}
              className="bg-blue-50/50 border border-blue-100 rounded-lg p-3"
            >
              <p className="text-sm text-foreground">{action.noteText}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(action.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Read-only letter content */}
      <div className="bg-white border border-blue-100 rounded-lg p-5">
        <p className="text-xs font-medium text-blue-600 mb-3 uppercase tracking-wide">
          Final Letter — Read Only
        </p>
        {/<[a-z][\s\S]*>/i.test(content) ? (
          <div
            className="prose prose-sm max-w-none text-foreground prose-p:my-2 prose-p:leading-relaxed prose-headings:font-semibold prose-headings:text-foreground prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:text-foreground"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <pre className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-sans">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
