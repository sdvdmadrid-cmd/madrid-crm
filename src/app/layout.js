import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthShell from "@/components/AuthShell";
import InstantNavigation from "@/components/InstantNavigation";
import I18nProvider from "@/components/I18nProvider";
import MarketingScripts from "@/components/MarketingScripts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "FieldBase",
  description:
    "Complete contractor management system for clients jobs invoices and contracts.",
  manifest: "/site.webmanifest?v=3",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png?v=3", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png?v=3", type: "image/png", sizes: "16x16" },
    ],
    apple: [
      { url: "/apple-touch-icon-v3.png", sizes: "180x180" },
      { url: "/apple-touch-icon-precomposed-v3.png", sizes: "180x180" },
    ],
    shortcut: ["/favicon.ico"],
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
          <AuthShell>{children}</AuthShell>
        </I18nProvider>
      </body>
    </html>
  );
}
