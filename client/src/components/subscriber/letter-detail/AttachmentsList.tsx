import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Download } from "lucide-react";

interface AttachmentsListProps {
  attachments: {
    id: number;
    fileName: string | null;
    storageUrl: string | null;
  }[];
}

export const AttachmentsList = ({ attachments }: AttachmentsListProps) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          Attachments ({attachments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {attachments.map(att => (
          <a
            key={att.id}
            href={att.storageUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-2.5 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
          >
            <FileText className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm text-foreground flex-1 truncate">
              {att.fileName ?? "Attachment"}
            </span>
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
          </a>
        ))}
      </CardContent>
    </Card>
  );
};
