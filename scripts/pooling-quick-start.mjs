#!/usr/bin/env node

/**
 * Quick Pooling Activation Helper
 * Run: node scripts/pooling-quick-start.mjs
 * 
 * Proporciona los comandos y tokens necesarios para activar pooling.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PROJECT_ID = SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║          ACTIVAR CONNECTION POOLING - QUICK START             ║
╚═══════════════════════════════════════════════════════════════╝

📍 Project: ${PROJECT_ID}

═══════════════════════════════════════════════════════════════

OPCIÓN 1: MANUAL (Dashboard) - 2 MINUTOS ⚡

1. Ve a: https://supabase.com/dashboard/project/${PROJECT_ID}/database

2. Abre Settings → Database → Connection Pooling

3. Haz clic en "Enable Pooling"

4. Configura así:
   • Mode: Transaction
   • Pool Size: 100
   • Connection Timeout: 30 seconds

5. Click "Save"

═══════════════════════════════════════════════════════════════

OPCIÓN 2: API AUTOMÁTICA (Si tienes Management API Token)

1. Obtén token en: https://supabase.com/dashboard/account/tokens

2. Ejecuta:
   node scripts/enable-pooling.mjs "YOUR_TOKEN_HERE"

3. Reemplaza "YOUR_TOKEN_HERE" con tu token real

═══════════════════════════════════════════════════════════════

VERIFICACIÓN:

Después de activar (espera 1-2 min), ejecuta:

  node scripts/verify-pooling.mjs

═══════════════════════════════════════════════════════════════

RESULTADOS ESPERADOS:

✅ Usuarios concurrentes: 50-200 → 1,000+
✅ Connection overhead: -70%
✅ Pool Size: 100 (configurable)
✅ Costo: MISMO ($25/mes pro plan)

═══════════════════════════════════════════════════════════════

¿PREGUNTAS?

📖 Guía completa: POOLING_ACTIVATION_GUIDE.md
🔗 Docs: https://supabase.com/docs/guides/database/connection-pooling
💬 Community: https://discord.supabase.io

═══════════════════════════════════════════════════════════════
`);

process.exit(0);
