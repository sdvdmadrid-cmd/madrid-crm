import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCompanyProfileByTenant } from "@/lib/company-profile-store";
import { logEmailAttempt, normalizeRecipients, sendEmail } from "@/lib/email";
import { INNGEST_EVENTS, isInngestEnabled, sendInngestEvent } from "@/lib/inngest";
import { getPublicWebsiteBySlug } from "@/lib/public-website";
import { sendTextMessage } from "@/lib/sms";
import { sendWebsiteLeadClientConfirmation } from "@/lib/website-lead-confirm";
import {
  checkWebsiteLeadRateLimit,
  getRequestIp,
  recordWebsiteLeadAttempt,
} from "@/lib/rate-limit";
import { isTurnstileConfigured, verifyTurnstileToken } from "@/lib/turnstile";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_FORM_FILL_MS = 1200;
const MAX_PHOTO_DATA_URL_CHARS = 1_000_000; // 1MB limit (reduced from 4.5MB for security)

function toText(value, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

async function resolveContractorNotificationTargets(tenantId) {
  const [{ data: profiles }, companyProfile] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("tenant_id", tenantId)
      .eq("role", "admin")
      .limit(10),
    getCompanyProfileByTenant({ tenantId }).catch(() => null),
  ]);

  const adminProfiles = Array.isArray(profiles) ? profiles : [];
  const users = await Promise.all(
    adminProfiles.map(async (profile) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(profile.id);
      return data?.user || null;
    }),
  );

  return {
    emails: normalizeRecipients(users.map((user) => user?.email || "")),
    phone: String(companyProfile?.phone || "").trim(),
  };
}

async function notifyContractorOfWebsiteLead({
  tenantId,
  leadName,
  leadEmail,
  leadPhone,
  serviceNeeded,
  description,
  slug,
}) {
  const { emails, phone } = await resolveContractorNotificationTargets(tenantId);
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const leadInboxUrl = `${appUrl}/lead-inbox`;
  const emailSubject = `New website lead: ${leadName}`;
  const emailText = [
    `You received a new website lead for ${slug}.`,
    `Name: ${leadName}`,
    `Email: ${leadEmail || "N/A"}`,
    `Phone: ${leadPhone || "N/A"}`,
    `Service: ${serviceNeeded || "N/A"}`,
    `Message: ${description || "N/A"}`,
    `Open lead inbox: ${leadInboxUrl}`,
  ].join("\n\n");
  const emailHtml = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="color:#0f172a;margin-bottom:12px">New website lead</h2>
      <p style="color:#475569">A new lead was submitted from your public website.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:20px 0;color:#0f172a">
        <p><strong>Name:</strong> ${leadName}</p>
        <p><strong>Email:</strong> ${leadEmail || "N/A"}</p>
        <p><strong>Phone:</strong> ${leadPhone || "N/A"}</p>
        <p><strong>Service:</strong> ${serviceNeeded || "N/A"}</p>
        <p><strong>Message:</strong><br/>${description || "N/A"}</p>
      </div>
      <a href="${leadInboxUrl}" style="display:inline-block;background:#0f172a;color:#fff;font-weight:700;padding:12px 18px;border-radius:10px;text-decoration:none">Open Lead Inbox</a>
    </div>`;

  await Promise.all([
    emails.length > 0
      ? Promise.all(
          emails.map(async (recipient) => {
            const result = await sendEmail({
              to: [recipient],
              subject: emailSubject,
              text: emailText,
              html: emailHtml,
              metadata: { tenantId },
            });
            await logEmailAttempt({
              tenantId,
              recipient,
              provider: result?.provider,
              providerMessageId: result?.providerMessageId || null,
              success: result?.success === true,
              error: result?.error || null,
              eventType: "website_lead_notification",
            });
          }),
        )
      : Promise.resolve(),
    phone
      ? sendTextMessage({
          to: phone,
          text: `New website lead: ${leadName}. ${serviceNeeded || "Service request"}. ${leadPhone || leadEmail || "No contact info"}. Check Lead Inbox: ${leadInboxUrl}`,
        }).catch((error) => {
          console.warn("website lead sms notification failed", error?.message || error);
        })
      : Promise.resolve(),
  ]);
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
  const website = await getPublicWebsiteBySlug(slug);

  if (!website) {
    return Response.json({ error: "Website not found" }, { status: 404 });
  }

  try {
    const body = await request.json();

    if (isTurnstileConfigured()) {
      const captcha = await verifyTurnstileToken(body.turnstileToken, ip);
      if (!captcha.ok) {
        return Response.json({ error: captcha.error || "CAPTCHA failed" }, { status: 400 });
      }
    }

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

    // Validate — name, phone, service, and message are required; address is optional
    if (!cleanName || !cleanPhone || !cleanServiceNeeded || !cleanDescription) {
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
      tenant_id: website.tenantId,
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
    let client = await findExistingClient(website.tenantId, cleanEmail, cleanPhone);

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
        .eq("tenant_id", website.tenantId);
    } else {
      const { data: insertedClient } = await supabaseAdmin
        .from("clients")
        .insert({
          tenant_id: website.tenantId,
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
        tenant_id: website.tenantId,
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
        tenant_id: website.tenantId,
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

    const companyProfile = await getCompanyProfileByTenant({ tenantId: website.tenantId }).catch(
      () => null,
    );
    const confirmLocale =
      website.companyProfile?.documentLanguage ||
      companyProfile?.documentLanguage ||
      "en";

    await notifyContractorOfWebsiteLead({
      tenantId: website.tenantId,
      leadName: cleanName,
      leadEmail: cleanEmail,
      leadPhone: cleanPhone,
      serviceNeeded: cleanServiceNeeded,
      description: cleanDescription,
      slug,
    }).catch((error) => {
      console.warn("contractor lead notification failed", error?.message || error);
    });

    if (isInngestEnabled()) {
      const { emails } = await resolveContractorNotificationTargets(website.tenantId);
      await sendInngestEvent(INNGEST_EVENTS.WEBSITE_LEAD, {
        tenantId: website.tenantId,
        slug,
        leadId: `${slug}-${nowIso}`,
        contractorEmails: emails,
        leadData: {
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          message: cleanDescription,
          serviceNeeded: cleanServiceNeeded,
        },
      });
    }

    await sendWebsiteLeadClientConfirmation({
      locale: confirmLocale,
      email: cleanEmail,
      phone: cleanPhone,
      name: cleanName,
      serviceNeeded: cleanServiceNeeded,
      slug,
    });

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
