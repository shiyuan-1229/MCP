# Recognition To Candidates Flow

## Goal

After AI recognizes an imported source, guide the administrator into candidate business capabilities and human screening. Tool packaging must not be offered before those governance steps.

## Flow

1. Keep the AI capability preview after a source is scanned.
2. Replace the packaging prompt with a primary action labelled `确认识别并进入候选业务能力`.
3. That action creates the OpenAPI recognition result, confirms it, creates its candidate business capabilities, and opens the candidate page filtered to this OpenAPI result.
4. The next governance action remains candidate interface screening. Tool boundary confirmation and Tool draft generation stay downstream.

## Traceability

Candidate business capability cards and candidate interface screening cards will both:

- Sort newest `created_at` first in the renderer, regardless of API ordering.
- Display the source material name resolved through the linked OpenAPI result.
- Display the candidate recognition time from `created_at`.
- Display a `本次识别` marker whenever the page is filtered to the newly recognized source.

## Errors And Tests

- If creating or confirming the recognition result fails, stay on the preview and show the API error. Do not navigate to Tool packaging.
- Add regression tests for the intended action label, the recognition-to-candidates transition, newest-first ordering, and source/time traceability in both candidate pages.
