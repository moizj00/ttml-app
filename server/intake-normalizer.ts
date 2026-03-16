/**
 * Canonical Intake Normalization
 *
 * Converts raw intake JSON + letter request DB fields into a clean,
 * normalized prompt input for the AI pipeline stages.
 *
 * Requirements:
 * - Trim all strings
 * - Safe defaults for arrays/booleans
 * - Preserve null numeric values (do not coerce unknown to 0)
 * - Filter empty rows in timeline/demands/attachments
 * - Fallback to DB fields for subject/summary/jurisdiction if missing in intake_json
 */

import type { IntakeJson } from "../shared/types";

interface LetterRequestDbFields {
  subject: string;
  issueSummary?: string | null;
  jurisdictionCountry?: string | null;
  jurisdictionState?: string | null;
  jurisdictionCity?: string | null;
  letterType: string;
}

interface NormalizedPromptInput {
  schemaVersion: string;
  letterType: string;
  matterCategory: string;
  sender: {
    name: string;
    address: string;
    email: string | null;
    phone: string | null;
  };
  recipient: {
    name: string;
    address: string;
    email: string | null;
    phone: string | null;
  };
  jurisdiction: {
    country: string;
    state: string;
    city: string | null;
  };
  matter: {
    category: string;
    subject: string;
    description: string;
    incidentDate: string | null;
  };
  financials: {
    amountOwed: number | null;
    currency: string;
  } | null;
  desiredOutcome: string;
  deadlineDate: string | null;
  additionalContext: string | null;
  tonePreference: "firm" | "moderate" | "aggressive";
  language: string;
  priorCommunication: string | null;
  deliveryMethod: string;
  timeline: string[];
  evidenceSummary: string | null;
  userStatements: string | null;
}

function trimOrNull(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

function trimOrDefault(val: unknown, fallback: string): string {
  const result = trimOrNull(val);
  return result ?? fallback;
}

function safeArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
    .filter((s) => s.length > 0);
}

function safeNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

/**
 * Build a normalized prompt input from raw intake JSON + DB fields.
 * This is the single source of truth for all AI pipeline stages.
 */
export function buildNormalizedPromptInput(
  dbFields: LetterRequestDbFields,
  intakeJson: IntakeJson | null | undefined
): NormalizedPromptInput {
  const intake = intakeJson ?? ({} as Partial<IntakeJson>);

  return {
    schemaVersion: trimOrDefault((intake as any).schemaVersion, "1.0"),
    letterType: trimOrDefault(intake.letterType, dbFields.letterType),
    matterCategory: trimOrDefault(
      (intake as any).matter?.category ?? intake.letterType,
      dbFields.letterType
    ),
    sender: {
      name: trimOrDefault(intake.sender?.name, "Unknown Sender"),
      address: trimOrDefault(intake.sender?.address, "Address not provided"),
      email: trimOrNull(intake.sender?.email),
      phone: trimOrNull(intake.sender?.phone),
    },
    recipient: {
      name: trimOrDefault(intake.recipient?.name, "Unknown Recipient"),
      address: trimOrDefault(intake.recipient?.address, "Address not provided"),
      email: trimOrNull(intake.recipient?.email),
      phone: trimOrNull(intake.recipient?.phone),
    },
    jurisdiction: {
      country: trimOrDefault(
        intake.jurisdiction?.country,
        dbFields.jurisdictionCountry ?? "US"
      ),
      state: trimOrDefault(
        intake.jurisdiction?.state,
        dbFields.jurisdictionState ?? "Unknown"
      ),
      city: trimOrNull(intake.jurisdiction?.city) ?? trimOrNull(dbFields.jurisdictionCity),
    },
    matter: {
      category: trimOrDefault(intake.matter?.category, dbFields.letterType),
      subject: trimOrDefault(intake.matter?.subject, dbFields.subject),
      description: trimOrDefault(
        intake.matter?.description,
        dbFields.issueSummary ?? "No description provided"
      ),
      incidentDate: trimOrNull(intake.matter?.incidentDate),
    },
    financials:
      intake.financials?.amountOwed !== undefined && intake.financials?.amountOwed !== null
        ? {
            amountOwed: safeNumber(intake.financials.amountOwed),
            currency: trimOrDefault(intake.financials.currency, "USD"),
          }
        : null,
    desiredOutcome: trimOrDefault(intake.desiredOutcome, "Resolution of the matter"),
    deadlineDate: trimOrNull(intake.deadlineDate),
    additionalContext: trimOrNull(intake.additionalContext),
    tonePreference: (["firm", "moderate", "aggressive"].includes(
      intake.toneAndDelivery?.tone ?? intake.tonePreference ?? ""
    )
      ? (intake.toneAndDelivery?.tone ?? intake.tonePreference)
      : "firm") as "firm" | "moderate" | "aggressive",
    language: trimOrDefault(intake.language, "english"),
    priorCommunication: trimOrNull(
      intake.communications?.summary ?? intake.priorCommunication
    ),
    deliveryMethod: trimOrDefault(
      intake.toneAndDelivery?.deliveryMethod ?? intake.deliveryMethod,
      "certified_mail"
    ),
    timeline: safeArray((intake as any).timeline),
    evidenceSummary: trimOrNull((intake as any).evidenceSummary),
    userStatements: trimOrNull((intake as any).userStatements),
  };
}

export type { NormalizedPromptInput };
