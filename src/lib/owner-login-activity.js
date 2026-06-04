const MS_DAY = 24 * 60 * 60 * 1000;

function toText(value) {
  return String(value ?? "").trim();
}

function roleFromUser(user) {
  return String(
    user?.app_metadata?.role || user?.user_metadata?.role || "contractor",
  ).toLowerCase();
}

function isProbeAccount(user) {
  const email = toText(user?.email).toLowerCase();
  return email.includes("mailinator.com") || email.endsWith("@fieldbase.local");
}

function loginBucket(lastLoginAt, now) {
  if (!lastLoginAt) return "never";
  const ageMs = now - new Date(lastLoginAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return "never";
  if (ageMs <= MS_DAY) return "today";
  if (ageMs <= 7 * MS_DAY) return "week";
  if (ageMs <= 30 * MS_DAY) return "month";
  return "older";
}

function bucketLabel(bucket) {
  if (bucket === "today") return "Today";
  if (bucket === "week") return "This week";
  if (bucket === "month") return "This month";
  if (bucket === "older") return "Older";
  return "Never";
}

/**
 * Summarize contractor login activity from Supabase auth user rows.
 * Pure — safe for unit tests without Supabase.
 */
export function summarizeOwnerLoginActivity(users = [], { now = Date.now() } = {}) {
  const all = Array.isArray(users) ? users : [];
  const contractors = all.filter((user) => roleFromUser(user) === "contractor");
  const realContractors = contractors.filter((user) => !isProbeAccount(user));
  const probes = contractors.filter((user) => isProbeAccount(user));

  const withLogin = realContractors.filter((user) => user.last_sign_in_at);
  const countSince = (days) =>
    withLogin.filter(
      (user) => now - new Date(user.last_sign_in_at).getTime() <= days * MS_DAY,
    ).length;

  const rows = realContractors
    .map((user) => {
      const lastLoginAt = user.last_sign_in_at || null;
      const bucket = loginBucket(lastLoginAt, now);
      return {
        id: user.id,
        email: toText(user.email),
        name: toText(user.user_metadata?.name),
        companyName: toText(user.user_metadata?.companyName),
        tenantId: toText(
          user.app_metadata?.tenant_id ||
            user.user_metadata?.tenant_id ||
            user.id,
        ),
        status: toText(user.user_metadata?.status || "unknown"),
        createdAt: user.created_at || null,
        lastLoginAt,
        activityBucket: bucket,
        activityLabel: bucketLabel(bucket),
        isProbe: false,
      };
    })
    .sort((a, b) => {
      const aTime = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
      const bTime = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
      return bTime - aTime;
    });

  return {
    generatedAt: new Date(now).toISOString(),
    summary: {
      totalAuthUsers: all.length,
      contractorAccounts: realContractors.length,
      probeAccounts: probes.length,
      everLoggedIn: withLogin.length,
      loggedInLast24h: countSince(1),
      loggedInLast7d: countSince(7),
      mau30d: countSince(30),
      neverLoggedIn: realContractors.length - withLogin.length,
    },
    rows,
    probes: probes.map((user) => ({
      id: user.id,
      email: toText(user.email),
      createdAt: user.created_at || null,
      lastLoginAt: user.last_sign_in_at || null,
    })),
  };
}
