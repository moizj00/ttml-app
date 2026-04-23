import { Card, CardContent } from "@/components/ui/card";
import LetterStatusTracker from "@/components/shared/LetterStatusTracker";

interface LetterStatusDisplayProps {
  status: string;
  isFreePreview?: boolean;
  freePreviewUnlocked?: boolean;
}

export function LetterStatusDisplay({
  status,
  isFreePreview,
  freePreviewUnlocked,
}: LetterStatusDisplayProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <LetterStatusTracker
          status={status}
          size="expanded"
          isFreePreview={isFreePreview}
          freePreviewUnlocked={freePreviewUnlocked}
        />
      </CardContent>
    </Card>
  );
}
