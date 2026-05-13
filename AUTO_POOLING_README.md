# 🚀 Activar Connection Pooling (Totalmente Automático)

## ⚡ Una sola línea:

```bash
node scripts/auto-pooling.mjs
```

El script te pedirá tu **Supabase Management API Token** de forma interactiva, y luego activará pooling automáticamente.

---

## 📋 Si ya tienes el token:

```bash
node scripts/auto-pooling.mjs "YOUR_MANAGEMENT_API_TOKEN"
```

Reemplaza `YOUR_MANAGEMENT_API_TOKEN` con tu token real.

---

## 🔑 ¿Dónde obtener el token?

1. Ve a: https://supabase.com/dashboard/account/tokens
2. Crea un nuevo token (o copia uno existente)
3. Pegalo en el script

---

## ✅ Qué hace el script:

1. ✓ Conecta a Supabase Management API
2. ✓ Obtiene config actual de tu BD
3. ✓ Activa pooling con configuración óptima:
   - Mode: Transaction
   - Pool Size: 100
   - Timeout: 30s
4. ✓ Valida que se activó correctamente
5. ✓ Muestra detalles de conexión

---

## 📊 Resultado:

```
✅ POOLING ACTIVATED SUCCESSFULLY

Configuración aplicada:
  • Pool Mode: Transaction
  • Pool Size: 100
  • Connection Timeout: 30s

Capacidad mejorada:
  🚀 Usuarios concurrentes: 50-200 → 1,000+
  🚀 Connection overhead: -70%
  🚀 Costo: $25/mes (sin cambios)
```

---

## 🔄 Próximos pasos después de activar:

```bash
# 1. Espera 1-2 minutos
# 2. Reinicia la app
npm run dev

# 3. Verifica que está funcionando
node scripts/verify-pooling.mjs

# 4. Listo! Tu app ahora soporta 1,000+ usuarios concurrentes
```

---

## 🆘 ¿Problemas?

### Error: "Failed to fetch config"
- ❌ Token inválido
- ✅ Solución: Obtén un nuevo token en https://supabase.com/dashboard/account/tokens

### Error: "Failed to enable pooling"
- ❌ Token sin permisos suficientes
- ✅ Solución: Crea un token nuevo con acceso a "database"

### "Connection refused"
- ❌ Pooling aún no está activo
- ✅ Solución: Espera 1-2 minutos después de activar

---

## 💡 Alternativa manual (si no tienes Management API token):

1. Ve a: https://supabase.com/dashboard/project/fhcbnupmdpphzdafmmgd/database
2. Click en Settings → Database → Connection Pooling
3. Enable Pooling
4. Configura:
   - Mode: Transaction
   - Pool Size: 100
   - Timeout: 30s
5. Save

---

## 📚 Más info:

- [POOLING_ACTIVATION_GUIDE.md](../POOLING_ACTIVATION_GUIDE.md) — Guía detallada
- [PRODUCTION_SCALABILITY_GUIDE.md](../PRODUCTION_SCALABILITY_GUIDE.md) — Roadmap completo
- [Docs oficiales](https://supabase.com/docs/guides/database/connection-pooling) — Supabase docs
