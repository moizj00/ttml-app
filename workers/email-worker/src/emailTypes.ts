export type EmailType =
  | "letter_approved"
  | "needs_changes"
  | "letter_rejected"
  | "new_review_needed"
  | "job_failed_alert"
  | "admin_alert"
  | "status_update"
  | "letter_to_recipient"
  | "letter_submission"
  | "letter_ready"
  | "letter_unlocked"
  | "verification"
  | "welcome"
  | "draft_reminder"
  | "employee_welcome"
  | "attorney_welcome"
  | "review_assigned"
  | "review_completed"
  | "employee_commission"
  | "payout_completed"
  | "payout_rejected"
  | "payment_failed"
  | "admin_verification_code"
  | "attorney_invitation";

export interface BaseEmailPayload {
  type: EmailType;
}

export interface LetterApprovedPayload extends BaseEmailPayload {
  type: "letter_approved";
  to: string;
  name: string;
  subject: string;
  letterId: number;
  appUrl: string;
  pdfUrl?: string;
}

export interface NeedsChangesPayload extends BaseEmailPayload {
  type: "needs_changes";
  to: string;
  name: string;
  subject: string;
  letterId: number;
  attorneyNote?: string;
  appUrl: string;
}

export interface LetterRejectedPayload extends BaseEmailPayload {
  type: "letter_rejected";
  to: string;
  name: string;
  subject: string;
  letterId: number;
  reason?: string;
  appUrl: string;
}

export interface NewReviewNeededPayload extends BaseEmailPayload {
  type: "new_review_needed";
  to: string;
  name: string;
  letterSubject: string;
  letterId: number;
  letterType: string;
  jurisdiction: string;
  appUrl: string;
}

export interface JobFailedAlertPayload extends BaseEmailPayload {
  type: "job_failed_alert";
  to: string;
  name: string;
  letterId: number;
  jobType: string;
  errorMessage: string;
  appUrl: string;
}

export interface AdminAlertPayload extends BaseEmailPayload {
  type: "admin_alert";
  to: string;
  name: string;
  subject: string;
  preheader: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
}

export interface StatusUpdatePayload extends BaseEmailPayload {
  type: "status_update";
  to: string;
  name: string;
  subject: string;
  letterId: number;
  newStatus: string;
  appUrl: string;
}

export interface LetterToRecipientPayload extends BaseEmailPayload {
  type: "letter_to_recipient";
  recipientEmail: string;
  letterSubject: string;
  subjectOverride?: string;
  note?: string;
  pdfUrl?: string;
  htmlContent?: string;
}

export interface LetterSubmissionPayload extends BaseEmailPayload {
  type: "letter_submission";
  to: string;
  name: string;
  subject: string;
  letterId: number;
  letterType: string;
  jurisdictionState: string;
  appUrl: string;
}

export interface LetterReadyPayload extends BaseEmailPayload {
  type: "letter_ready";
  to: string;
  name: string;
  subject: string;
  letterId: number;
  appUrl: string;
  letterType?: string;
  jurisdictionState?: string;
}

export interface LetterUnlockedPayload extends BaseEmailPayload {
  type: "letter_unlocked";
  to: string;
  name: string;
  subject: string;
  letterId: number;
  appUrl: string;
}

export interface VerificationPayload extends BaseEmailPayload {
  type: "verification";
  to: string;
  name: string;
  verifyUrl: string;
}

export interface WelcomePayload extends BaseEmailPayload {
  type: "welcome";
  to: string;
  name: string;
  dashboardUrl: string;
}

export interface DraftReminderPayload extends BaseEmailPayload {
  type: "draft_reminder";
  to: string;
  name: string;
  subject: string;
  letterId: number;
  appUrl: string;
  letterType?: string;
  jurisdictionState?: string;
  hoursWaiting?: number;
}

export interface EmployeeWelcomePayload extends BaseEmailPayload {
  type: "employee_welcome";
  to: string;
  name: string;
  discountCode?: string;
  dashboardUrl: string;
}

export interface AttorneyWelcomePayload extends BaseEmailPayload {
  type: "attorney_welcome";
  to: string;
  name: string;
  dashboardUrl: string;
}

export interface ReviewAssignedPayload extends BaseEmailPayload {
  type: "review_assigned";
  to: string;
  name: string;
  letterSubject: string;
  letterId: number;
  letterType: string;
  jurisdiction: string;
  subscriberName: string;
  appUrl: string;
}

export interface ReviewCompletedPayload extends BaseEmailPayload {
  type: "review_completed";
  to: string;
  name: string;
  letterSubject: string;
  letterId: number;
  action: "approved" | "rejected" | "needs_changes";
  appUrl: string;
}

export interface EmployeeCommissionPayload extends BaseEmailPayload {
  type: "employee_commission";
  to: string;
  name: string;
  subscriberName: string;
  planName: string;
  commissionAmount: string;
  discountCode: string;
  dashboardUrl: string;
}

export interface PayoutCompletedPayload extends BaseEmailPayload {
  type: "payout_completed";
  to: string;
  name: string;
  amount: string;
  paymentMethod: string;
}

export interface PayoutRejectedPayload extends BaseEmailPayload {
  type: "payout_rejected";
  to: string;
  name: string;
  amount: string;
  reason: string;
}

export interface PaymentFailedPayload extends BaseEmailPayload {
  type: "payment_failed";
  to: string;
  name: string;
  letterSubject?: string;
  billingUrl: string;
}

export interface AdminVerificationCodePayload extends BaseEmailPayload {
  type: "admin_verification_code";
  to: string;
  name: string;
  code: string;
}

export interface AttorneyInvitationPayload extends BaseEmailPayload {
  type: "attorney_invitation";
  to: string;
  name: string;
  setPasswordUrl: string;
  invitedByName?: string;
}

export type EmailPayload =
  | LetterApprovedPayload
  | NeedsChangesPayload
  | LetterRejectedPayload
  | NewReviewNeededPayload
  | JobFailedAlertPayload
  | AdminAlertPayload
  | StatusUpdatePayload
  | LetterToRecipientPayload
  | LetterSubmissionPayload
  | LetterReadyPayload
  | LetterUnlockedPayload
  | VerificationPayload
  | WelcomePayload
  | DraftReminderPayload
  | EmployeeWelcomePayload
  | AttorneyWelcomePayload
  | ReviewAssignedPayload
  | ReviewCompletedPayload
  | EmployeeCommissionPayload
  | PayoutCompletedPayload
  | PayoutRejectedPayload
  | PaymentFailedPayload
  | AdminVerificationCodePayload
  | AttorneyInvitationPayload;
