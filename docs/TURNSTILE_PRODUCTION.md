# Cloudflare Turnstile — production setup

## Current status check

```bash
npm run verify:turnstile
```

| `turnstile.mode` | Meaning |
|------------------|---------|
| `production` | OK — CAPTCHA active on public lead forms |
| `test_rejected` | Vercel has **test** keys (`1x0000…`) — replace with production keys |
| `disabled` | No keys configured — leads work without CAPTCHA |
| `misconfigured` | Only site key or only secret set |

## Fix test keys in production

1. Open [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile)
2. Create a widget for **Production**:
   - Hostnames: `fieldbaseapp.net`, `*.fieldbaseapp.net` (and custom contractor domains if used)
   - Widget mode: **Managed** (recommended)
3. Copy the **Site key** and **Secret key** (not the test keys that always pass)
4. In [Vercel → madrid-app → Settings → Environment Variables](https://vercel.com/fieldbaseapp/madrid-app/settings/environment-variables) (**Production**):
   - Update `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   - Update `TURNSTILE_SECRET_KEY`
5. **Redeploy** production (required — site key is embedded in the client build)

## Verify after redeploy

```bash
npm run verify:turnstile https://fieldbaseapp.net your-slug
```

Expected:

- `/api/health` → `"turnstile": { "mode": "production", "verificationRequired": true, "widgetEnabled": true }`
- Public lead form step 4 shows the Turnstile widget
- Submit without completing it shows a friendly error (not a server crash)

## Local development

Test keys are allowed when `NODE_ENV !== production`. Use Cloudflare test keys in `.env.local` only for local work.
