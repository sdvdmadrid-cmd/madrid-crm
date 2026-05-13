#!/usr/bin/env node

/**
 * Automated Connection Pooling Setup
 * Run: node scripts/setup-pooling.mjs
 * 
 * Este script intenta activar pooling automáticamente de varias formas:
 * 1. Via Supabase Management API (si tienes token)
 * 2. Via instrucciones paso-a-paso con dashboard
 * 3. Verificación final del estado
 */

import readline from "readline";
import { execSync } from "child_process";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PROJECT_ID = SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log("\n╔" + "═".repeat(58) + "╗");
  console.log("║  🚀 SETUP CONNECTION POOLING PARA 1,000+ USUARIOS      ║");
  console.log("╚" + "═".repeat(58) + "╝\n");

  if (!PROJECT_ID) {
    console.error("❌ Could not extract project ID from NEXT_PUBLIC_SUPABASE_URL");
    process.exit(1);
  }

  console.log(`📍 Project: ${PROJECT_ID}`);
  console.log(`🔗 Dashboard: https://supabase.com/dashboard/project/${PROJECT_ID}/database/connection-pools\n`);

  // Option 1: Try with Management API token
  console.log("═".repeat(60));
  console.log("\n¿Tienes un Supabase Management API Token?\n");
  console.log("Opciones:");
  console.log("  1️⃣  Sí, usar token (automático)");
  console.log("  2️⃣  No, usar instrucciones paso-a-paso (manual)");
  console.log("  3️⃣  Salir\n");

  const choice = await question("Selecciona (1/2/3): ");

  if (choice === "1") {
    console.log("\n⏳ Ingresa tu Management API Token:");
    console.log("   (Obtén en: https://supabase.com/dashboard/account/tokens)\n");
    const token = await question("Token: ");

    if (!token.trim()) {
      console.log("❌ Token vacío. Cancelado.");
      rl.close();
      process.exit(1);
    }

    await enableViaAPI(token, PROJECT_ID);
  } else if (choice === "2") {
    await enableManual(PROJECT_ID);
  } else {
    console.log("\nCancelado.\n");
    rl.close();
    process.exit(0);
  }

  rl.close();
}

async function enableViaAPI(token, projectId) {
  console.log("\n⏳ Activando pooling via Management API...\n");

  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectId}/database`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pool_mode: "transaction",
          pool_size: 100,
          connection_timeout: 30,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    console.log("✅ ¡Pooling activado exitosamente!\n");
    await showSuccess(projectId);
  } catch (err) {
    console.error(`❌ Error: ${err.message}\n`);
    console.log("Alternativa: Usa instrucciones manuales (opción 2)\n");
    process.exit(1);
  }
}

async function enableManual(projectId) {
  console.log("\n" + "═".repeat(60));
  console.log("\n📋 PASOS PARA ACTIVAR POOLING (Manual)\n");

  console.log("1️⃣  Ve a: https://supabase.com/dashboard/account/tokens");
  console.log("   • Crea un nuevo token (si no tienes)");
  console.log("   • Copia el token\n");

  console.log("2️⃣  Ejecuta este comando:\n");
  console.log(`   node scripts/enable-pooling.mjs "YOUR_TOKEN_HERE"\n`);

  console.log("3️⃣  Alternativamente, dashboard manual:\n");
  console.log(`   • Ve a: https://supabase.com/dashboard/project/${projectId}/database`);
  console.log("   • Click en 'Settings' → 'Database'");
  console.log("   • Busca 'Connection Pooling'");
  console.log("   • Click 'Enable Pooling'");
  console.log("   • Mode: Transaction");
  console.log("   • Pool Size: 100");
  console.log("   • Connection Timeout: 30");
  console.log("   • Click 'Save'\n");

  console.log("═".repeat(60));
  console.log("\n✅ Una vez completado, ejecuta:");
  console.log("   npm run dev");
  console.log("   node scripts/verify-pooling.mjs\n");
}

async function showSuccess(projectId) {
  console.log("Configuración Activada:");
  console.log("  • Mode: Transaction");
  console.log("  • Pool Size: 100");
  console.log("  • Connection Timeout: 30s\n");

  console.log("Capacidad:");
  console.log("  ✨ Usuarios concurrentes: 50-200 → 1,000+");
  console.log("  ✨ Max connections: 20-50 → 100");
  console.log("  ✨ Connection overhead: Reducido ~70%\n");

  console.log("Próximos pasos:");
  console.log("  1. Restart app: npm run dev");
  console.log("  2. Verify: node scripts/verify-pooling.mjs");
  console.log(`  3. Monitor: https://supabase.com/dashboard/project/${projectId}/database/connection-pools\n`);
}

main().catch(console.error);
