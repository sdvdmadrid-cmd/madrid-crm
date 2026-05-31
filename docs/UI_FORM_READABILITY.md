# Form readability (dark workspace)

## Design tokens (`premium-design.css`)

| Token | Role | Target contrast |
|-------|------|-----------------|
| `--fb-text-heading` | Titles, input values | ~15:1 on surfaces |
| `--fb-text` | Body copy | ~10:1 |
| `--fb-text-label` | Labels, section headers | ~7:1 (WCAG AA for UI components) |
| `--fb-text-muted` | Secondary meta | ~5.5:1 |
| `--fb-text-placeholder` | Placeholders | ~4.6:1 |
| `--fb-text-helper` | Hints, empty states | ~5:1 |

## Global rules (`form-accessibility.css`)

Loaded app-wide inside `.fb-workspace` (authenticated shell). Covers:

- Clients (`cf-input`, client search, details panel)
- Estimates (`/estimates/new` via `.fb-estimate-form` + Tailwind remap)
- Leads (`lead-inbox.module.css`)
- Jobs (`jobs.module.css` + `workspace-dark` inputs)
- Invoices (`invoices.module.css` fields)
- Settings (`ContractorPaymentsSettings.module.css`)

## Single estimates workflow

- Client details panel: **Estimates** only (no legacy Jobber **Quotes** section).
- `quotes` table retained for import/invoice FK history only.

## Mobile

Inputs use `font-size: 16px` at `max-width: 640px` to prevent iOS zoom-on-focus.
