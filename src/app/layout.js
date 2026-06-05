import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthShell from "@/components/AuthShell";
import InstantNavigation from "@/components/InstantNavigation";
import I18nProvider from "@/components/I18nProvider";
import MarketingScripts from "@/components/MarketingScripts";
import ClientErrorReporter from "@/components/ClientErrorReporter";

const APP_BASE_URL = String(
  process.env.APP_BASE_URL || process.env.APP_URL || "https://fieldbaseapp.net",
).replace(/\/$/, "");

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "FieldBase — All-in-one platform for home service contractors",
    template: "%s | FieldBase",
  },
  description:
    "FieldBase is the all-in-one platform contractors use to win leads, send estimates, run jobs, and get paid — with a free public website and lead inbox built in.",
  metadataBase: new URL(APP_BASE_URL),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: APP_BASE_URL,
    siteName: "FieldBase",
    title: "FieldBase — All-in-one platform for home service contractors",
    description:
      "Win leads, send estimates, run jobs, and get paid. FieldBase gives contractors a public website, lead inbox, and full operations in one place.",
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: "FieldBase — contractor operating system",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FieldBase — All-in-one platform for home service contractors",
    description:
      "Win leads, send estimates, run jobs, and get paid. FieldBase gives contractors a public website, lead inbox, and full operations in one place.",
    images: ["/og-default.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/site.webmanifest?v=5",
  icons: {
    icon: [
      { url: "/favicon.ico?v=5", sizes: "any" },
      { url: "/favicon-32x32.png?v=5", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png?v=5", type: "image/png", sizes: "16x16" },
    ],
    apple: [
      { url: "/apple-touch-icon.png?v=5", sizes: "180x180" },
      { url: "/apple-touch-icon-precomposed-v3.png?v=5", sizes: "180x180" },
    ],
    shortcut: ["/favicon.ico?v=5"],
  },
  appleWebApp: {
    capable: true,
    title: "FieldBase",
    statusBarStyle: "default",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MarketingScripts />
        <InstantNavigation />
        <I18nProvider>
          <ClientErrorReporter />
          <AuthShell>{children}</AuthShell>
        </I18nProvider>
      </body>
    </html>
  );
}
