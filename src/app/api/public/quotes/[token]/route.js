import { getCompanyProfileByTenant } from "@/lib/company-profile-store";
import {
  checkPublicQuoteRateLimit,
  getRequestIp,
  recordPublicQuoteAttempt,
} from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const JOBS = "jobs";
const QUOTES = "quotes";
const CLIENTS = "clients";

function isValidQuoteToken(value) {
  const token = String(value || "").trim();
  return token.length >= 24 && /^[a-zA-Z0-9_-]+$/.test(token);
}

export async function GET(_request, { params }) {
  try {
    const { token } = await params;
    const quoteToken = String(token || "").trim();

    if (!isValidQuoteToken(quoteToken)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const ip = getRequestIp(_request);
    const limitState = await checkPublicQuoteRateLimit({
      token: quoteToken,
      ip,
      action: "view",
    });
    if (!limitState.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Too many requests. Please try again shortly.",
          code: "RATE_LIMITED",
          retryAfterSeconds: limitState.retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(limitState.retryAfterSeconds),
          },
        },
      );
    }

    await recordPublicQuoteAttempt({ token: quoteToken, ip, action: "view" });

    // Prefer the dedicated quotes table and only fall back to jobs for legacy rows.
    const { data: quoteRow, error: quoteError } = await supabaseAdmin
      .from(QUOTES)
      .select("*")
      .eq("quote_token", quoteToken)
      .maybeSingle();

    if (quoteError) {
      console.error(
        "[api/public/quotes/:token][GET] Supabase quote query error",
        quoteError,
      );
      throw new Error(quoteError.message);
    }

    let job = null;

    if (quoteRow) {
      job = {
        id: quoteRow.id,
        tenant_id: quoteRow.tenant_id,
        client_id: quoteRow.client_id,
        title: quoteRow.title,
        client_name: quoteRow.client_name,
        service: "",
        status: quoteRow.status || "Pending",
        price: "",
        due_date: "",
        scope_details: quoteRow.scope_of_work || "",
        tax_state: quoteRow.state || "TX",
        down_payment_percent: "0",
        quote_status: quoteRow.status || "sent",
        quote_approved_at: quoteRow.approved_at || "",
        quote_signed_at: "",
        quote_approved_by_name: "",
        quote_approved_by_email: "",
        quote_signed_by_name: "",
        quote_signed_by_email: "",
        quote_signature_text: "",
      };
    } else {
      const { data: legacyJob, error: jobError } = await supabaseAdmin
        .from(JOBS)
        .select("*")
        .eq("quote_token", quoteToken)
        .maybeSingle();

      // If legacy column does not exist anymore, treat as not found instead of 500.
      if (jobError) {
        if (
          String(jobError.message || "")
            .toLowerCase()
            .includes("quote_token")
        ) {
          job = null;
        } else {
          console.error(
            "[api/public/quotes/:token][GET] Supabase legacy job query error",
            jobError,
          );
          throw new Error(jobError.message);
        }
      } else {
        job = legacyJob;
      }
    }

    if (!job) {
      return new Response(
        JSON.stringify({ success: false, error: "Quote not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const tenantId = job.tenant_id || "default";

    const clientId = String(job.client_id || "").trim();

    const [clientDoc, companyProfile] = await Promise.all([
      clientId
        ? supabaseAdmin
            .from(CLIENTS)
            .select("id,name")
            .eq("id", clientId)
            .eq("tenant_id", tenantId)
            .maybeSingle()
            .then(({ data, error }) => {
              if (error) {
                console.error(
                  "[api/public/quotes/:token][GET] Supabase client query error",
                  error,
                );
                throw new Error(error.message);
              }
              return data;
            })
        : Promise.resolve(null),
      getCompanyProfileByTenant({ tenantId }),
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          quoteToken,
          tenantId,
          job: {
            _id: job.id,
            title: job.title || "",
            clientName: job.client_name || clientDoc?.name || "",
            service: job.service || "",
            status: job.status || "Pending",
            price: job.price || "",
            dueDate: job.due_date || "",
            scopeDetails: job.scope_details || "",
            taxState: job.tax_state || "TX",
            downPaymentPercent: job.down_payment_percent || "0",
            quoteStatus: job.quote_status || "sent",
            quoteApprovedAt:
              job.quote_approved_at instanceof Date
                ? job.quote_approved_at.toISOString()
                : job.quote_approved_at || "",
            quoteSignedAt:
              job.quote_signed_at instanceof Date
                ? job.quote_signed_at.toISOString()
                : job.quote_signed_at || "",
            quoteApprovedByName: job.quote_approved_by_name || "",
            quoteApprovedByEmail: job.quote_approved_by_email || "",
            quoteSignedByName: job.quote_signed_by_name || "",
            quoteSignedByEmail: job.quote_signed_by_email || "",
            quoteSignatureText: job.quote_signature_text || "",
          },
          companyProfile: {
            companyName: companyProfile?.companyName || "ContractorFlow",
            logoDataUrl: companyProfile?.logoDataUrl || "",
            websiteUrl: companyProfile?.websiteUrl || "",
            googleReviewsUrl: companyProfile?.googleReviewsUrl || "",
            phone: companyProfile?.phone || "",
            businessAddress: companyProfile?.businessAddress || "",
            poBoxAddress: companyProfile?.poBoxAddress || "",
          },
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/public/quotes/:token][GET] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
