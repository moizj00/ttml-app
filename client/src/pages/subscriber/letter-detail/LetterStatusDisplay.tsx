import { Card, CardContent } from "@/components/ui/card";
import LetterStatusTracker from "@/components/shared/LetterStatusTracker";

interface LetterStatusDisplayProps {
  status: string;
}

export function LetterStatusDisplay({ status }: LetterStatusDisplayProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <LetterStatusTracker status={status} size="expanded" />
      </CardContent>
    </Card>
  );
}
