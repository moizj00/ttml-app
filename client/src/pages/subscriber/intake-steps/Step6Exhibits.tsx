import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Paperclip, X, File as FileIcon } from "lucide-react";
import { toast } from "sonner";
import type { ExhibitRow, PendingFile } from "./types";

const EXHIBIT_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const MAX_EXHIBITS = 10;
const MAX_FILE_MB = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ALLOWED_EXTS = [
  ".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp", ".txt",
];

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface Props {
  exhibits: ExhibitRow[];
  setExhibits: React.Dispatch<React.SetStateAction<ExhibitRow[]>>;
}

export function Step6Exhibits({ exhibits, setExhibits }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add supporting exhibits — prior communications, contracts, photos, or
        other documents that strengthen your case. Each exhibit can include a
        description and/or a file attachment.{" "}
        <span className="font-medium">Optional.</span>
      </p>

      <div className="space-y-3">
        {exhibits.map((exhibit, idx) => (
          <div
            key={exhibit.id}
            className="rounded-xl border border-border p-4 space-y-3"
            data-testid={`exhibit-row-${idx}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                Exhibit {EXHIBIT_LETTERS[idx]}
              </span>
              {exhibits.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setExhibits(prev => prev.filter(e => e.id !== exhibit.id))
                  }
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Remove Exhibit ${EXHIBIT_LETTERS[idx]}`}
                  data-testid={`exhibit-remove-${idx}`}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center mb-1">
                <span className="text-xs text-muted-foreground">Description</span>
              </div>
              <Textarea
                value={exhibit.description}
                onChange={e => {
                  const val = e.target.value;
                  setExhibits(prev =>
                    prev.map(ex =>
                      ex.id === exhibit.id ? { ...ex, description: val } : ex
                    )
                  );
                }}
                placeholder="Describe this exhibit (e.g., Email sent on Jan 5 requesting payment...)"
                rows={2}
                className="resize-none"
                data-testid={`exhibit-description-${idx}`}
              />
            </div>
            {exhibit.file ? (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                <div className="w-8 h-8 rounded flex items-center justify-center shrink-0 bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                  <FileIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{exhibit.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtBytes(exhibit.file.size)} &nbsp;·&nbsp;{" "}
                    <span className="text-green-600 dark:text-green-400">Ready</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setExhibits(prev =>
                      prev.map(ex =>
                        ex.id === exhibit.id ? { ...ex, file: null } : ex
                      )
                    )
                  }
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  aria-label="Remove file"
                  data-testid={`exhibit-file-remove-${idx}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label
                className="flex items-center gap-2 text-sm text-primary cursor-pointer hover:underline"
                data-testid={`exhibit-file-attach-${idx}`}
              >
                <Paperclip className="w-4 h-4" />
                Attach file
                <input
                  type="file"
                  accept={ALLOWED_EXTS.join(",")}
                  className="hidden"
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const ext =
                      "." + (file.name.split(".").pop() ?? "").toLowerCase();
                    if (file.size > MAX_FILE_BYTES) {
                      toast.error("File too large", {
                        description: `${file.name} exceeds the ${MAX_FILE_MB} MB limit.`,
                      });
                      return;
                    }
                    if (!ALLOWED_EXTS.includes(ext)) {
                      toast.error("Unsupported file type", {
                        description: `${file.name} is not an accepted format.`,
                      });
                      return;
                    }
                    try {
                      const base64 = await readBase64(file);
                      const pf: PendingFile = {
                        id: `${file.name}-${Date.now()}`,
                        name: file.name,
                        size: file.size,
                        mimeType: file.type || "application/octet-stream",
                        base64,
                        status: "ready",
                      };
                      setExhibits(prev =>
                        prev.map(ex =>
                          ex.id === exhibit.id ? { ...ex, file: pf } : ex
                        )
                      );
                    } catch {
                      toast.error("Upload failed", {
                        description: `Could not read ${file.name}.`,
                      });
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        ))}
      </div>

      {exhibits.length < MAX_EXHIBITS && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setExhibits(prev => [
              ...prev,
              { id: `exhibit-${Date.now()}`, description: "", file: null },
            ])
          }
          data-testid="exhibit-add"
        >
          + Add Exhibit
        </Button>
      )}

      {exhibits.every(e => !e.description && !e.file) && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            No exhibits added yet. You can still submit — exhibits help the
            attorney build a stronger letter.
          </p>
        </div>
      )}
    </div>
  );
}
