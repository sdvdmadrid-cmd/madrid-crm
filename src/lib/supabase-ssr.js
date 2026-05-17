import { createBrowserClient, createServerClient } from "@supabase/ssr";

const authDebugEnabled = process.env.NEXT_PUBLIC_AUTH_DEBUG === "1";

function getSupabasePublicConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }
  return { supabaseUrl, supabasePublishableKey };
}

let browserClientInstance = null;

function clearLegacyPersistedSupabaseSession() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const storages = [window.localStorage, window.sessionStorage].filter(Boolean);
    for (const storage of storages) {
      const keysToRemove = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key) continue;
        if (key.startsWith("sb-") && key.includes("-auth-token")) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage access failures in hardened browser contexts.
  }
}

function maskToken(value) {
  const raw = String(value || "");
  if (!raw) return null;
  if (raw.length <= 12) return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
  return `${raw.slice(0, 6)}...${raw.slice(-6)}`;
}

function cookieNamesFromList(list) {
  return (list || []).map((item) => item?.name).filter(Boolean);
}

export function createSupabaseBrowserAuthClient() {
  if (!browserClientInstance) {
    clearLegacyPersistedSupabaseSession();
    const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();

    browserClientInstance = createBrowserClient(
      supabaseUrl,
      supabasePublishableKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    );

    if (authDebugEnabled) {
      console.info("[supabase:browser] init", {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        supabaseUrl,
        publishableKeyHint: maskToken(supabasePublishableKey),
      });
    }
  }

  return browserClientInstance;
}

export function createSupabaseRouteHandlerClient(cookieStore, onSetCookies) {
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();
  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        const all = cookieStore.getAll();
        if (authDebugEnabled) {
          console.info("[supabase:route] cookies.getAll", {
            cookieNames: cookieNamesFromList(all),
          });
        }
        return all;
      },
      setAll(cookiesToSet) {
        if (typeof onSetCookies === "function") {
          onSetCookies(cookiesToSet);
        }

        if (authDebugEnabled) {
          console.info("[supabase:route] cookies.setAll", {
            cookieNames: cookieNamesFromList(cookiesToSet),
          });
        }

        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}

export function createSupabaseMiddlewareClient(request, response) {
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();
  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        const all = request.cookies.getAll();
        if (authDebugEnabled) {
          console.info("[supabase:middleware] cookies.getAll", {
            pathname: request.nextUrl?.pathname || null,
            cookieNames: cookieNamesFromList(all),
          });
        }
        return all;
      },
      setAll(cookiesToSet) {
        if (authDebugEnabled) {
          console.info("[supabase:middleware] cookies.setAll", {
            pathname: request.nextUrl?.pathname || null,
            cookieNames: cookieNamesFromList(cookiesToSet),
          });
        }
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });
}