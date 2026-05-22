import "server-only";

import { sendEmail } from "@/lib/email";
import { sendTextMessage } from "@/lib/sms";

const COPY = {
  en: {
    subject: "We received your request!",
    text: (name, service) =>
      `Thank you, ${name}!\n\nWe received your request for: ${service}.\nA team member will contact you soon.`,
    html: (name, service) =>
      `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px"><h2 style="color:#0f172a">Thank you, ${name}!</h2><p>We received your request for <strong>${service}</strong>.</p><p>We will contact you shortly.</p></div>`,
    sms: (name, service) =>
      `Thanks ${name}! We received your ${service} request and will contact you soon.`,
  },
  es: {
    subject: "¡Recibimos tu solicitud!",
    text: (name, service) =>
      `¡Gracias, ${name}!\n\nRecibimos tu solicitud para: ${service}.\nTe contactaremos pronto.`,
    html: (name, service) =>
      `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px"><h2 style="color:#0f172a">¡Gracias, ${name}!</h2><p>Recibimos tu solicitud para <strong>${service}</strong>.</p><p>Te contactaremos pronto.</p></div>`,
    sms: (name, service) =>
      `¡Gracias ${name}! Recibimos tu solicitud de ${service} y te contactaremos pronto.`,
  },
  pl: {
    subject: "Otrzymalismy Twoje zgloszenie!",
    text: (name, service) =>
      `Dziekujemy, ${name}!\n\nOtrzymalismy zgloszenie: ${service}.\nWkrotce sie skontaktujemy.`,
    html: (name, service) =>
      `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px"><h2 style="color:#0f172a">Dziekujemy, ${name}!</h2><p>Otrzymalismy zgloszenie: <strong>${service}</strong>.</p><p>Wkrotce sie skontaktujemy.</p></div>`,
    sms: (name, service) =>
      `Dziekujemy ${name}! Otrzymalismy zgloszenie (${service}) i wkrotce sie odezwiemy.`,
  },
};

function resolveLocale(raw) {
  const lang = String(raw || "en").trim().toLowerCase();
  if (lang in COPY) return lang;
  return "en";
}

export async function sendWebsiteLeadClientConfirmation({
  locale = "en",
  email = "",
  phone = "",
  name = "",
  serviceNeeded = "",
  slug = "",
}) {
  const lang = resolveLocale(locale);
  const pack = COPY[lang];
  const safeName = String(name || "there").slice(0, 80);
  const safeService = String(serviceNeeded || "your project").slice(0, 120);

  const tasks = [];

  if (email) {
    tasks.push(
      sendEmail({
        to: [email],
        subject: pack.subject,
        text: pack.text(safeName, safeService),
        html: pack.html(safeName, safeService),
        metadata: { type: "website_lead_client_confirmation", lang, slug },
      }).catch((err) => {
        console.warn("client confirmation email failed", err?.message || err);
      }),
    );
  }

  if (phone) {
    tasks.push(
      sendTextMessage({
        to: phone,
        text: pack.sms(safeName, safeService),
      }).catch((err) => {
        console.warn("client confirmation sms failed", err?.message || err);
      }),
    );
  }

  await Promise.all(tasks);
}
