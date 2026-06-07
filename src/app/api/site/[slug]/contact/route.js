import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCompanyProfileByTenant } from "@/lib/company-profile-store";
import { logEmailAttempt, normalizeRecipients, sendEmail } from "@/lib/email";
import { INNGEST_EVENTS, isInngestEnabled, sendInngestEvent } from "@/lib/inngest";
import { publicWebsiteJson } from "@/lib/api-zone-guard";
import { resolveWebsiteForLeadSubmission } from "@/lib/public-website-lead";
import { sendTextMessage } from "@/lib/sms";
import { sendWebsiteLeadClientConfirmation } from "@/lib/website-lead-confirm";
import {
  checkWebsiteLeadRateLimit,
  getRequestIp,
  recordWebsiteLeadAttempt,
} from "@/lib/rate-limit";
import { isTurnstileConfigured, verifyTurnstileToken } from "@/lib/turnstile";
import { uploadWebsiteImageFromDataUrl } from "@/lib/website-media-storage";
import {
  buildFullAddress,
  isAllowedRequestService,
  normalizeLeadPayload,
  resolveLeadServiceNeeded,
  resolveWebsiteRequestServices,
} from "@/lib/website-lead-form";
import { insertWebsiteLeadRow } from "@/lib/website-lead-persist";
import crypto from "crypto";

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
  budgetRange,
  timeline,
  contactPreference,
  address,
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
    `Budget: ${budgetRange || "N/A"}`,
    `Timeline: ${timeline || "N/A"}`,
    `Preferred contact: ${contactPreference || "N/A"}`,
    `Address: ${address || "N/A"}`,
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
        <p><strong>Budget:</strong> ${budgetRange || "N/A"}</p>
        <p><strong>Timeline:</strong> ${timeline || "N/A"}</p>
        <p><strong>Contact via:</strong> ${contactPreference || "N/A"}</p>
        <p><strong>Address:</strong> ${address || "N/A"}</p>
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

async function runWebsiteLeadSideEffects({
  tenantId,
  canonicalSlug,
  leadId,
  nowIso,
  cleanName,
  cleanEmail,
  cleanPhone,
  cleanServiceNeeded,
  cleanDescription,
  cleanBudgetRange,
  cleanTimeline,
  cleanContactPreference,
  fullAddress,
  confirmLocale,
}) {
  try {
    await notifyContractorOfWebsiteLead({
      tenantId,
      leadName: cleanName,
      leadEmail: cleanEmail,
      leadPhone: cleanPhone,
      serviceNeeded: cleanServiceNeeded,
      description: cleanDescription,
      slug: canonicalSlug,
      budgetRange: cleanBudgetRange,
      timeline: cleanTimeline,
      contactPreference: cleanContactPreference,
      address: fullAddress,
    });

    if (isInngestEnabled()) {
      const { emails } = await resolveContractorNotificationTargets(tenantId);
      await sendInngestEvent(INNGEST_EVENTS.WEBSITE_LEAD, {
        tenantId,
        slug: canonicalSlug,
        leadId: leadId || `${canonicalSlug}-${nowIso}`,
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
      slug: canonicalSlug,
    });
  } catch (error) {
    console.warn("[contact] lead side effects failed", error?.message || error);
  }
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

  const resolved = await resolveWebsiteForLeadSubmission(slug);
  if (!resolved.ok) {
    return publicWebsiteJson(
      {
        success: false,
        error: resolved.message,
        code: resolved.reason,
      },
      { status: resolved.status },
    );
  }

  const website = resolved.website;
  const canonicalSlug = resolved.slug;

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
    const payload = normalizeLeadPayload(body);
    const honeypotValue = payload.website;
    const startedAtMs = Number(payload.formStartedAt || 0);
    const elapsedMs = Date.now() - startedAtMs;

    if (honeypotValue) {
      return Response.json({ success: true }, { status: 200 });
    }

    if (!Number.isFinite(startedAtMs) || elapsedMs < MIN_FORM_FILL_MS) {
      return Response.json({ error: "Invalid submission" }, { status: 400 });
    }

    const cleanName = payload.name;
    const cleanEmail = payload.email;
    const cleanPhone = payload.phone;
    const cleanAddressLine1 = payload.addressLine1;
    const cleanCity = payload.city;
    const cleanState = payload.state;
    const cleanZipCode = payload.zipCode;
    const cleanServiceNeeded = resolveLeadServiceNeeded(
      payload.serviceNeeded,
      payload.serviceOther,
    );
    const cleanDescription = payload.description;
    const cleanBudgetRange = payload.budgetRange;
    const cleanTimeline = payload.timeline;
    const cleanContactPreference = payload.contactPreference || "phone";
    const cleanPhotoDataUrl = payload.photoDataUrl.slice(0, MAX_PHOTO_DATA_URL_CHARS);
    const submissionId =
      payload.submissionId || crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const fullAddress = buildFullAddress({
      addressLine1: cleanAddressLine1,
      city: cleanCity,
      state: cleanState,
      zipCode: cleanZipCode,
    });

    const allowedServices = resolveWebsiteRequestServices(website);

    if (!cleanName || !cleanPhone || !cleanServiceNeeded || !cleanDescription) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (allowedServices.length && !isAllowedRequestService(cleanServiceNeeded, allowedServices)) {
      return Response.json({ error: "Invalid service selection" }, { status: 400 });
    }

    if (cleanEmail && !EMAIL_REGEX.test(cleanEmail)) {
      return Response.json({ error: "Invalid email format" }, { status: 400 });
    }

    if (cleanContactPreference === "email" && !cleanEmail) {
      return Response.json({ error: "Email is required for email contact preference" }, { status: 400 });
    }

    const { data: existingLead } = await supabaseAdmin
      .from("contractor_website_leads")
      .select("id")
      .eq("submission_id", submissionId)
      .maybeSingle();

    if (existingLead?.id) {
      return Response.json(
        { success: true, leadId: existingLead.id, duplicate: true },
        { status: 200 },
      );
    }

    let photoUrl = "";
    if (cleanPhotoDataUrl) {
      photoUrl = await uploadWebsiteImageFromDataUrl({
        tenantId: website.tenantId,
        slug: canonicalSlug,
        dataUrl: cleanPhotoDataUrl,
        kind: "lead-photo",
      });
    }

    const leadInsertBase = {
      tenant_id: website.tenantId,
      slug: canonicalSlug,
      name: cleanName,
      email: cleanEmail || `${canonicalSlug}+${Date.now()}@no-email.local`,
      phone: cleanPhone,
      address_line_1: cleanAddressLine1,
      city: cleanCity,
      state: cleanState,
      zip_code: cleanZipCode,
      service_needed: cleanServiceNeeded,
      photo_data_url: photoUrl && !photoUrl.startsWith("data:") ? null : cleanPhotoDataUrl || null,
      photo_url: photoUrl && !photoUrl.startsWith("data:") ? photoUrl : null,
      description: cleanDescription,
      budget_range: cleanBudgetRange || null,
      timeline: cleanTimeline || null,
      contact_preference: cleanContactPreference,
      submission_id: submissionId,
      status: "new",
      metadata: {
        budgetRange: cleanBudgetRange,
        timeline: cleanTimeline,
        contactPreference: cleanContactPreference,
        fullAddress,
      },
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { data: insertedLead, error: leadInsertError } = await insertWebsiteLeadRow(leadInsertBase);

    if (leadInsertError?.code === "42P01") {
      console.error("contractor_website_leads table missing");
      return publicWebsiteJson(
        {
          success: false,
          error: "Lead system unavailable. Please call the contractor directly.",
        },
        { status: 503 },
      );
    }

    if (leadInsertError) {
      console.error("contractor_website_leads insert failed", leadInsertError);
      return publicWebsiteJson(
        {
          success: false,
          error: "Could not save your request. Please try again or call us.",
        },
        { status: 500 },
      );
    }

    const leadId = insertedLead?.id || null;
    if (!leadId) {
      return Response.json(
        { error: "Could not save your request. Please try again or call us." },
        { status: 500 },
      );
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
          notes: `Website lead (${canonicalSlug})\nService needed: ${cleanServiceNeeded}\n${cleanDescription}`,
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
          slug: canonicalSlug,
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

    after(() =>
      runWebsiteLeadSideEffects({
        tenantId: website.tenantId,
        canonicalSlug,
        leadId,
        nowIso,
        cleanName,
        cleanEmail,
        cleanPhone,
        cleanServiceNeeded,
        cleanDescription,
        cleanBudgetRange,
        cleanTimeline,
        cleanContactPreference,
        fullAddress,
        confirmLocale,
      }),
    );

    return publicWebsiteJson(
      {
        success: true,
        leadId,
        slug: canonicalSlug,
        message: "Quote request submitted. We'll contact you soon!",
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Contact form error:", err);
    const detail =
      process.env.NODE_ENV === "production"
        ? undefined
        : String(err?.message || err?.code || "unknown_error");
    return publicWebsiteJson(
      {
        success: false,
        error: "We couldn’t send your request right now. Please try again in a moment or call us directly.",
        detail,
      },
      { status: 500 },
    );
  }
}
