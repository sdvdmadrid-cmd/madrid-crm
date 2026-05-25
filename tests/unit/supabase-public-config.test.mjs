import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeSupabaseJwtRef,
  getSupabaseProjectRefFromUrl,
  getSupabasePublicConfig,
  getSupabasePublicKeyEnv,
} from "../../src/lib/supabase-public-config.js";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

test.afterEach(() => {
  restoreEnv();
});

test("prefers NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", () => {
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";

  assert.deepEqual(getSupabasePublicKeyEnv(), {
    key: "publishable",
    envName: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    usingLegacyAnonKey: false,
  });
});

test("supports NEXT_PUBLIC_SUPABASE_ANON_KEY as legacy fallback", () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";

  assert.deepEqual(getSupabasePublicKeyEnv(), {
    key: "anon",
    envName: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    usingLegacyAnonKey: true,
  });
});

test("returns Supabase config with legacy fallback marker", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc123.supabase.co";
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";

  assert.deepEqual(getSupabasePublicConfig(), {
    supabaseUrl: "https://abc123.supabase.co",
    supabasePublishableKey: "anon",
    supabasePublicKeyEnv: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    usingLegacySupabaseAnonKey: true,
  });
});

test("extracts Supabase project ref from URL and JWT", () => {
  const payload = Buffer.from(JSON.stringify({ ref: "abc123" })).toString("base64url");
  const token = `header.${payload}.signature`;

  assert.equal(getSupabaseProjectRefFromUrl("https://abc123.supabase.co"), "abc123");
  assert.equal(decodeSupabaseJwtRef(token), "abc123");
});
