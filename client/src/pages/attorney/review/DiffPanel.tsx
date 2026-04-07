import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { computeDiff, mergeDiff, stripHtml } from "@/lib/diff";

interface LetterVersion {
  versionType: string;
  content: string;
}

interface Props {
  versions: LetterVersion[] | null | undefined;
}

export function DiffPanel({ versions }: Props) {
  const aiDraft = versions?.find((v) => v.versionType === "ai_draft");
  const attorneyEdit = versions?.find((v) => v.versionType === "attorney_edit");

  const tokens = useMemo(() => {
    if (!aiDraft || !attorneyEdit) return null;
    const before = stripHtml(aiDraft.content);
    const after = stripHtml(attorneyEdit.content);
    return mergeDiff(computeDiff(before, after));
  }, [aiDraft, attorneyEdit]);

  const stats = useMemo(() => {
    if (!tokens) return null;
    const added = tokens.filter((t) => t.type === "added").reduce((n, t) => n + t.value.split(/\s+/).filter(Boolean).length, 0);
    const removed = tokens.filter((t) => t.type === "removed").reduce((n, t) => n + t.value.split(/\s+/).filter(Boolean).length, 0);
    return { added, removed };
  }, [tokens]);

  if (!aiDraft && !attorneyEdit) {
    return (
      <Card className="h-full border-border">
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground">No versions available to compare.</p>
        </CardContent>
      </Card>
    );
  }

  if (!aiDraft || !attorneyEdit) {
    return (
      <Card className="h-full border-border">
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground">
            {!aiDraft ? "AI draft not yet available." : "No attorney edits yet — the diff will appear once you make changes."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full border-border">
      <CardContent className="p-3 space-y-2">
        {/* Stats bar */}
        {stats && (
          <div className="flex items-center gap-3 text-xs pb-1 border-b border-border">
            <span className="text-green-700 font-medium">+{stats.added} words added</span>
            <span className="text-red-600 font-medium">−{stats.removed} words removed</span>
            <span className="text-muted-foreground ml-auto">AI draft → Your edit</span>
          </div>
        )}

        {/* Diff content */}
        <div className="text-xs leading-relaxed font-mono whitespace-pre-wrap break-words">
          {tokens?.map((token, i) => {
            if (token.type === "equal") {
              return <span key={i}>{token.value}</span>;
            }
            if (token.type === "added") {
              return (
                <mark key={i} className="bg-green-100 text-green-800 rounded-sm px-0.5 no-underline">
                  {token.value}
                </mark>
              );
            }
            // removed
            return (
              <del key={i} className="bg-red-100 text-red-700 rounded-sm px-0.5 line-through">
                {token.value}
              </del>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
