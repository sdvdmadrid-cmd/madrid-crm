import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

function omitKeys(row, keys) {
  const next = { ...row };
  for (const key of keys) {
    delete next[key];
  }
  return next;
}

function isMissingColumnError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("column") ||
    message.includes("does not exist")
  );
}

/**
 * Insert a website lead with progressive fallbacks when production DB lags migrations.
 */
export async function insertWebsiteLeadRow(baseRow) {
  const insertWithSelect = async (row) =>
    supabaseAdmin.from("contractor_website_leads").insert(row).select("id").maybeSingle();

  const tiers = [
    baseRow,
    omitKeys(baseRow, [
      "budget_range",
      "timeline",
      "contact_preference",
      "submission_id",
      "photo_url",
      "metadata",
    ]),
    omitKeys(baseRow, [
      "budget_range",
      "timeline",
      "contact_preference",
      "submission_id",
      "photo_url",
      "photo_data_url",
      "metadata",
      "address_line_1",
      "city",
      "state",
      "zip_code",
    ]),
    {
      tenant_id: baseRow.tenant_id,
      slug: baseRow.slug,
      name: baseRow.name,
      email: baseRow.email,
      phone: baseRow.phone,
      service_needed: baseRow.service_needed,
      description: baseRow.description,
      status: "new",
      created_at: baseRow.created_at,
      updated_at: baseRow.updated_at,
    },
    {
      tenant_id: baseRow.tenant_id,
      slug: baseRow.slug,
      name: baseRow.name,
      email: baseRow.email,
      phone: baseRow.phone,
      description: [
        baseRow.description,
        baseRow.service_needed ? `Service: ${baseRow.service_needed}` : "",
        baseRow.address_line_1
          ? `Address: ${[baseRow.address_line_1, baseRow.city, baseRow.state, baseRow.zip_code]
              .filter(Boolean)
              .join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      status: "new",
      created_at: baseRow.created_at,
      updated_at: baseRow.updated_at,
    },
  ];

  let lastError = null;
  for (const row of tiers) {
    const result = await insertWithSelect(row);
    if (!result.error && result.data?.id) {
      return { data: result.data, error: null, tier: tiers.indexOf(row) };
    }
    lastError = result.error;
    if (lastError?.code === "42P01") {
      return { data: null, error: lastError, tier: -1 };
    }
    if (!isMissingColumnError(lastError)) {
      break;
    }
  }

  return { data: null, error: lastError, tier: -1 };
}
