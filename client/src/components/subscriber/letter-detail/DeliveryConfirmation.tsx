import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, CheckCircle } from "lucide-react";

interface DeliveryConfirmationProps {
  deliveryLogs: {
    id: number;
    deliveryMethod: string;
    recipientEmail: string | null;
    deliveredAt: string | Date | null;
  }[];
}

export const DeliveryConfirmation = ({
  deliveryLogs,
}: DeliveryConfirmationProps) => {
  if (!deliveryLogs || deliveryLogs.length === 0) return null;

  return (
    <Card className="border-green-200 bg-green-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Send className="w-4 h-4 text-green-600" />
          Delivery Confirmation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {deliveryLogs.map(entry => (
          <div key={entry.id} className="flex items-start gap-3 text-sm">
            <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-green-800 font-medium">
                Letter delivered via {entry.deliveryMethod}
                {entry.recipientEmail && ` to ${entry.recipientEmail}`}
              </p>
              {entry.deliveredAt && (
                <p className="text-green-600 text-xs mt-0.5">
                  {new Date(entry.deliveredAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
