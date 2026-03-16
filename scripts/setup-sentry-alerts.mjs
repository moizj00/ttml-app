#!/usr/bin/env node
/**
 * Setup Sentry Alert Rules for Talk-to-My-Lawyer
 *
 * Creates 3 alert rules:
 * 1. Pipeline Failure Alert — triggers on errors tagged with pipeline_stage
 * 2. Stripe Webhook Error Alert — triggers on errors tagged with stripe_webhook component
 * 3. High Error Rate Alert — triggers when error frequency spikes
 */

const ORG = process.env.SENTRY_ORG;
const PROJECT = process.env.SENTRY_PROJECT;
const TOKEN = process.env.SENTRY_AUTH_TOKEN;

if (!ORG || !PROJECT || !TOKEN) {
  console.error("Missing SENTRY_ORG, SENTRY_PROJECT, or SENTRY_AUTH_TOKEN");
  process.exit(1);
}

const BASE = `https://sentry.io/api/0/projects/${ORG}/${PROJECT}/rules/`;

async function createRule(rule) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(rule),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error(`FAILED to create "${rule.name}":`, JSON.stringify(data, null, 2));
    return null;
  }
  console.log(`✓ Created alert rule: "${data.name}" (id: ${data.id})`);
  return data;
}

async function main() {
  console.log(`\nSentry Alert Setup — Org: ${ORG}, Project: ${PROJECT}\n`);

  // 1. Pipeline Failure Alert
  // Triggers when a new issue is first seen AND the issue has a pipeline_stage tag
  const pipelineAlert = await createRule({
    name: "🚨 AI Pipeline Failure",
    actionMatch: "all",
    filterMatch: "all",
    conditions: [
      {
        id: "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition",
        name: "A new issue is created",
      },
    ],
    filters: [
      {
        id: "sentry.rules.filters.tagged_event.TaggedEventFilter",
        key: "pipeline_stage",
        match: "is",
        value: "",
        name: "The event's tags match pipeline_stage is set",
      },
    ],
    actions: [
      {
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers",
        name: "Send a notification to IssueOwners and if none can be found then send a notification to ActiveMembers",
      },
    ],
    frequency: 5, // minutes between notifications for same rule
    environment: null,
  });

  // 2. Stripe Webhook Error Alert
  const webhookAlert = await createRule({
    name: "💳 Stripe Webhook Error",
    actionMatch: "all",
    filterMatch: "all",
    conditions: [
      {
        id: "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition",
        name: "A new issue is created",
      },
    ],
    filters: [
      {
        id: "sentry.rules.filters.tagged_event.TaggedEventFilter",
        key: "component",
        match: "eq",
        value: "stripe_webhook",
        name: "The event's tags match component equals stripe_webhook",
      },
    ],
    actions: [
      {
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers",
        name: "Send a notification to IssueOwners and if none can be found then send a notification to ActiveMembers",
      },
    ],
    frequency: 5,
    environment: null,
  });

  // 3. High Error Rate Alert — triggers when an issue is seen more than 10 times in 1 hour
  const highRateAlert = await createRule({
    name: "📈 High Error Rate Spike",
    actionMatch: "all",
    filterMatch: "all",
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        value: 10,
        comparisonType: "count",
        interval: "1h",
        name: "The issue is seen more than 10 times in 1h",
      },
    ],
    filters: [],
    actions: [
      {
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers",
        name: "Send a notification to IssueOwners and if none can be found then send a notification to ActiveMembers",
      },
    ],
    frequency: 60, // Only notify once per hour for this rule
    environment: null,
  });

  console.log("\n--- Summary ---");
  console.log(`Pipeline Alert: ${pipelineAlert ? "✓ Active" : "✗ Failed"}`);
  console.log(`Webhook Alert:  ${webhookAlert ? "✓ Active" : "✗ Failed"}`);
  console.log(`High Rate Alert: ${highRateAlert ? "✓ Active" : "✗ Failed"}`);
}

main().catch(console.error);
