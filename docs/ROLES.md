# Roles y rutas (FieldBase)

## Roles de aplicación

| Rol | Quién es | Landing |
|-----|----------|---------|
| `super_admin` | Operador de plataforma | `/owner/overview` (tarjetas: `/owner/payment-cards`) |
| `owner` | Dueño del negocio (tenant) | `/dashboard` |
| `admin` | Admin del tenant | `/dashboard` |
| `contractor` | Contratista (nav reducido) | `/dashboard` |
| `worker` | Personal de campo | `/dashboard` |
| `viewer` | Solo lectura | `/dashboard` |

## No confundir

- **URL `/owner/*`** = consola de **plataforma** (`super_admin`)
- **Rol `owner`** = dueño de **empresa/tenant**

## Operador de plataforma (emails)

Configura en `.env.local` / Vercel:

- `SUPER_ADMIN_EMAIL` — email principal (ej. `admin@fieldbase.local`)
- `SUPER_ADMIN_EMAILS` — lista separada por comas para alias adicionales

En cada login, `reconcileUserRoleOnLogin` alinea `app_metadata.role` con esa lista. Script manual: `node scripts/set-user-role.mjs <email> super_admin`.

## Persistencia

- `super_admin` vive en `app_metadata.role` (no en constraint de `profiles.role`)
- `profiles.role` en DB: `admin` | `worker` (mapeo en `profiles.js`)
- `tenant_db_id` en `app_metadata` + sesión `tenantDbId`

## Rutas protegidas (middleware)

Sin `super_admin`:

- `/owner/*` → redirect `/dashboard`
- `/api/admin/*`, `/api/platform/*` → 403
