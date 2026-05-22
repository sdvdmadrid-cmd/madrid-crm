import "server-only";

import { assertProductionReadiness } from "@/lib/production-config";
import { validateProductionConfig } from "@/lib/production-config-validation";

let startupValidationRan = false;

/**
 * Runs production env validation once per Node process (dev server, Vercel, etc.).
 */
export function runStartupValidation() {
  if (startupValidationRan) {
    return;
  }
  startupValidationRan = true;

  if (process.env.NODE_ENV !== "production") {
    return;
  }

  try {
    validateProductionConfig();
    assertProductionReadiness();
    console.info("[startup] Production configuration validated.");
  } catch (error) {
    console.error(
      "[startup] Production configuration invalid:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}
