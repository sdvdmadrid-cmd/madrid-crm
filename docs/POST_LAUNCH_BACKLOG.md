# Post-launch backlog

These are the requested follow-up features after the initial production launch. Each one has a tracking issue with the full spec; this file is a single-glance index so we can re-prioritize without digging through the issue list.

| #  | Feature                                                          | Tracking issue                                                       | Status  |
| -- | ---------------------------------------------------------------- | -------------------------------------------------------------------- | ------- |
| 1  | Mobile + QR code media upload for contractors                    | [#39](https://github.com/sdvdmadrid-cmd/madrid-crm/issues/39)        | Queued  |
| 2  | 3D-styled AI logo generator + manual logo upload UI              | [#40](https://github.com/sdvdmadrid-cmd/madrid-crm/issues/40)        | Queued  |
| 3  | AI bubble schedule mode → real jobs + Google Calendar events     | [#41](https://github.com/sdvdmadrid-cmd/madrid-crm/issues/41)        | Queued  |

## Suggested implementation order

1. **#40 logo upload** — smallest scope, unblocks a real complaint, and stops `data:` logos from breaking OG previews on the public site.
2. **#39 QR upload** — high impact for sales demos; new public route and one new table, isolated from everything else.
3. **#41 AI scheduling** — biggest scope. Wait until #40 and #39 are in so the AI bubble has a stable UI surface to drop a draft card into.

## Current state references (snapshots from the codebase audit)

- `company_profiles.logo_data_url` already flows through `getPublicWebsiteBySlug` and into the JSON-LD `image` property, so adding upload UI is purely a frontend + storage move.
- Google Calendar OAuth is implemented (`src/lib/google-calendar.js`, `/api/integrations/google/connect`, `/api/integrations/google/callback`). Wiring the AI to it is the missing piece.
- The AI bubble (`src/components/AiBubbleClient.js`) already has a `schedule` mode in its dropdown but no tool-calling backend.
- The media upload pipeline (`src/lib/website-media-storage.js`, `/api/website-builder/upload-media`) is already namespaced per tenant — the QR route can reuse it with a token-based auth strategy instead of session cookies.
