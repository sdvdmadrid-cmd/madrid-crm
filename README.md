# FieldBase

Aplicacion Next.js para gestion de clientes, trabajos e ingresos de contratistas con Supabase.

## Desarrollo (sin pasos manuales)

Primera vez en Windows, genera el certificado local confiable:

```bash
npm run https:setup
```

Luego arranca la app con HTTPS local:

```bash
npm run dev
```

Usa un solo comando para el dia a dia despues de generar el certificado:

```bash
npm run dev
```

Importante: el comando correcto es `npm run dev`.
No uses `npm dev run` (orden invertido), porque ese comando falla en npm.

Este comando arranca la app en `https://localhost:3000` usando un certificado confiable generado con `mkcert`.

Si el puerto `3000` esta ocupado por otro proceso, el script levantara la app en el siguiente puerto libre y mostrara la URL final en consola.

Si necesitas arrancar Next sin HTTPS para una prueba puntual, puedes usar:

```bash
npm run dev:http
```

## Otros scripts utiles


## Si algo falla al iniciar

Corre estos comandos en orden:

```bash
npm run dev:clean
npm run dev:status
```

Si aun hay problema, ejecuta:

```bash
npm run dev:doctor
```

Si quieres un chequeo total del runtime (rutas, health y auth), primero levanta dev y luego corre:

```bash
npm run dev:doctor:full
```

## HTTPS local confiable

La app de desarrollo usa un servidor Node HTTPS minimo en `server.js` y lee estos archivos:


El script `npm run https:setup` hace esto automaticamente en Windows:

1. Instala `mkcert` con `winget` si no existe.
2. Ejecuta `mkcert -install` para confiar la CA local.
3. Genera el certificado de `localhost`, `127.0.0.1` y `::1`.

Con eso, el navegador debe abrir `https://localhost:3000` sin advertencias, siempre que `mkcert -install` se haya completado correctamente en tu perfil de Windows.

## Admin de desarrollo

Con la app corriendo, puedes entrar como administrador sin escribir nada en el formulario:

```bash
npm run dev:admin
```

Para mostrar los botones `Admin dev`, `Contractor dev` y `Viewer dev` en la pantalla de login y habilitar el endpoint `/api/auth/dev-login`, configura ambas variables:


Si no estan activadas, los botones no se muestran y el endpoint responde `404`.

Por seguridad, no hay contrasenas por defecto para perfiles de `dev-login`.
Debes configurar `DEV_*_PASSWORD` en variables de entorno para cada perfil que quieras usar.


Puedes cambiarlas con variables de entorno: `DEV_ADMIN_TENANT_ID`, `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`, `DEV_ADMIN_NAME`, `DEV_VIEWER_TENANT_ID`, `DEV_VIEWER_EMAIL`, `DEV_VIEWER_PASSWORD`, `DEV_VIEWER_NAME`, `DEV_CONTRACTOR_TENANT_ID`, `DEV_CONTRACTOR_EMAIL`, `DEV_CONTRACTOR_PASSWORD`, `DEV_CONTRACTOR_NAME`, `DEV_SUPERADMIN_TENANT_ID`, `DEV_SUPERADMIN_EMAIL`, `DEV_SUPERADMIN_PASSWORD`, `DEV_SUPERADMIN_NAME`.

## Estimador IA

En la vista de trabajos hay un bloque `Estimador IA para contratistas` que calcula:


## Cobro online con Stripe

El proyecto ahora incluye cobro online para facturas:


Variables de entorno requeridas:


En desarrollo local puedes usar Stripe CLI:

```bash
stripe listen --forward-to http://localhost:3000/api/payments/webhooks/stripe
```

Luego toma el secret que entrega Stripe CLI y guardalo en `STRIPE_WEBHOOK_SECRET`.

## Bill Payments System

This app includes a full-featured Bill Payments system:

- Add, track, and pay bills from the dashboard
- Supports ACH, credit, and debit card payments (Stripe/Plaid)
- AutoPay with flexible scheduling and rules
- Bulk payments for contractors/businesses
- Tag, filter, and export payment history
- Email notifications for due dates and payment confirmations
- PCI-compliant, secure, and production-ready

See `src/app/bill-payments/` for UI and API, and `src/lib/stripe-payments.js`, `src/lib/plaid-integration.js`, and `src/lib/notifications.js` for integrations.

## Bill Payments

El modulo `Bill Payments` agrega:

- registro y busqueda de proveedores
- pago manual y pago en lote
- metodos guardados con Stripe para tarjeta y ACH
- reglas de `AutoPay`
- historial, export y notificaciones

Variables de entorno operativas para este modulo:

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `BILL_AUTOPAY_CRON_SECRET`
- `APP_BASE_URL` o `APP_URL`

### Ejecutar AutoPay manualmente

Para disparar el procesador desde el propio repo:

```bash
npm run bill:autopay
```

El script usa este orden para resolver la base URL:

1. `BILL_AUTOPAY_BASE_URL`
2. `APP_BASE_URL`
3. `APP_URL`
4. deteccion local sobre `https://localhost:3000-3010`

Si necesitas forzarlo manualmente:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-bill-autopay.ps1 -BaseUrl https://localhost:3000 -CronSecret <secret>
```

### Aplicar migraciones Bill Payments

La migracion principal es:

- `supabase/migrations/20260419173000_create_bill_payments_feature.sql`

Desde esta maquina el CLI responde con `npx supabase`, pero el proyecto remoto requiere `SUPABASE_DB_PASSWORD` para conectar. Si esa variable no esta definida, los comandos remotos fallan con autenticacion SASL.

Comando esperado cuando el secret este disponible:

```bash
npx supabase db push
```

## Error comun

Si ves `CommandNotFoundException` con `nmp run dev`, es un typo.

El comando correcto es:

```bash
npm run dev
```

## Email setup

Auth emails and other transactional emails use Resend when `EMAIL_PROVIDER=resend`.

Required production settings:

- `APP_URL=https://app.yourdomain.com`
- `APP_BASE_URL=https://app.yourdomain.com`
- `RESEND_API_KEY=re_...` from the active Resend workspace
- `EMAIL_FROM=FieldBase <noreply@mail.yourdomain.com>` using a domain verified in Resend
- `EMAIL_WEBHOOK_SECRET=<long-random-secret>`
- `ALLOW_INSECURE_DEV_WEBHOOKS=false`
- `DEV_LOGIN_ENABLED=false`
- `NEXT_PUBLIC_DEV_LOGIN_ENABLED=false`

Do not use `@resend.dev` or `example.com` sender addresses in production. Those are only suitable for development/testing.

## Production env checklist

Use these values as the expected baseline before deploying:

- `APP_URL=https://app.yourdomain.com`
- `APP_BASE_URL=https://app.yourdomain.com`
- `EMAIL_PROVIDER=resend`
- `EMAIL_FROM=FieldBase <noreply@mail.yourdomain.com>`
- `RESEND_API_KEY=re_...`
- `EMAIL_WEBHOOK_SECRET=<long-random-secret>`
- `ALLOW_INSECURE_DEV_WEBHOOKS=false`
- `SESSION_SECRET=<at-least-32-char-random-secret>`
- `DEV_LOGIN_ENABLED=false`
- `NEXT_PUBLIC_DEV_LOGIN_ENABLED=false`

In production, the app now fails startup when it detects localhost URLs, test sender domains like `resend.dev`, or dev login flags left enabled. Webhook endpoints also reject unsigned requests by default in development unless `ALLOW_INSECURE_DEV_WEBHOOKS=true` is set explicitly.
