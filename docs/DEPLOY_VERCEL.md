# Deploy en Vercel (FieldBase)

## 1. Variables de entorno (Production)

Usa `VERCEL_PRODUCTION_ENV.md` como lista maestra. Mínimo:

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Auth: `SESSION_SECRET` (32+ chars, dedicado)
- Cifrado: `ENCRYPTION_KEY` (64 hex)
- URLs: `APP_URL`, `APP_BASE_URL` (HTTPS producción)
- Stripe + Bill Payments si están activos
- Email (Resend) si está activo
- `DEV_LOGIN_ENABLED=false`, `NEXT_PUBLIC_DEV_LOGIN_ENABLED=false`

## 2. Crons (`vercel.json`)

| Ruta | Horario (UTC) | Secret env |
|------|---------------|------------|
| `/api/bill-payments/autopay/process` | 06:00 diario | `BILL_AUTOPAY_CRON_SECRET` |
| `/api/bill-payments/remittance/process` | 08:00 diario | `BILL_REMITTANCE_CRON_SECRET` o fallback autopay |
| `/api/bill-payments/platform-fee/process` | 07:00 día 1 del mes | `BILL_PLATFORM_FEE_CRON_SECRET` o fallback |

**Vercel Cron auth:** define `CRON_SECRET` en Production. Vercel envía `Authorization: Bearer <CRON_SECRET>`. El código también acepta ese valor si coincide con los secrets de bill-payments.

Prueba manual:

```powershell
$secret = "<BILL_AUTOPAY_CRON_SECRET>"
Invoke-WebRequest -Method POST -Uri "https://app.tudominio.com/api/bill-payments/autopay/process" -Headers @{ "x-cron-secret" = $secret }
```

## 3. Deploy

1. Conectar repo `madrid-crm` en Vercel.
2. Framework: Next.js, build `npm run build`, output default.
3. Aplicar migraciones Supabase: `npx supabase db push` (con `SUPABASE_DB_PASSWORD`).
4. Deploy Production; revisar logs: `[startup] Production configuration validated.`
5. `GET /api/health` → 200.

## 4. Post-deploy

- Stripe webhooks → URL producción `/api/payments/webhooks/stripe`
- Verificar crons en Vercel → Settings → Cron Jobs
- Checklist: `docs/SMOKE_CHECKLIST.md`
