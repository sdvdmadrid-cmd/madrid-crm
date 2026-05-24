# Stripe keys — why they seem to “disappear”

FieldBase **does not delete** your Stripe keys. These are the usual causes:

## 1. `vercel env pull` wipes local secrets

When you run:

```bash
vercel env pull .env.local
```

Vercel **does not download** the real value of sensitive variables. The file often contains:

```env
STRIPE_SECRET_KEY=""
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
```

That **overwrites** your working `.env.local` and looks like the key was deleted.

**Fix:** Do not pull into `.env.local`. Copy keys manually from [Stripe Dashboard → API keys](https://dashboard.stripe.com/apikeys).

Restore a backup if needed:

```bash
npm run env:backups
npm run env:restore
```

## 2. Stripe invalidates old secret keys

If you click **Roll key** or create a new **Secret key** in Stripe, the **previous** `sk_live_...` stops working immediately. It feels like Vercel “lost” the key, but the value is just **revoked**.

**Fix:** Copy the **new** `sk_live_...` into Vercel **Production** → Redeploy.

## 3. Wrong key type pasted

| Prefix | Use |
|--------|-----|
| `sk_live_` | Server secret — **this one** for `STRIPE_SECRET_KEY` |
| `pk_live_` | Browser publishable — `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` only |
| `rk_live_` | Restricted key — **not** for FieldBase server |

## 4. Updated Vercel but no redeploy

Changing env vars in Vercel does not affect the live app until you **Redeploy** production.

## Safe setup (once)

1. Stripe Dashboard (Live mode) → copy **Secret key** (`sk_live_...`) and **Publishable key** (`pk_live_...`).
2. [Vercel → madrid-app → Environment Variables → Production](https://vercel.com/fieldbaseapp/madrid-app/settings/environment-variables)
   - `STRIPE_SECRET_KEY` = `sk_live_...`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_live_...`
3. **Deployments → Redeploy** (Production).
4. Local: paste the same keys into `.env.local` manually (never `vercel env pull .env.local`).

## Verify

```bash
node scripts/check-stripe-key.mjs
```

You should see `HTTP 200` for the secret key test.
