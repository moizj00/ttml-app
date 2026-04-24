### Task 5: Detailed Report
Structure your entire response as a single, valid JSON object following this EXACT schema:
```json
{
  "summary": "2-3 high-level sentences",
  "keyTakeaways": ["Fact 1", "Fact 2"],
  "jurisdictionAnalysis": {
    "preferredForum": "State vs Federal vs Administrative",
    "localCourts": "Trial court name, small claims limit, local rules"
  },
  "issuesIdentified": ["Legal issue with statute/doctrine cite"],
  "applicableRules": [{
    "ruleTitle": "Name", "ruleType": "statute|regulation|case_law|local_ordinance|common_law",
    "jurisdiction": "State|Federal|Local", "citationText": "Exact citation",
    "sectionOrRule": "Section number", "summary": "What it says and how it applies",
    "sourceUrl": "URL", "sourceTitle": "Source name",
    "relevance": "How it affects this matter", "dateVerified": "YYYY-MM",
    "confidence": "high|medium|low", "caseOutcome": "For case_law only"
  }],
  "recentCasePrecedents": [{
    "caseName": "Name", "citation": "Full citation", "court": "Court",
    "year": 2023, "facts": "Brief facts", "holding": "Decision",
    "relevance": "Why it matters", "damages": "Amount awarded", "sourceUrl": "URL"
  }],
  "statuteOfLimitations": {
    "period": "Duration", "statute": "Code section",
    "clockStartsOn": "Trigger event",
    "deadlineEstimate": "Based on {{incidentDate}}",
    "tollingExceptions": ["Exceptions"], "urgencyFlag": false, "notes": "Special rules"
  },
  "preSuitRequirements": {
    "demandLetterRequired": false, "statute": "Code section",
    "waitingPeriodDays": 30, "requiredContent": ["Requirements"],
    "deliveryMethod": "Method", "penaltyForNonCompliance": "Consequence"
  },
  "availableRemedies": {
    "actualDamages": "Formula", "statutoryDamages": "Per-violation amount",
    "punitiveDamages": "Standard", "attorneyFees": "Fee-shifting type with cite",
    "injunctiveRelief": "Available|N/A", "multiplier": "Multiplier with cite"
  },
  "localJurisdictionElements": [{
    "element": "Local rule", "whyItMatters": "Strategic impact",
    "sourceUrl": "URL", "confidence": "high|medium|low"
  }],
  "enforcementClimate": {
    "agActivity": "Recent actions", "classActions": "Active cases",
    "recentLegislation": "Since 2022", "politicalLeaning": "Impact on enforcement",
    "courtReputations": "Local court tendencies"
  },
  "commonDefenses": [{
    "defense": "Name", "description": "How argued",
    "counterArgument": "How to rebut", "successRate": "Typical|Rare|Depends"
  }],
  "factualDataNeeded": ["Missing facts"],
  "openQuestions": ["Unresolved questions"],
  "riskFlags": ["Specific risks"],
  "draftingConstraints": ["Requirements for the letter draft"]
}
```
