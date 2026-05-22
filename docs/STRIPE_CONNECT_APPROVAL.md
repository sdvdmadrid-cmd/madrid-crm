# Stripe Connect — quién aprueba y cómo activarlo

FieldBase usa **Stripe Connect Express**. Hay **dos niveles** de aprobación distintos.

---

## 1. Plataforma FieldBase (tú / la empresa)

**Quién aprueba:** **Stripe** (equipo de riesgo / compliance), no un botón interno en FieldBase.

**Quién lo solicita:** La persona con acceso **Owner/Admin** a la cuenta Stripe de FieldBase (la que tiene `STRIPE_SECRET_KEY` en Vercel).

### Pasos en Stripe Dashboard

1. Entra a [dashboard.stripe.com](https://dashboard.stripe.com) con la cuenta **live** de FieldBase.
2. Menú **Connect** → **Get started** / **Settings**.
3. Completa el perfil de plataforma:
   - Descripción del negocio (SaaS para contractors / field services)
   - URL del sitio: `https://fieldbaseapp.net`
   - Términos y privacidad enlazados (páginas `/legal` o las que uses en producción)
   - Flujo de pagos: clientes pagan a contractors; FieldBase cobra fee de plataforma
4. Envía la solicitud. Stripe puede pedir documentación extra por email.
5. Cuando Connect esté **habilitado** en el Dashboard (estado “Enabled” / puedes crear cuentas Express):

### Pasos en FieldBase (Vercel)

```bash
# Production only, después de aprobación Stripe:
STRIPE_CONNECT_ENABLED=true
```

Opcional:

- `FIELDBASE_PLATFORM_FEE_BPS=75` (0.75%)
- `FIELDBASE_PLATFORM_FEE_FIXED_CENTS=0`

Redeploy producción. Sin esto, la app responde **503** en `/api/payments/connect/onboard` (comportamiento actual, correcto).

**Tiempo típico:** desde unos días hasta varias semanas, según volumen previsto, industria y documentación.

---

## 2. Cada contractor (cuenta conectada Express)

**Quién aprueba:** **Stripe** al completar el onboarding (KYC automático en Express; a veces revisión manual).

**Quién lo inicia:** El contractor en FieldBase (Invoices → pagos / guía Connect) cuando `STRIPE_CONNECT_ENABLED=true`.

**Flujo en la app:**

1. Contractor admin pulsa conectar pagos → `POST /api/payments/connect/onboard`
2. Redirección a **Stripe Account Link** (formulario identidad, banco, etc.)
3. Webhook `account.updated` (futuro) o sync manual actualiza `company_profiles`:
   - `stripe_connect_account_id`
   - `stripe_connect_charges_enabled`
   - `stripe_connect_payouts_enabled`

FieldBase **no** “aprueba” contractors manualmente; solo exige que Stripe marque la cuenta como lista para cobros y payouts.

---

## Resumen rápido

| Nivel | Quién solicita | Quién aprueba | Dónde se ve |
|-------|----------------|---------------|-------------|
| Plataforma FieldBase | Owner cuenta Stripe | Stripe Risk | Dashboard → Connect |
| Contractor Express | Contractor en app | Stripe KYC | Account Link + columnas `company_profiles` |

---

## Mientras Connect no está aprobado (hoy)

- Pagos de facturas siguen en la **cuenta Stripe de la plataforma** (comportamiento actual).
- `STRIPE_CONNECT_ENABLED=false` → sin destination charges ni onboarding.
- Migración SQL ya aplicada → listo para cuando actives el flag.

---

## Checklist antes de pedir Connect a Stripe

- [ ] Sitio público estable (`fieldbaseapp.net`)
- [ ] Terms / Privacy accesibles
- [ ] Descripción clara: “marketplace / platform for field service contractors”
- [ ] Webhooks Stripe en prod funcionando (`STRIPE_WEBHOOK_SECRET`)
- [ ] PR #9 mergeado a `main` (recomendado)

**Texto listo para pegar en el formulario de Stripe (inglés):** `docs/STRIPE_CONNECT_APPLICATION_DRAFT.md`

Referencia técnica: `docs/payments-architecture.md`, `docs/payments-money-flow-and-monetization.md`.
