# Search behavior (platform)

## Client autocomplete (`/api/clients/search`)

Used on **Clients**, **New Estimate**, **Invoices** (via `ClientSearchAutocomplete`).

1. Query is sanitized (strips `%`, `,`, `_` that break PostgREST).
2. **Short queries (1–2 characters)** only search `name` and `company` (avoids email/address noise).
3. Longer queries also search email, address, and phone (digits when ≥3).
4. Up to 80 candidates are loaded, then **relevance-ranked**, deduped, and trimmed to `limit` (default 20).

### Ranking priority (highest first)

- Exact / prefix match on **client name**
- Word-start match in name (e.g. `h` → **H**enry)
- Company name prefix / contains
- Phone digits (≥3 chars)
- Email local-part prefix
- Address (lowest; ignored for 1–2 char tokens)

## List filters (client-side)

**Lead Inbox**, **Bill Payments** (and extensible via `src/lib/record-search.js`):

- Tokenized query; all tokens must match with a positive score.
- Primary field (name / provider) weighted highest.
- Results sorted by score, not alphabet.

## Not server-ranked (simple contains)

- Admin dashboard tables (super-admin)
- Jobs list (clientId URL filter only; no text search bar)

## Places / weather

- Google Places and Open-Meteo geocoding — separate APIs, not client CRM search.
