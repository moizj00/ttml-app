# Supabase MCP Connector — Capabilities & Audit Report

## Project Info

| Field | Value |
|-------|-------|
| Project ID | `lguqhibpxympxvwqpedf` |
| Project Name | talk-to |
| Region | us-east-2 |
| Status | ACTIVE_HEALTHY |
| Database | PostgreSQL 17.6.1.063 |
| Host | db.lguqhibpxympxvwqpedf.supabase.co |

> **Note:** There is also an older `talk-to-my-lawyer` project (`hesxnmtbqlsstotggxsn`, us-west-2). The active one used by this app is `lguqhibpxympxvwqpedf`.

---

## 29 Available MCP Tools

### Database & Schema
| Tool | Description |
|------|-------------|
| `list_tables` | List all tables in specified schemas |
| `execute_sql` | Run raw SQL queries (SELECT, INSERT, UPDATE, DELETE) |
| `apply_migration` | Apply DDL migrations (CREATE TABLE, ALTER, etc.) |
| `list_migrations` | List all applied migrations |
| `list_extensions` | List installed Postgres extensions |
| `generate_typescript_types` | Auto-generate TypeScript types from DB schema |

### Project Management
| Tool | Description |
|------|-------------|
| `list_projects` | List all Supabase projects |
| `get_project` | Get project details |
| `create_project` | Create a new project |
| `pause_project` | Pause a project |
| `restore_project` | Restore a paused project |
| `get_project_url` | Get the API URL |
| `get_publishable_keys` | Get API keys (anon + publishable) |

### Organizations
| Tool | Description |
|------|-------------|
| `list_organizations` | List all orgs |
| `get_organization` | Get org details + subscription plan |

### Monitoring & Debugging
| Tool | Description |
|------|-------------|
| `get_logs` | Get last 24h logs by service (api, auth, realtime, storage) |
| `get_advisors` | Security + performance lint advisors |
| `search_docs` | Search Supabase documentation via GraphQL |

### Edge Functions
| Tool | Description |
|------|-------------|
| `list_edge_functions` | List all edge functions |
| `get_edge_function` | Get edge function source code |
| `deploy_edge_function` | Deploy/update an edge function |

### Branching (Dev Workflow)
| Tool | Description |
|------|-------------|
| `create_branch` | Create a dev branch (copies migrations) |
| `list_branches` | List all dev branches |
| `delete_branch` | Delete a branch |
| `merge_branch` | Merge branch to production |
| `reset_branch` | Reset branch migrations |
| `rebase_branch` | Rebase branch on production |

### Cost Management
| Tool | Description |
|------|-------------|
| `get_cost` | Check cost of new project/branch |
| `confirm_cost` | Confirm cost before creation |

---

## Live Data Fetched

### Users Table (1 row)
| id | name | email | role | is_active | created_at |
|----|------|-------|------|-----------|------------|
| 1 | Moiz Jamil | moizj00@gmail.com | admin | true | 2026-02-25 04:35:03 |

### Tables (11 total)
users, letter_requests, letter_versions, review_actions, workflow_jobs, research_runs, attachments, notifications, subscriptions, audit_log (+ pdf_url column added to letter_requests)

---

## Security Advisors (17 warnings)

### Function Search Path Mutable (7 warnings)
Functions without explicit `search_path` — exploitable if a malicious schema is injected:
- `is_app_admin`
- `update_updated_at_column`
- `app_user_id`
- `app_user_role`
- `is_app_employee_or_admin`
- `is_app_subscriber`
- `log_audit_event`

**Fix:** Add `SET search_path = public` to each function.

### RLS Policy Always True (10 warnings)
INSERT/UPDATE policies that use `WITH CHECK (true)` — effectively bypasses RLS:
- `audit_log` INSERT
- `letter_versions` INSERT
- `notifications` INSERT
- `research_runs` INSERT + UPDATE
- `review_actions` INSERT
- `subscriptions` INSERT + UPDATE
- `users` INSERT
- `workflow_jobs` INSERT + UPDATE

**Note:** These are intentionally permissive because the server uses `service_role_key` for all writes. The RLS policies exist as a safety net for direct Supabase client access, which we don't use from the frontend. However, tightening them is still recommended for defense-in-depth.

---

## Performance Advisors

### Unused Indexes (10)
- `idx_subscriptions_user_status`
- `idx_audit_log_created`
- `idx_letter_requests_active`
- `idx_letter_requests_user_id`
- `idx_letter_requests_assigned_reviewer`
- `idx_letter_versions_letter_request_id`
- `idx_research_runs_letter_request_status`
- `idx_review_actions_letter_request_id`
- `idx_letter_requests_user_status`
- `idx_audit_log_table_record`

**Note:** These are unused because the app is new with minimal data. Keep them — they will be needed at scale.

### Multiple Permissive Policies (many)
Tables with multiple permissive SELECT policies for the same role (e.g., `attachments_select_employee` + `attachments_select_own`). Each policy runs for every query. Consider merging into single policies with OR conditions.

---

## Key Capabilities for TTML

1. **Direct SQL execution** — query any table without going through the app server
2. **Migration management** — apply schema changes programmatically
3. **Security auditing** — run `get_advisors` after any DDL change
4. **Log monitoring** — debug API issues from the last 24 hours
5. **TypeScript type generation** — keep types in sync with schema
6. **Edge Functions** — deploy serverless functions directly to Supabase
7. **Branching** — create isolated dev environments for testing migrations
