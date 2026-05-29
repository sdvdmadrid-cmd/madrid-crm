import { supabaseAdmin } from "@/lib/supabase-admin";

const APP_BASE_URL = String(
  process.env.APP_BASE_URL || process.env.APP_URL || "https://fieldbaseapp.net",
).replace(/\/$/, "");

export async function generateMetadata({ params }) {
  const { token } = await params;
  const quoteToken = String(token || "").trim();

  if (!quoteToken || quoteToken.length < 24) {
    return {
      title: "Quote",
      robots: { index: false, follow: false },
    };
  }

  const { data: quote } = await supabaseAdmin
    .from("quotes")
    .select("title, quote_number, client_name")
    .eq("quote_token", quoteToken)
    .maybeSingle();

  const label =
    String(quote?.title || "").trim() ||
    (quote?.quote_number ? `Quote #${quote.quote_number}` : "") ||
    "Project quote";
  const client = String(quote?.client_name || "").trim();
  const title = client ? `${label} — ${client}` : label;
  const description = client
    ? `Review and approve your quote from ${client} on FieldBase.`
    : "Review and approve your project quote on FieldBase.";

  const pageUrl = `${APP_BASE_URL}/quote/${encodeURIComponent(quoteToken)}`;

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      url: pageUrl,
      title,
      description,
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-default.png"],
    },
  };
}

export default function QuoteTokenLayout({ children }) {
  return children;
}
