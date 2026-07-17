# Real-Time Navigation Data Design

## Goal

Make every admin and customer navigation page render from persisted server data,
live API responses, and recorded events rather than browser-only or hard-coded
template data.

Existing seeded records remain in the database. They continue to provide an
initial view until real records replace or supplement them.

## Scope

- Keep existing database seed data unchanged.
- Remove browser `localStorage` records as a data source for navigation pages.
- Remove hard-coded governance, monitoring, and builder display fallbacks.
- Replace mock page-only summaries with API-backed data or explicit empty states.
- Refresh page state after mutations, page changes, and server push events.
- Preserve role-based scoping for administrators and customer users.

## Data Contract

The browser state is populated only from authenticated APIs. Page renderers read
that state and do not manufacture business records.

The server exposes a single navigation snapshot endpoint for each role:

- `GET /api/platform/navigation-data` returns all administrator page collections
  and derived summaries from SQLite.
- `GET /api/customer/navigation-data` returns only the current customer's
  permitted collections and derived summaries.

The existing focused endpoints remain for mutations and drill-down details.
After a mutation succeeds, the client reloads the navigation snapshot.

## Static Data Removal

- Seed data stays server-side and is treated like ordinary persisted data.
- `GOVERNANCE_DEMO_SCENARIOS` no longer supplies page records; governance pages
  derive queues, failures, examples, and coverage from candidates, reviews,
  releases, policies, and call events.
- Browser-only builder drafts, release overrides, billing overrides, access
  overrides, and monitoring statuses are removed or persisted through APIs.
- WorkBuddy test views show recorded tool calls and real API responses. When no
  call exists, they show an empty state instead of generated results.

## Refresh Behavior

- Initial load and page switch fetch the appropriate navigation snapshot.
- Successful create, update, delete, security check, WorkBuddy call, publish,
  rollback, and delivery actions reload it.
- The existing WebSocket updates trigger a snapshot reload for relevant events.
- Customer pages retain polling as a fallback; administrator pages refresh when
  the tab becomes visible and after server events.

## Error Handling

- An unavailable collection is rendered as an empty state, not substituted data.
- Snapshot request failure leaves the last successful state visible and reports a
  non-blocking error.
- A missing optional feature collection returns an empty array to keep every
  navigation page renderable.

## Verification

- Add tests proving navigation snapshots contain persisted data and respect
  customer scope.
- Add renderer tests proving no navigation page consumes local draft or demo
  records.
- Add an end-to-end test that creates a record, reloads the snapshot, and sees
  it on its target navigation page.
- Run all existing admin and customer navigation regression tests.
