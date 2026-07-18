# Compact Admin Workbench Design

## Scope

This change applies only to the administrator `summary` page. Customer navigation,
customer pages, customer data, and customer APIs remain unchanged.

## Goal

Keep the first screen focused on active work. Reduce unproductive whitespace while
preserving every existing action, deep link, and operational signal.

## Layout

- The main column contains, in order: the current highest-priority action, grouped
  manual decisions, and the batch AI-recognition action.
- A compact secondary column contains one combined delivery-and-risk summary.
- The summary exposes four delivery figures, operational failures, delivery failures,
  and authorization status.
- Authorization has no dedicated card when normal. If authorization errors exist,
  the summary exposes the exception count and retains the link to platform settings.

## Interaction

- Existing action buttons keep their current destinations.
- The governance link remains available from the compact summary.
- At viewports under 860px, the secondary summary follows the task column as a
  single-column layout.

## Data

- Delivery figures are derived from the existing sources, assets, deliverables, and
  releases lists.
- Operational failures include failed, error, timeout, and 5xx events.
- Authorization errors are separately derived from 401 and 403 events; 400 parameter
  errors are not shown as runtime failures.

## Verification

- Extend the guided work-queue layout contract to prohibit three-row side-column
  coupling and to retain the compact-layout classes.
- Run the administrator navigation regression suite and inspect the desktop and
