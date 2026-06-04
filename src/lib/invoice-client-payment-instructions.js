import { normalizePaymentMethod } from "./invoice-payments.js";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Client-facing payment settings stored under company_profiles.service_catalog_preferences.clientPayments */
export function getClientPaymentSettings(companyProfile = {}) {
  const prefs =
    companyProfile?.serviceCatalogPreferences?.clientPayments &&
    typeof companyProfile.serviceCatalogPreferences.clientPayments === "object"
      ? companyProfile.serviceCatalogPreferences.clientPayments
      : {};

  const phone = String(companyProfile?.phone || "").trim();

  return {
    zelleEmail: String(prefs.zelleEmail || prefs.zelle_email || "").trim(),
    zellePhone: String(prefs.zellePhone || prefs.zelle_phone || phone).trim(),
    venmoHandle: String(prefs.venmoHandle || prefs.venmo_handle || "").trim(),
    paypalEmail: String(prefs.paypalEmail || prefs.paypal_email || "").trim(),
    bankTransferInstructions: String(
      prefs.bankTransferInstructions || prefs.bank_instructions || "",
    ).trim(),
  };
}

/**
 * Build payment instructions for invoice emails and PDFs.
 * @returns {{ textLines: string[], htmlBlock: string }}
 */
export function buildInvoicePaymentInstructions({
  companyProfile = {},
  invoice = {},
  checkoutUrl = "",
} = {}) {
  const preferred = normalizePaymentMethod(invoice.preferredPaymentMethod);
  const settings = getClientPaymentSettings(companyProfile);
  const safeCheckout = String(checkoutUrl || "").trim();

  const textLines = [];
  const htmlParts = [];

  textLines.push("How to pay this invoice:");
  htmlParts.push(
    `<p style="margin:16px 0 8px;font-weight:700;">How to pay this invoice</p>`,
  );

  if (safeCheckout) {
    textLines.push(`• Credit or debit card (secure online): ${safeCheckout}`);
    htmlParts.push(
      `<p><strong>Credit / debit card</strong><br /><a href="${escapeHtml(safeCheckout)}" style="display:inline-block;margin-top:6px;padding:10px 14px;background:#111827;color:#fff;text-decoration:none;border-radius:8px;">Pay invoice securely online</a><br /><span style="font-size:12px;color:#64748b;">${escapeHtml(safeCheckout)}</span></p>`,
    );
  } else {
    textLines.push(
      "• Credit or debit card: ask us to resend the secure payment link, or call our office.",
    );
    htmlParts.push(
      `<p><strong>Credit / debit card</strong><br />Contact us for a secure online payment link.</p>`,
    );
  }

  const showZelle =
    preferred === "zelle" ||
    Boolean(settings.zelleEmail || settings.zellePhone);
  if (showZelle) {
    const zelleBits = [];
    if (settings.zelleEmail) zelleBits.push(`Email: ${settings.zelleEmail}`);
    if (settings.zellePhone) zelleBits.push(`Phone: ${settings.zellePhone}`);
    if (zelleBits.length) {
      textLines.push(`• Zelle: ${zelleBits.join(" · ")}`);
      htmlParts.push(
        `<p><strong>Zelle</strong><br />${zelleBits.map((line) => escapeHtml(line)).join("<br />")}</p>`,
      );
    } else {
      textLines.push("• Zelle: use the contractor contact details in this message.");
      htmlParts.push(
        `<p><strong>Zelle</strong><br />Send payment using the contractor phone or email on this invoice.</p>`,
      );
    }
  }

  if (preferred === "venmo" || settings.venmoHandle) {
    const handle = settings.venmoHandle || "contact us for Venmo details";
    textLines.push(`• Venmo: ${handle}`);
    htmlParts.push(`<p><strong>Venmo</strong><br />${escapeHtml(handle)}</p>`);
  }

  if (preferred === "bank_transfer" || settings.bankTransferInstructions) {
    const bankText =
      settings.bankTransferInstructions ||
      "Contact us for bank transfer instructions.";
    textLines.push(`• Bank transfer: ${bankText}`);
    htmlParts.push(
      `<p><strong>Bank transfer</strong><br />${escapeHtml(bankText).replace(/\n/g, "<br />")}</p>`,
    );
  }

  if (preferred === "paypal" || settings.paypalEmail) {
    const paypal = settings.paypalEmail || "contact us for PayPal details";
    textLines.push(`• PayPal: ${paypal}`);
    htmlParts.push(`<p><strong>PayPal</strong><br />${escapeHtml(paypal)}</p>`);
  }

  if (preferred === "cash" || preferred === "check") {
    const label = preferred === "cash" ? "Cash" : "Check";
    textLines.push(`• ${label}: pay in person or mail per contractor instructions.`);
    htmlParts.push(
      `<p><strong>${label}</strong><br />Pay in person or by mail as arranged with our team.</p>`,
    );
  }

  return {
    textLines,
    htmlBlock: htmlParts.join(""),
    preferredMethod: preferred,
  };
}

export function mergeClientPaymentsIntoPreferences(existingPrefs = {}, clientPayments = {}) {
  const base =
    existingPrefs && typeof existingPrefs === "object" ? { ...existingPrefs } : {};
  const current =
    base.clientPayments && typeof base.clientPayments === "object"
      ? { ...base.clientPayments }
      : {};

  const patch =
    clientPayments && typeof clientPayments === "object" ? clientPayments : {};

  return {
    ...base,
    clientPayments: {
      ...current,
      zelleEmail: String(patch.zelleEmail ?? current.zelleEmail ?? "").trim(),
      zellePhone: String(patch.zellePhone ?? current.zellePhone ?? "").trim(),
      venmoHandle: String(patch.venmoHandle ?? current.venmoHandle ?? "").trim(),
      paypalEmail: String(patch.paypalEmail ?? current.paypalEmail ?? "").trim(),
      bankTransferInstructions: String(
        patch.bankTransferInstructions ?? current.bankTransferInstructions ?? "",
      ).trim(),
    },
  };
}
