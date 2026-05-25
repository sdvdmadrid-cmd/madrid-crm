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

const { handleResetPassword } = await import(
  "../../src/app/api/auth/reset-password/route.js"
);

const STRONG_PASSWORD = "ResetPass123!";

function resetRequest(body) {
  return new Request("https://app.test/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeps({ verifyResult, getUserResult, updateResult } = {}) {
  const calls = {
    verifyOtp: [],
    getUser: [],
    authUpdateUser: [],
    adminUpdateUserById: [],
  };

  return {
    calls,
    deps: {
      createAuthClient: () => ({
        auth: {
          verifyOtp: async (payload) => {
            calls.verifyOtp.push(payload);
            return (
              verifyResult || {
                data: { user: { id: "user_from_token" } },
                error: null,
              }
            );
          },
          getUser: async (accessToken) => {
            calls.getUser.push(accessToken);
            return (
              getUserResult || {
                data: { user: { id: "user_from_access_token" } },
                error: null,
              }
            );
          },
          updateUser: async (payload) => {
            calls.authUpdateUser.push(payload);
            return { error: null };
          },
        },
      }),
      supabaseAdmin: {
        auth: {
          admin: {
            updateUserById: async (userId, payload) => {
              calls.adminUpdateUserById.push({ userId, payload });
              return updateResult || { error: null };
            },
          },
        },
      },
    },
  };
}

test("reset password token path updates verified user via admin API", async () => {
  const { calls, deps } = makeDeps();
  const response = await handleResetPassword(
    resetRequest({ token: "token_hash", newPassword: STRONG_PASSWORD }),
    deps,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.deepEqual(calls.verifyOtp, [
    { token_hash: "token_hash", type: "recovery" },
  ]);
  assert.equal(calls.authUpdateUser.length, 0);
  assert.deepEqual(calls.adminUpdateUserById, [
    {
      userId: "user_from_token",
      payload: { password: STRONG_PASSWORD },
    },
  ]);
});

test("reset password rejects expired token without updating password", async () => {
  const { calls, deps } = makeDeps({
    verifyResult: {
      data: { user: null },
      error: new Error("expired token"),
    },
  });

  const response = await handleResetPassword(
    resetRequest({ token: "expired", newPassword: STRONG_PASSWORD }),
    deps,
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.error, "Invalid or expired reset token");
  assert.equal(calls.adminUpdateUserById.length, 0);
});

test("reset password access token path updates the session user via admin API", async () => {
  const { calls, deps } = makeDeps();
  const response = await handleResetPassword(
    resetRequest({ accessToken: "access_token", newPassword: STRONG_PASSWORD }),
    deps,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.deepEqual(calls.getUser, ["access_token"]);
  assert.deepEqual(calls.adminUpdateUserById, [
    {
      userId: "user_from_access_token",
      payload: { password: STRONG_PASSWORD },
    },
  ]);
});

test("reset password enforces password strength before token verification", async () => {
  const { calls, deps } = makeDeps();
  const response = await handleResetPassword(
    resetRequest({ token: "token_hash", newPassword: "weak" }),
    deps,
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(calls.verifyOtp.length, 0);
  assert.equal(calls.adminUpdateUserById.length, 0);
});
