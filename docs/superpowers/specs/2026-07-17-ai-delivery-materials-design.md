# AI Delivery Materials Design

## Goal

Generate four project-specific delivery materials with AI, then require an administrator to edit and approve a version before it can be published to customers. The four materials are the configuration package, acceptance report, run guide, and skill package.

## Scope

The existing deterministic generators remain available as a fallback. AI adds customer-oriented narrative, guidance, risk notices, and document structure. Structured facts remain the source of truth and are never silently replaced by model output.

## Generation Flow

1. An administrator selects a project and material type, then provides customer background and delivery requirements.
2. The server collects a factual snapshot: project and customer details, MCP assets, tool definitions, gateway policies, access configuration, and relevant call events.
3. Sensitive values, including credentials and personally identifiable information, are removed before the model request.
4. The model returns a draft with citations to the supplied facts.
5. The server validates references to tool names, versions, endpoints, and metrics before saving the draft.
6. The administrator edits, requests a targeted rewrite, approves, or rejects the draft.
7. Only an approved version may be included in a customer-visible delivery package.

## Material Boundaries

### Configuration Package

The machine-readable JSON is generated deterministically from MCP assets and gateway policies. AI supplies deployment notes, field explanations, environmental differences, and risk notices.

### Acceptance Report

The server supplies project-scoped call events and derived metrics. AI writes the executive summary, acceptance conclusion, open issues, and recommendations, but cannot invent test results.

### Run Guide

AI uses the access configuration, MCP capabilities, tool definitions, and customer context to produce operational steps, parameter preparation, troubleshooting, and escalation guidance.

### Skill Package

The ZIP contains a deterministic `mcp-config.json` plus AI-authored `SKILL.md` and `README.md`. AI may describe approved business scenarios and tool-use rules, but the tool list is validated against published MCP assets.

## Data Model

Keep `platform_deliverables` as the delivery-material identity. Add versioned content in a separate `platform_deliverable_versions` table with:

- `id`, `deliverable_id`, `version_number`, `status`, and `content`
- `generation_context`, `fact_snapshot`, `prompt`, and model metadata
- `created_by`, `created_at`, `approved_by`, and `approved_at`
- `parent_version_id` and `change_summary`

Version statuses are `draft`, `pending_review`, `approved`, `rejected`, and `published`. Versions are immutable after creation; an edit or regeneration creates a new version.

## Permissions And Audit

Only administrators can request generation, edit drafts, approve versions, or publish delivery materials. AI cannot publish content or mutate MCP assets, tools, access configuration, or gateway policies. The audit trail stores the prompt, masked context, model metadata, review decisions, and version history.

## Failure Handling

If model generation or validation fails, preserve the prior draft and record a failed generation attempt with a non-sensitive error message. Administrators can retry or choose the deterministic template generator.

## Verification

- Unit-test prompt context construction, sensitive-data masking, and fact validation.
- Integration-test each material's generation, edit, approval, and publish gates.
- Verify rejected or unapproved versions cannot be downloaded as customer-visible material.
- Verify generated content cannot reference absent tools, endpoints, versions, or unsupported metrics.
