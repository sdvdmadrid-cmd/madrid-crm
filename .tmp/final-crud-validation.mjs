import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const rawEnv = fs.readFileSync(envPath, "utf8");
for (const line of rawEnv.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const index = trimmed.indexOf("=");
  if (index === -1) continue;
  const key = trimmed.slice(0, index).trim();
  const value = trimmed.slice(index + 1);
  if (!(key in process.env)) process.env[key] = value;
}

const sessionSecret = process.env.SESSION_SECRET;
const issuer = process.env.SESSION_JWT_ISSUER || "madrid-app";
const audience = process.env.SESSION_JWT_AUDIENCE || "madrid-app-users";
const ttlSeconds = Number(process.env.SESSION_TTL_SECONDS || 604800);
const baseUrl = "https://localhost:3000";

if (!sessionSecret) {
  throw new Error("Missing session configuration in .env.local");
}
function createSession() {
  const userId = "11111111-1111-1111-1111-111111111111";
  const payload = {
    userId,
    tenantId: userId,
    tenantDbId: userId,
    email: "checkpoint-admin@contractorflow.local",
    name: "Checkpoint Admin",
    role: "admin",
    businessType: "",
    industry: "",
    isSubscribed: true,
    trialEndDate: null,
    supabaseAccessToken: null,
    supabaseRefreshToken: null,
  };

  return jwt.sign(payload, sessionSecret, {
    algorithm: "HS256",
    expiresIn: ttlSeconds,
    issuer,
    audience,
  });
}

async function api(method, pathname, token, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    text,
    json,
  };
}

const results = [];
function record(module, action, response, extra = {}) {
  results.push({
    module,
    action,
    success: Boolean(response?.ok),
    status: response?.status ?? 0,
    body: response?.text ?? "",
    ...extra,
  });
}

const token = createSession();

const authRead = await api("GET", "/api/auth/me", token);
record("Auth", "READ", authRead);

const suffix = Date.now();

const clientCreate = await api("POST", "/api/clients", token, {
  name: `Checkpoint Client ${suffix}`,
  email: `checkpoint+${suffix}@example.com`,
  phone: "555-0101",
  company: "Checkpoint Co",
  address: "123 Audit St",
  notes: "final validation",
});
record("Clients", "CREATE", clientCreate);
const clientId = clientCreate.json?.data?._id;
const clientRead = clientId ? await api("GET", `/api/clients/${clientId}`, token) : null;
record("Clients", "READ", clientRead || { ok: false, status: 0, text: "skipped" });
const clientUpdate = clientId
  ? await api("PATCH", `/api/clients/${clientId}`, token, { notes: "updated final validation", leadStatus: "contacted" })
  : null;
record("Clients", "UPDATE", clientUpdate || { ok: false, status: 0, text: "skipped" });

const jobCreate = await api("POST", "/api/jobs", token, {
  title: `Checkpoint Job ${suffix}`,
  description: "validation job",
  clientId: clientId || "",
  clientName: `Checkpoint Client ${suffix}`,
  service: "audit",
  status: "Pending",
  price: "1250",
  dueDate: "2026-04-30",
  taxState: "TX",
  downPaymentPercent: "10",
  scopeDetails: "final validation job",
  squareMeters: "10",
  complexity: "standard",
  materialsIncluded: true,
  travelMinutes: "15",
  urgency: "flexible",
});
record("Jobs", "CREATE", jobCreate);
const jobId = jobCreate.json?.data?.id;
const jobRead = jobId ? await api("GET", `/api/jobs/${jobId}`, token) : null;
record("Jobs", "READ", jobRead || { ok: false, status: 0, text: "skipped" });
const jobUpdate = jobId
  ? await api("PATCH", `/api/jobs/${jobId}`, token, { status: "Scheduled", scopeDetails: "updated validation scope" })
  : null;
record("Jobs", "UPDATE", jobUpdate || { ok: false, status: 0, text: "skipped" });

const estimateCreate = await api("POST", "/api/estimate-builder", token, {
  name: `Checkpoint Estimate ${suffix}`,
  notes: "validation estimate",
  description: "estimate validation",
  lines: [{ name: "Line 1", qty: 1, price: 100, total: 100 }],
  total_low: 100,
  total_high: 200,
  total_mid: 150,
  total_final: 150,
  client_id: clientId || "",
  quote_id: null,
});
record("Estimates", "CREATE", estimateCreate);
const estimateId = estimateCreate.json?.data?.id;
const estimateList = await api("GET", "/api/estimate-builder", token);
if (estimateId && estimateList.ok) {
  const found = Array.isArray(estimateList.json) && estimateList.json.some((row) => row.id === estimateId);
  if (!found) estimateList.ok = false;
}
record("Estimates", "READ", estimateList);
const estimateUpdate = estimateId
  ? await api("PATCH", `/api/estimate-builder/${estimateId}`, token, { notes: "updated estimate note", total_final: 175 })
  : null;
record("Estimates", "UPDATE", estimateUpdate || { ok: false, status: 0, text: "skipped" });

const invoiceCreate = await api("POST", "/api/invoices", token, {
  invoiceTitle: `Checkpoint Invoice ${suffix}`,
  jobId: jobId || "",
  clientId: clientId || "",
  clientName: `Checkpoint Client ${suffix}`,
  clientEmail: `checkpoint+${suffix}@example.com`,
  amount: "150",
  dueDate: "2026-05-05",
  notes: "validation invoice",
  preferredPaymentMethod: "card",
  payments: [],
});
record("Invoices", "CREATE", invoiceCreate);
const invoiceId = invoiceCreate.json?.data?.id;
const invoiceRead = invoiceId ? await api("GET", `/api/invoices/${invoiceId}`, token) : null;
record("Invoices", "READ", invoiceRead || { ok: false, status: 0, text: "skipped" });
const invoiceUpdate = invoiceId
  ? await api("PATCH", `/api/invoices/${invoiceId}`, token, {
      notes: "updated invoice note",
      payments: [{ amount: 50, method: "cash", paidAt: "2026-04-16T12:00:00.000Z" }],
    })
  : null;
record("Invoices", "UPDATE", invoiceUpdate || { ok: false, status: 0, text: "skipped" });

const appointmentCreate = await api("POST", "/api/appointments", token, {
  title: `Checkpoint Appointment ${suffix}`,
  clientName: `Checkpoint Client ${suffix}`,
  date: "2026-04-20",
  time: "10:00",
  status: "Scheduled",
});
record("Appointments", "CREATE", appointmentCreate);
const appointmentId = appointmentCreate.json?.data?._id;
const appointmentRead = appointmentId ? await api("GET", `/api/appointments/${appointmentId}`, token) : null;
record("Appointments", "READ", appointmentRead || { ok: false, status: 0, text: "skipped" });
const appointmentUpdate = appointmentId
  ? await api("PATCH", `/api/appointments/${appointmentId}`, token, {
      title: `Checkpoint Appointment ${suffix} Updated`,
      clientName: `Checkpoint Client ${suffix}`,
      date: "2026-04-21",
      time: "11:30",
      status: "Confirmed",
    })
  : null;
record("Appointments", "UPDATE", appointmentUpdate || { ok: false, status: 0, text: "skipped" });

const appointmentDelete = appointmentId ? await api("DELETE", `/api/appointments/${appointmentId}`, token) : null;
record("Appointments", "DELETE", appointmentDelete || { ok: false, status: 0, text: "skipped" });
const invoiceDelete = invoiceId ? await api("DELETE", `/api/invoices/${invoiceId}`, token) : null;
record("Invoices", "DELETE", invoiceDelete || { ok: false, status: 0, text: "skipped" });
const estimateDelete = estimateId ? await api("DELETE", `/api/estimate-builder/${estimateId}`, token) : null;
record("Estimates", "DELETE", estimateDelete || { ok: false, status: 0, text: "skipped" });
const jobDelete = jobId ? await api("DELETE", `/api/jobs/${jobId}`, token) : null;
record("Jobs", "DELETE", jobDelete || { ok: false, status: 0, text: "skipped" });
const clientDelete = clientId ? await api("DELETE", `/api/clients/${clientId}`, token) : null;
record("Clients", "DELETE", clientDelete || { ok: false, status: 0, text: "skipped" });

const outPath = path.join(root, ".tmp", "final-crud-results.json");
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
console.log(outPath);
