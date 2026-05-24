# Por qué localhost se ve “nuevo” y production “igual”

## El código SÍ está en production

Si `https://fieldbaseapp.net/api/health` muestra el mismo `commitSha` que `git log origin/main -1`, **el deploy está al día**. No falta push.

Comprueba en cualquier página de prod (esquina inferior derecha):

**`prod · xxxxxxxx`** — debe coincidir con `/api/health`.

## Causas más comunes

| Causa | Qué hacer |
|-------|-----------|
| **Eres dueño de plataforma (super_admin)** | En prod entras a **Mission Control** (`/owner/overview`), NO al CRM contractor. En localhost `dev-login` simula **contractor**. En prod: botón **“Abrir workspace contractor”** en Mission Control |
| **Cache del navegador o app instalada (PWA)** | Ctrl+Shift+R; en móvil borrar datos del sitio; desinstalar “FieldBase” del home screen y volver a abrir en Safari/Chrome |
| **Login distinto** | Local: `dev-login` como admin. Prod: tu email real → otro tenant, otros datos, mismo diseño |
| **Website builder vs sitio público** | El builder es `/website`. El sitio nuevo es `/site/TU-SLUG` solo después de **Publish** |
| **URL incorrecta** | Usar **https://fieldbaseapp.net** (no un preview viejo de Vercel) |

## Verificación rápida

```bash
npm run verify:prod
```

Debe mostrar `htmlBuild=` igual a `commitSha=`.

## Si `prod ·` en pantalla ≠ `/api/health`

Tu navegador sigue con HTML viejo. Cierra todas las pestañas de FieldBase, hard refresh, o ventana de incógnito.
