## CASE PROFILE
- **Internal Matter ID:** #{{letterId}}
- **Sender:** {{senderName}}
- **Recipient:** {{recipientName}}
- **Jurisdiction:** {{jurisdiction}}
- **Letter Type:** {{letterType}}
- **Tone Preference:** {{tone}}

## CLIENT INCIDENT SUMMARY
{{description}}

{{additionalContext}}

{{evidenceSummary}}

{{timeline}}

## LEGAL RESEARCH PACKET (VERIFIED CITATIONS)
{{researchSummary}}

### Identified Applicable Rules
{{applicableRules}}

### Case Precedents
{{casePrecedents}}

### Available Remedies to Demand
{{availableRemedies}}

### Statute of Limitations Deadline
{{statuteOfLimitations}}

### Pre-Suit Notice Requirements
{{preSuitRequirements}}

## DRAFTING INSTRUCTIONS
1. Word Count Target: **{{targetWordCount}} words**. (Mandatory minimum: {{minWordCount}}, Maximum: {{maxWordCount}}).
2. Letterhead: Use placeholders [Your Name], [Your Address], [Date].
3. Recipient Info: Use [Recipient Name], [Recipient Address].
4. Citations: You MUST explicitly include at least 3 citations from the Research Packet.
5. Evidence: Reference the provided evidence ({{evidenceCount}} items) to ground the claims in fact.
6. Demand: Be specific about what is required (payment, action, etc.) and by what date.
7. Tone: Calibrate to **{{tone}}** as defined in system instructions.
8. Structure: (1) Facts, (2) Legal Basis, (3) Exposure/Remedies, (4) Demand, (5) Closing.

## OUTPUT
Return a JSON object:
{
  "draftLetter": "Full un-truncated draft text with \n for line breaks",
  "intendedTone": "{{tone}}",
  "wordCount": 1234,
  "citationsUsedCount": 5,
  "counterArgumentsAnticipated": [
    { "defense": "Typical fallback defense", "strength": "low|medium|high", "rebuttalIncluded": true }
  ]
}
