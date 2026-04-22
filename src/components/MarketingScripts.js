import Script from "next/script";

const gtmId = process.env.NEXT_PUBLIC_GTM_ID;
const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export default function MarketingScripts() {
  const useGtm = Boolean(gtmId);
  const useGa = Boolean(gaMeasurementId) && !useGtm;

  return (
    <>
      {useGtm
        ? <>
            <Script id="gtm-init" strategy="afterInteractive">
              {`
              window.dataLayer = window.dataLayer || [];
              window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
            `}
            </Script>
            <Script
              id="gtm-script"
              src={`https://www.googletagmanager.com/gtm.js?id=${gtmId}`}
              strategy="afterInteractive"
            />
          </>
        : null}

      {useGa
        ? <>
            <Script
              id="ga4-script"
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){window.dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${gaMeasurementId}', { send_page_view: true });
            `}
            </Script>
          </>
        : null}

      {useGtm
        ? <noscript>
            <iframe
              height="0"
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              style={{ display: "none", visibility: "hidden" }}
              title="gtm"
              width="0"
            />
          </noscript>
        : null}
    </>
  );
}
