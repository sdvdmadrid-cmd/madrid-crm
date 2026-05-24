# Local vs production — why they can look different

## Push ≠ instant magic on your screen

1. **Git push to `main`** triggers a Vercel production deploy (~1–2 min).
2. **Production URL:** https://fieldbaseapp.net (not localhost).
3. **Hard refresh** on prod: `Ctrl+Shift+R` (cache can show old UI).

## Common reasons localhost has "more" than online

| Cause | What to do |
|-------|------------|
| **Uncommitted local code** | Only on your machine until `git commit` + push + PR merge |
| **`npm run dev` vs Vercel build** | Dev can feel faster/different; prod uses `next build` |
| **Env vars differ** | `STRIPE_CONNECT_ENABLED`, Stripe keys, `DEV_LOGIN_ENABLED` — set in Vercel Production |
| **Different login** | Local dev-login vs prod email/password = different tenant data |
| **Supabase** | Same DB usually; company name comes from `company_profiles` per tenant |

## Verify production is current

```bash
git log origin/main -1 --oneline
vercel ls madrid-app --prod
curl https://fieldbaseapp.net/api/health
```

Latest deploy should be minutes after the last merge to `main`.

## Force redeploy (if needed)

```bash
vercel deploy --prod
```

Or: Vercel Dashboard → madrid-app → Deployments → Redeploy latest `main`.
