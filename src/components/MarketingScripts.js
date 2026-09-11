"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";

const gtmId = process.env.NEXT_PUBLIC_GTM_ID;
const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

const MARKETING_SCRIPT_PREFIXES = [
  "/",
  "/login",
  "/sign-in",
  "/register",
  "/subscribe",
  "/legal",
  "/legal-required",
  "/reset-password",
  "/verify-email",
];

function shouldLoadMarketingScripts(pathname) {
  const path = String(pathname || "/");
  if (path === "/") return true;
  return MARKETING_SCRIPT_PREFIXES.some(
    (prefix) => prefix !== "/" && (path === prefix || path.startsWith(`${prefix}/`)),
  );
}

export default function MarketingScripts() {
  const pathname = usePathname();
  const enabled = shouldLoadMarketingScripts(pathname);
  const useGtm = enabled && Boolean(gtmId);
  const useGa = enabled && Boolean(gaMeasurementId) && !useGtm;

  if (!enabled) return null;

  return (
    <>
      {useGtm ? (
        <>
          <Script id="gtm-init" strategy="lazyOnload">
            {`
              window.dataLayer = window.dataLayer || [];
              window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
            `}
          </Script>
          <Script
            id="gtm-script"
            src={`https://www.googletagmanager.com/gtm.js?id=${gtmId}`}
            strategy="lazyOnload"
          />
        </>
      ) : null}

      {useGa ? (
        <>
          <Script
            id="ga4-script"
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            strategy="lazyOnload"
          />
          <Script id="ga4-init" strategy="lazyOnload">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){window.dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${gaMeasurementId}', { send_page_view: true });
            `}
          </Script>
        </>
      ) : null}

      {useGtm ? (
        <noscript>
          <iframe
            height="0"
            src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
            style={{ display: "none", visibility: "hidden" }}
            title="gtm"
            width="0"
          />
        </noscript>
      ) : null}
    </>
  );
}
