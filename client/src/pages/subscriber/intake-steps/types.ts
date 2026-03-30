export interface PendingFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  base64: string;
  status: "ready" | "error";
  error?: string;
}

export interface ExhibitRow {
  id: string;
  description: string;
  file: PendingFile | null;
}

export interface FormData {
  letterType: string;
  subject: string;
  jurisdictionState: string;
  jurisdictionCity: string;
  tonePreference: "firm" | "moderate" | "aggressive";
  senderName: string;
  senderAddress: string;
  senderEmail: string;
  senderPhone: string;
  recipientName: string;
  recipientAddress: string;
  recipientEmail: string;
  incidentDate: string;
  description: string;
  additionalContext: string;
  amountOwed: string;
  desiredOutcome: string;
  deadlineDate: string;
  language: string;
  priorCommunication: string;
  deliveryMethod: string;
  communicationsSummary: string;
  communicationsLastContactDate: string;
  communicationsMethod: string;
}
