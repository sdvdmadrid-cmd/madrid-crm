import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  checkWebsiteLeadRateLimit,
  getRequestIp,
  recordWebsiteLeadAttempt,
} from "@/lib/rate-limit";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_FORM_FILL_MS = 1200;
const MAX_PHOTO_DATA_URL_CHARS = 1_000_000; // 1MB limit (reduced from 4.5MB for security)

function toText(value, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

async function findExistingClient(tenantId, email, phone) {
  if (email) {
    const { data } = await supabaseAdmin
      .from("clients")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (phone) {
    const { data } = await supabaseAdmin
      .from("clients")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

export async function POST(request, { params }) {
  const { slug } = await params;
  const ip = getRequestIp(request);

  const limitState = await checkWebsiteLeadRateLimit({ slug, ip });
  if (!limitState.allowed) {
    return Response.json(
      {
        error: "Too many submissions. Please try again later.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(limitState.retryAfterSeconds || 60),
        },
      },
    );
  }

  // Find the website
  const { data: website } = await supabaseAdmin
    .from("contractor_websites")
    .select("tenant_id")
    .eq("slug", slug)
    .maybeSingle();

  if (!website) {
    return Response.json({ error: "Website not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    await recordWebsiteLeadAttempt({ slug, ip });
    const nowIso = new Date().toISOString();
    const {
      name,
      email,
      phone,
      address,
      addressLine1,
      city,
      state,
      zipCode,
      serviceNeeded,
      description,
      photoDataUrl,
      website: honeypotWebsite,
      formStartedAt,
    } = body;

    const honeypotValue = toText(honeypotWebsite, 200);
    const startedAtMs = Number(formStartedAt || 0);
    const elapsedMs = Date.now() - startedAtMs;

    // Silent success for obvious bot payloads to avoid helping attackers tune their scripts.
    if (honeypotValue) {
      return Response.json({ success: true }, { status: 200 });
    }

    if (!Number.isFinite(startedAtMs) || elapsedMs < MIN_FORM_FILL_MS) {
      return Response.json(
        { error: "Invalid submission" },
        { status: 400 },
      );
    }

    const cleanName = toText(name, 200);
    const cleanEmail = toText(email, 200);
    const cleanPhone = toText(phone, 20);
    const cleanAddressLine1 = toText(addressLine1 || address, 300);
    const cleanCity = toText(city, 120);
    const cleanState = toText(state, 40);
    const cleanZipCode = toText(zipCode, 20);
    const cleanServiceNeeded = toText(serviceNeeded, 160);
    const cleanDescription = toText(description, 2000);
    const cleanPhotoDataUrl = toText(photoDataUrl, MAX_PHOTO_DATA_URL_CHARS);
    const fullAddress = [
      cleanAddressLine1,
      [cleanCity, cleanState, cleanZipCode].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(", ");

    // Validate
    if (!cleanName || !cleanPhone || !cleanAddressLine1 || !cleanServiceNeeded || !cleanDescription) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (cleanEmail && !EMAIL_REGEX.test(cleanEmail)) {
      return Response.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }

    // Save as a quote lead (we'll store in existing quotes table or create a leads table)
    // For now, we'll insert into a simple leads table structure
    const leadInsertBase = {
      tenant_id: website.tenant_id,
      slug,
      name: cleanName,
      email: cleanEmail || `${slug}+${Date.now()}@no-email.local`,
      phone: cleanPhone,
      address_line_1: cleanAddressLine1,
      city: cleanCity,
      state: cleanState,
      zip_code: cleanZipCode,
      service_needed: cleanServiceNeeded,
      photo_data_url: cleanPhotoDataUrl || null,
      description: cleanDescription,
      created_at: nowIso,
    };

    let leadInsertError = null;
    {
      const { error } = await supabaseAdmin
        .from("contractor_website_leads")
        .insert(leadInsertBase);
      leadInsertError = error;
    }

    if (leadInsertError && String(leadInsertError.code || "") === "42703") {
      // Backward compatibility for DBs that do not yet have service/photo columns.
      const { service_needed, photo_data_url, ...fallbackPayload } = leadInsertBase;
      const { error } = await supabaseAdmin
        .from("contractor_website_leads")
        .insert(fallbackPayload);
      leadInsertError = error;
    }

    if (leadInsertError?.code === "42P01") {
      // Table doesn't exist, insert without it (just return success)
      // In production, create the migration first
      console.warn("contractor_website_leads table missing — lead not saved to DB");
    } else if (leadInsertError) {
      throw leadInsertError;
    }

    // Also sync into internal CRM flow: clients + estimate_requests
    let client = await findExistingClient(website.tenant_id, cleanEmail, cleanPhone);

    if (client?.id) {
      await supabaseAdmin
        .from("clients")
        .update({
          name: cleanName || client.name,
          email: cleanEmail || null,
          phone: cleanPhone,
          address: fullAddress,
          notes: `Website lead (${slug})\n${cleanDescription}`,
          lead_status: "new_lead",
          estimate_sent: false,
          updated_at: nowIso,
        })
        .eq("id", client.id)
        .eq("tenant_id", website.tenant_id);
    } else {
      const { data: insertedClient } = await supabaseAdmin
        .from("clients")
        .insert({
          tenant_id: website.tenant_id,
          user_id: null,
          created_by: null,
          name: cleanName,
          email: cleanEmail || null,
          phone: cleanPhone,
          address: fullAddress,
          notes: `Website lead (${slug})\nService needed: ${cleanServiceNeeded}\n${cleanDescription}`,
          lead_status: "new_lead",
          estimate_sent: false,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("id, name")
        .maybeSingle();

      client = insertedClient || client;
    }

    // Create internal estimate request queue entry for backoffice follow-up
    const { error: estimateRequestError } = await supabaseAdmin
      .from("estimate_requests")
      .insert({
        tenant_id: website.tenant_id,
        user_id: null,
        request_type: "new_estimate",
        item: "website_quote_request",
        message: [
          `Service needed: ${cleanServiceNeeded}`,
          cleanDescription,
          `Address: ${fullAddress}`,
          cleanPhotoDataUrl ? "Photo attached in website lead submission." : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        client_name: cleanName,
        job_title: "Website Lead",
        contact_name: cleanName,
        contact_email: cleanEmail || null,
        contact_phone: cleanPhone,
        status: "new",
        created_at: nowIso,
        updated_at: nowIso,
      });

    if (estimateRequestError) {
      console.error("estimate_requests insert failed:", estimateRequestError);
    }

    const { error: notificationError } = await supabaseAdmin
      .from("notifications")
      .insert({
        tenant_id: website.tenant_id,
        user_id: null,
        created_by: null,
        type: "website_request_service",
        title: "New Request Service lead",
        message: `${cleanName} requested ${cleanServiceNeeded}.`,
        metadata: {
          source: "website",
          slug,
          serviceNeeded: cleanServiceNeeded,
          phone: cleanPhone,
        },
        read: false,
        created_at: nowIso,
        updated_at: nowIso,
      });

    if (notificationError) {
      console.error("notifications insert failed:", notificationError);
    }

    // TODO: Send email notification to contractor

    return Response.json(
      {
        success: true,
        message: "Quote request submitted. We'll contact you soon!",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Contact form error:", err);
    const detail =
      process.env.NODE_ENV === "production"
        ? undefined
        : String(err?.message || err?.code || "unknown_error");
    return Response.json(
      { error: "Failed to submit. Please try again.", detail },
      { status: 500 }
    );
  }
}
