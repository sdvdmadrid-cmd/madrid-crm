import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        url: "data:text/javascript,export default {};",
        shortCircuit: true,
      };
    }

    if (specifier.startsWith("@/")) {
      const target = resolve(workspaceRoot, "src", specifier.slice(2));
      const candidates = [target, `${target}.js`, `${target}.jsx`];
      const match = candidates.find((candidate) => existsSync(candidate));
      if (match) {
        return {
          url: pathToFileURL(match).href,
          shortCircuit: true,
        };
      }
    }

    return nextResolve(specifier, context);
  },
});

const { handleForgotPassword, isResendUsable } = await import(
  "../../src/app/api/auth/forgot-password/route.js"
);

function forgotPasswordRequest(email = "owner@example.com") {
  return new Request("https://app.test/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

function makeDeps(overrides = {}) {
  const calls = {
    rateLimit: 0,
    recordAttempt: 0,
    recoveryLink: 0,
    resendEmail: 0,
    supabaseEmail: 0,
    logs: [],
  };

  const deps = {
    env: {
      APP_URL: "https://app.test",
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "rk_test",
      EMAIL_FROM: "FieldBase <no-reply@fieldbaseapp.net>",
      NODE_ENV: "production",
    },
    getRequestIp: () => "203.0.113.10",
    getRequestOrigin: () => "https://app.test",
    isTestEmailDomain: () => false,
    checkPasswordResetRateLimit: async () => {
      calls.rateLimit += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
    recordPasswordResetAttempt: async () => {
      calls.recordAttempt += 1;
    },
    generatePasswordRecoveryLink: async () => {
      calls.recoveryLink += 1;
      return {
        resetUrl: "https://app.test/reset-password?token=token_hash",
        user: {
          id: "user_123",
          app_metadata: { tenant_id: "tenant-a" },
        },
      };
    },
    sendEmail: async () => {
      calls.resendEmail += 1;
      return {
        success: true,
        provider: "resend",
        providerMessageId: "email_123",
      };
    },
    sendPasswordRecoveryEmailViaSupabase: async () => {
      calls.supabaseEmail += 1;
      return { success: true, redirectTo: "https://app.test/reset-password" };
    },
    logEmailAttempt: async (entry) => {
      calls.logs.push(entry);
    },
    ...overrides,
  };

  return { calls, deps };
}

test("isResendUsable requires explicit resend config", () => {
  assert.equal(
    isResendUsable(
      {
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "rk_test",
        EMAIL_FROM: "FieldBase <no-reply@fieldbaseapp.net>",
        NODE_ENV: "production",
      },
      () => false,
    ),
    true,
  );
  assert.equal(isResendUsable({ RESEND_API_KEY: "rk_test" }, () => false), false);
  assert.equal(
    isResendUsable(
      {
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "rk_test",
        EMAIL_FROM: "FieldBase <onboarding@resend.dev>",
        NODE_ENV: "production",
      },
      () => true,
    ),
    false,
  );
});

test("forgot password returns generic success when Resend sends email", async () => {
  const { calls, deps } = makeDeps();
  const response = await handleForgotPassword(forgotPasswordRequest(), deps);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(calls.recoveryLink, 1);
  assert.equal(calls.resendEmail, 1);
  assert.equal(calls.supabaseEmail, 0);
  assert.equal(calls.logs.length, 1);
  assert.equal(calls.logs[0].tenantId, "tenant-a");
  assert.equal(calls.logs[0].eventType, "password_reset");
  assert.equal(calls.logs[0].success, true);
});

test("forgot password falls back to Supabase email when Resend fails", async () => {
  const { calls, deps } = makeDeps({
    sendEmail: async () => {
      calls.resendEmail += 1;
      return { success: false, provider: "resend", error: "domain not verified" };
    },
  });

  const response = await handleForgotPassword(forgotPasswordRequest(), deps);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(calls.resendEmail, 1);
  assert.equal(calls.supabaseEmail, 1);
  assert.equal(calls.logs.length, 2);
  assert.equal(calls.logs[0].success, false);
  assert.equal(calls.logs[1].provider, "supabase");
  assert.equal(calls.logs[1].success, true);
});

test("forgot password reports delivery failure when all providers fail", async () => {
  const { calls, deps } = makeDeps({
    sendEmail: async () => {
      calls.resendEmail += 1;
      return { success: false, provider: "resend", error: "domain not verified" };
    },
    sendPasswordRecoveryEmailViaSupabase: async () => {
      calls.supabaseEmail += 1;
      throw new Error("Supabase SMTP disabled");
    },
  });

  const response = await handleForgotPassword(forgotPasswordRequest(), deps);
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.success, false);
  assert.equal(payload.code, "EMAIL_DELIVERY_FAILED");
  assert.equal(calls.resendEmail, 1);
  assert.equal(calls.supabaseEmail, 1);
  assert.equal(calls.logs.length, 2);
  assert.equal(calls.logs[1].provider, "supabase");
  assert.equal(calls.logs[1].success, false);
});

test("forgot password keeps invalid emails generic without delivery attempts", async () => {
  const { calls, deps } = makeDeps();
  const response = await handleForgotPassword(forgotPasswordRequest("not-an-email"), deps);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(calls.rateLimit, 0);
  assert.equal(calls.recordAttempt, 0);
  assert.equal(calls.recoveryLink, 0);
  assert.equal(calls.resendEmail, 0);
  assert.equal(calls.supabaseEmail, 0);
});
