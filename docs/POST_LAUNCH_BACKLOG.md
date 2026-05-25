# Post-launch backlog

These are the requested follow-up features after the initial production launch. Each one has a tracking issue with the full spec; this file is a single-glance index so we can re-prioritize without digging through the issue list.

| #  | Feature                                                                    | Tracking issue                                                       | Status  |
| -- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------- |
| 1  | Website builder: queue edits as draft + explicit Publish (foundation)      | [#43](https://github.com/sdvdmadrid-cmd/madrid-crm/issues/43)        | Queued  |
| 2  | 3D AI logo generator + manual upload + auto logo on invoices/estimates     | [#40](https://github.com/sdvdmadrid-cmd/madrid-crm/issues/40)        | Queued  |
| 3  | Mobile + QR code media upload (lives inside Photos & Gallery card)         | [#39](https://github.com/sdvdmadrid-cmd/madrid-crm/issues/39)        | Queued  |
| 4  | AI bubble — ChatGPT-grade: schedule jobs, draft estimates, build contracts | [#41](https://github.com/sdvdmadrid-cmd/madrid-crm/issues/41)        | Queued  |

## Suggested implementation order

1. **#43 Draft / Publish workflow** — foundation. Every other website-side feature relies on the "draft until publish" contract, so this lands first. Adds `draft_content` snapshot, publish-revalidate flow, and the unpublished-changes warning.
2. **#40 Logo (AI 3D + manual upload + invoice / estimate placement)** — small scope, unblocks the visible "no logo upload anywhere" complaint, and lets the invoice / estimate experience feel premium immediately.
3. **#39 QR / mobile upload** — depends on #43 because uploads from the QR flow drop into the draft gallery for the contractor to approve before the next publish.
4. **#41 AI bubble (ChatGPT-grade)** — biggest scope. Depends on stable estimate / contract / job APIs and the publish workflow so the bubble's "Save to FieldBase" buttons work consistently. Includes tool-calling, multi-turn memory, Google Calendar scheduling, contract-from-estimate generation, and co-authored estimates.

## Current state references (snapshots from the codebase audit)

- `contractor_websites` has a `published` boolean and a Publish/Unpublish button, but **every edit autosaves straight to the same row** that the public site reads — there is no draft snapshot. #43 introduces the draft column and the publish atomic-swap.
- `company_profiles.logo_data_url` already flows through `getPublicWebsiteBySlug` and into the JSON-LD `image` property, so adding manual upload UI is purely a frontend + storage move. Invoice / estimate templates don't currently render the logo at all — #40 adds that.
- Google Calendar OAuth is implemented (`src/lib/google-calendar.js`, `/api/integrations/google/connect`, `/api/integrations/google/callback`). Wiring the AI to it is the missing piece.
- The AI bubble (`src/components/AiBubbleClient.js`) already has `schedule`, `crm`, `reply`, `proposal`, `website`, and `owner` modes but no tool-calling backend — every response today is plain text. #41 promotes it to real actions with confirmation drafts.
- The media upload pipeline (`src/lib/website-media-storage.js`, `/api/website-builder/upload-media`) is already namespaced per tenant — the QR route can reuse it with a token-based auth strategy instead of session cookies.
