# FieldBase AI Agent — Action Mode

The workspace assistant (`WorkspaceAgentBubble` on every authenticated page) can **execute operations** via server-side tools, not only answer questions.

## Enable

Turn on **Agent Mode** in the assistant panel (default: on).

Requires `OPENAI_API_KEY` and tenant write access.

## Capabilities

| Area | Tools | Example |
| --- | --- | --- |
| Estimates | `createEstimate`, `sendEstimate`, `searchEstimates` | “Create an estimate for John Smith for spring cleanup and 10 yards of mulch.” |
| Invoices | `createInvoice`, `searchInvoices` | “Create an invoice for the Elmhurst patio project.” |
| Contracts | `createContract` | “Create a contract for the Johnson patio project.” |
| Calendar | `createAppointment`, `searchAppointments` | “Schedule mulch installation next Tuesday at 8 AM.” |
| Clients | `createClient`, `updateClient`, `searchClients` | “Add client Maria Lopez, 555-0100.” |
| Jobs | `createJob`, `searchJobs` | “Create a patio project for 123 Main St.” |
| CRM search | All `search*` tools | “Find unpaid invoices.” |
| PDF | `generatePDF` | Opens estimate/invoice PDF in a new tab |

Line items for estimates are matched against **Services Catalog** when possible.

## Address intelligence

`createAppointment` validates addresses using **Google Places** (server-side). Fake or unverified addresses are rejected. Configure `GOOGLE_PLACES_API_KEY` for scheduling from natural language.

## Voice

Use the microphone button in the assistant (Web Speech API). Dictate commands, then tap **Send**.

## Slash commands (operations)

- `/estimate …` — create estimate  
- `/invoice …` — create invoice  
- `/schedule …` — book appointment  
- `/job …` — create job  
- `/client …` — find/create client  
- `/search …` — CRM search  

Website commands (`/audit`, `/hero`, `/pricing`, etc.) still work on **Website Builder**.

## Architecture

```
User message → POST /api/workspace-agent
  → orchestrator.runWorkspaceAgentTurn
    → operations-agent (OpenAI tools, up to 8 turns)
      → tools/execute.js (Supabase mutations)
  → actions[] → client-executor (navigate, open PDF)
```

Key files:

- `src/lib/workspace-agent/operations-agent.js`
- `src/lib/workspace-agent/tools/definitions.js`
- `src/lib/workspace-agent/tools/execute.js`
- `src/lib/places-server.js`

## Tests

```bash
node --test tests/unit/workspace-agent-operations.test.mjs
```
