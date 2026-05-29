// FieldBase Marketing Landing Page
// Colors: --sidebar-bg #1e293b | --primary #1d4ed8 | light #eff6ff
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import i18n from "@/i18n";

// ─── Icons ─────────────────────────────────────────────────────────────
function IconCustomerCenter() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="8" fill="#1d4ed8" />
      <path d="M14 30v-2a6 6 0 0 1 6-6h8a6 6 0 0 1 6 6v2" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="24" cy="18" r="4" stroke="white" strokeWidth="2.5" />
    </svg>
  );
}
function IconOnlineRequest() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="8" fill="#1d4ed8" />
      <rect x="10" y="14" width="28" height="20" rx="3" stroke="white" strokeWidth="2.5" />
      <path d="M18 24h12M18 28h7" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
function IconQuotes() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="8" fill="#1d4ed8" />
      <path d="M14 12h20v28l-10-5-10 5V12z" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M19 20h10M19 24h6" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
function IconPayment() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="8" fill="#1d4ed8" />
      <rect x="10" y="16" width="28" height="18" rx="3" stroke="white" strokeWidth="2.5" />
      <path d="M10 22h28" stroke="white" strokeWidth="2.5" />
      <rect x="14" y="26" width="6" height="4" rx="1" fill="white" />
    </svg>
  );
}
function IconComms() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="8" fill="#1d4ed8" />
      <path d="M12 14h24v16H24l-6 4v-4h-6V14z" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M18 21h12M18 25h7" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
function IconCRM() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="8" fill="#1d4ed8" />
      <circle cx="24" cy="20" r="5" stroke="white" strokeWidth="2.5" />
      <path d="M14 36c0-5.523 4.477-10 10-10s10 4.477 10 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function IndustryIcon({ name }) {
  const icons = {
    Cleaning: "🧹",
    "Construction & Contracting": "🏗️",
    Electrical: "⚡",
    HVAC: "❄️",
    Handyman: "🔧",
    Landscaping: "🌿",
    "Lawn Care": "🌱",
    Painting: "🎨",
    Plumbing: "🚰",
    Roofing: "🏠",
    "Tree Care": "🌳",
  };
  return <span className="text-2xl mr-3">{icons[name] || "🔨"}</span>;
}

function WaveDivider({ fromColor, toColor }) {
  return (
    <div style={{ height: 60, background: toColor, overflow: "hidden", position: "relative" }}>
      <svg
        viewBox="0 0 1200 60"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <path d="M0 0 Q300 60 600 30 Q900 0 1200 40 L1200 0 Z" fill={fromColor} />
      </svg>
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────
const STATS = [
  { number: "15 days", label: "Free trial — no credit card needed" },
  { number: "$35/mo", label: "Flat rate after your free trial" },
  { number: "All-in-one", label: "CRM, estimates, jobs, invoices & site" },
  { number: "Stripe", label: "Secure online payments built in" },
];

const PLATFORM_CAPABILITIES = [
  { title: "Client CRM", desc: "Contacts, properties, notes, and job history in one profile.", href: "/login?mode=register" },
  { title: "AI estimates", desc: "Draft line items and professional quotes in minutes.", href: "/login?mode=register" },
  { title: "Invoices & payments", desc: "Send invoices with Stripe checkout and track status.", href: "/login?mode=register" },
  { title: "Contractor website", desc: "AI-built public site with quote requests and lead inbox.", href: "/login?mode=register" },
  { title: "Calendar & weather", desc: "Schedule jobs with Google Calendar sync and live forecasts.", href: "/login?mode=register" },
  { title: "Client import", desc: "Bring your list from CSV with duplicate-safe updates.", href: "/login?mode=register" },
];

const LANDING_PILLARS = [
  {
    id: "run",
    accent: "#14b8a6",
    tagline: "Field ops",
    title: "Run the day",
    desc: "Clients, jobs, and calendar — your daily command center in one login.",
    links: [
      { href: "/login?mode=register", label: "Start free" },
      { href: "#features", label: "See scheduling" },
    ],
  },
  {
    id: "paid",
    accent: "#6366f1",
    tagline: "Money in",
    title: "Get paid",
    desc: "Invoices and Stripe checkout so clients pay you online from the field.",
    links: [
      { href: "/login?mode=register", label: "Collect faster" },
    ],
  },
  {
    id: "grow",
    accent: "#f59e0b",
    tagline: "Growth",
    title: "Win the next job",
    desc: "AI estimates, lead inbox, and your site — growth tools inspired by modern marketing stacks, original to FieldBase.",
    links: [
      { href: "#features", label: "AI estimates" },
    ],
  },
];

const FEATURES = [
  {
    Icon: IconCustomerCenter,
    title: "AI-Powered Estimates",
    desc: "Let artificial intelligence draft accurate, professional estimates for you in seconds. Just describe the job — FieldBase handles the numbers, line items, and formatting.",
    badge: "✨ AI Included",
    link: true,
    learnMore: "Type the job details once and the AI creates a clean estimate you can send immediately. It saves time and keeps quotes consistent.",
  },
  {
    Icon: IconOnlineRequest,
    title: "Google Calendar + Weather",
    desc: "Schedule jobs directly in Google Calendar and see real-time weather forecasts for every appointment. Never send a crew to a job site on a rainy day by surprise again.",
    badge: "🌤 Integrated",
    link: true,
    learnMore: "Every scheduled job can sync to your calendar and show weather context, so you can adjust crews and dates before issues happen.",
  },
  {
    Icon: IconQuotes,
    title: "Professional Quotes",
    desc: "Send polished, branded quotes with your logo, photos, and service options. Clients approve with one tap — no back-and-forth needed.",
    link: true,
    learnMore: "Create branded quotes with optional photos and service choices. Clients can review and approve quickly from one link.",
  },
  {
    Icon: IconPayment,
    title: "Flexible Payments",
    desc: "Send invoices with a secure online payment link (Stripe). Record cash, check, Zelle, or bank transfer when clients pay offline.",
    link: false,
  },
  {
    Icon: IconComms,
    title: "Client communication",
    desc: "Share quotes and invoices by link, email, or text. Keep every message tied to the job so nothing gets lost.",
    link: true,
    learnMore: "Send approval links, payment links, and updates from the same workspace — no separate inbox to manage.",
  },
  {
    Icon: IconCRM,
    title: "Built-in Client CRM",
    desc: "Every client's full history — quotes, jobs, invoices, notes — in one place. Deliver the kind of personalized service that turns one-time customers into loyal fans.",
    link: false,
  },
];

const INDUSTRIES = [
  "Cleaning",
  "Construction & Contracting",
  "Electrical",
  "HVAC",
  "Handyman",
  "Landscaping",
  "Lawn Care",
  "Painting",
  "Plumbing",
  "Roofing",
  "Tree Care",
];

const ALL_SECTORS = [
  "Appliance repair", "Carpentry", "Carpet cleaning", "Chimney sweeping",
  "Commercial cleaning", "Concrete", "Construction", "Demolition",
  "Dog walking", "Drywall", "Electrical contracting", "Elevator maintenance",
  "Excavation", "Fencing services", "Flooring", "Garage door services",
  "General contracting", "HVAC", "Irrigation services", "Concierge services",
  "Garbage removal", "Landscaping", "Lawn maintenance", "Locksmith services",
  "Painting", "Paving", "Pest control", "Plumbing",
  "Pool and hot tub services", "Pressure washing", "Property maintenance",
  "Remodeling", "Residential cleaning", "Restoration", "Roofing",
  "Snow removal", "Tile installation", "Tree maintenance", "Well services",
  "Window cleaning",
];

const TESTIMONIALS = [
  {
    quote: "I went from 5 customers to over 40. All my paperwork is digital now — I don't worry about losing anything.",
    name: "Carlos M.",
    company: "Independent contractor",
    avatar: "C",
  },
  {
    quote: "FieldBase made my business look professional from day one. My clients love being able to approve quotes online.",
    name: "Sarah L.",
    company: "Small business owner",
    avatar: "S",
  },
];

const HERO_PHOTOS = [
  { src: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&h=280&fit=crop", alt: "Electrician on the job" },
  { src: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&h=280&fit=crop", alt: "Professional cleaning team" },
  { src: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=280&fit=crop", alt: "Landscaping professional" },
  { src: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&h=280&fit=crop", alt: "Construction contractor" },
  { src: "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=400&h=280&fit=crop", alt: "Plumber at work" },
  { src: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=280&fit=crop", alt: "Home services professional" },
];

// ─── Navbar ────────────────────────────────────────────────────────────
function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 50, background: "#1e293b", borderBottom: "1px solid rgba(255,255,255,0.1)" }}
      className="flex items-center justify-between px-6 py-3">
      <Link href="/" className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: "#1d4ed8" }}>
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="#1e293b" strokeWidth="2" strokeLinejoin="round" />
            <path d="M9 22V12h6v10" stroke="#1e293b" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </div>
        <span className="text-white font-bold text-xl tracking-tight">FieldBase</span>
      </Link>

      <div className="hidden md:flex items-center gap-6 text-sm text-gray-300">
        <Link href="#product" className="hover:text-white transition-colors">Product</Link>
        <Link href="#industries" className="hover:text-white transition-colors">Industries</Link>
        <Link href="#pricing" className="hover:text-white transition-colors">Pricing</Link>
        <Link href="#resources" className="hover:text-white transition-colors">Resources</Link>
      </div>

      <div className="hidden md:flex items-center gap-4">
        <Link href="/login?mode=login" className="text-sm text-gray-300 hover:text-white transition-colors">Log In</Link>
        <Link href="/login?mode=register"
          className="font-bold text-sm px-4 py-2 rounded-md transition-colors"
          style={{ background: "#1d4ed8", color: "#ffffff" }}>
          Start Free Trial
        </Link>
      </div>

      <button className="md:hidden text-white p-2" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="2">
          {menuOpen
            ? <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
            : <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />}
        </svg>
      </button>

      {menuOpen && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1e293b", borderTop: "1px solid rgba(255,255,255,0.1)" }}
          className="flex flex-col p-4 gap-3 text-sm text-gray-300 md:hidden">
          <Link href="#product" className="hover:text-white">Product</Link>
          <Link href="#industries" className="hover:text-white">Industries</Link>
          <Link href="#pricing" className="hover:text-white">Pricing</Link>
          <Link href="#resources" className="hover:text-white">Resources</Link>
          <Link href="/login?mode=login" className="hover:text-white">Log In</Link>
          <Link href="/login?mode=register" className="font-bold px-4 py-2 rounded-md text-center"
            style={{ background: "#1d4ed8", color: "#ffffff" }}>
            Start Free Trial
          </Link>
        </div>
      )}
    </nav>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────
export default function MarketingPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [activeTab, setActiveTab] = useState(0);
  const [expandedFeature, setExpandedFeature] = useState("");

  useEffect(() => {
    i18n.changeLanguage("en");
  }, []);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user || data?.userId || data?.id) {
          router.replace("/dashboard");
        }
      })
      .catch(() => {});
  }, [router]);

  const tabs = [
    {
      label: "Get Noticed",
      headline: "Get more leads without extra effort",
      body: "Your own professional website, online quote requests, and a client portal — all ready in minutes. Customers find you, book you, and pay you without a single phone call.",
      img: HERO_PHOTOS[0],
    },
    {
      label: "Win Jobs",
      headline: "AI writes your estimates — you just approve",
      body: "Describe the job and FieldBase's built-in AI generates a complete, professional estimate with line items and pricing. Send it for approval in one tap.",
      img: HERO_PHOTOS[1],
      badge: "✨ AI Included",
    },
    {
      label: "Work Smarter",
      headline: "Schedule with Google Calendar & live weather",
      body: "Sync every job with Google Calendar and get real-time weather for each appointment. Plan your week around the forecast — not after the rain.",
      img: HERO_PHOTOS[2],
      badge: "🌤 Weather Integrated",
    },
    {
      label: "Boost Profits",
      headline: "Invoice on-site. Get paid the same day.",
      body: "Send invoices the moment the job is done, accept card or bank transfer, and let automated reminders chase overdue balances so you don't have to.",
      img: HERO_PHOTOS[3],
    },
  ];

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "FieldBase",
    url: "https://fieldbaseapp.net",
    logo: "https://fieldbaseapp.net/apple-touch-icon.png",
    sameAs: [],
    description:
      "FieldBase is the all-in-one platform contractors use to win leads, send estimates, run jobs, and get paid — with a free public website and lead inbox built in.",
  };

  const softwareAppJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "FieldBase",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    offers: {
      "@type": "Offer",
      price: "35.00",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    description:
      "Free 15-day trial. Run estimates, jobs, invoices, payments, and a public website for your contracting business.",
  };

  return (
    <div className="min-h-screen bg-white marketing-landing" style={{ fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @keyframes marketingFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .marketing-landing .hero-animate {
          animation: marketingFadeUp 0.7s ease-out both;
        }
        @media (prefers-reduced-motion: reduce) {
          .marketing-landing .hero-animate { animation: none; }
        }
      `}</style>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }}
      />
      <Navbar />

      {/* ── Hero ── */}
      <section style={{ background: "#1e293b" }} className="pt-16 pb-0 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-start gap-10 lg:gap-16">
          {/* Left text */}
          <div className="flex-1 pb-12 hero-animate">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4" style={{ background: "rgba(29,78,216,0.2)", color: "#93c5fd" }}>
              Run · Get paid · Grow — one platform for contractors
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
              Run the crew.<br />Collect on the job.<br />Win the next lead.
            </h1>
            <p className="text-lg mb-4 max-w-lg" style={{ color: "#94a3b8" }}>
              FieldBase blends what you love from field-service ops, contractor invoicing, and AI growth tools — original, focused, and built for the truck, not the back office only.
            </p>
            <p className="text-sm font-semibold mb-8 px-4 py-2 rounded-lg inline-block" style={{ background: "rgba(29,78,216,0.15)", color: "#93c5fd" }}>
              🎉 Try free for 15 days — then just $35/month. No credit card required.
            </p>
            <div className="flex flex-wrap gap-4 mb-8">
              <Link href="/login?mode=register"
                className="font-bold text-base px-6 py-3 rounded-md transition-colors"
                style={{ background: "#1d4ed8", color: "#ffffff" }}>
                  Start Free — 15 Days
              </Link>
              <Link href="#resources"
                className="font-bold text-base px-6 py-3 rounded-md transition-colors bg-white/10 hover:bg-white/20"
                style={{ color: "#ffffff" }}>
                See How It Works
              </Link>
            </div>
            <div className="flex flex-wrap gap-3 text-xs font-semibold">
              {["Built for contractors", "AI estimates included", "Stripe payments", "Free 15-day trial"].map((pill) => (
                <span
                  key={pill}
                  className="px-3 py-1.5 rounded-full"
                  style={{ background: "rgba(255,255,255,0.08)", color: "#cbd5e1", border: "1px solid rgba(148,163,184,0.25)" }}
                >
                  {pill}
                </span>
              ))}
            </div>
          </div>

          {/* Right: photo grid */}
          <div className="flex-1 grid grid-cols-2 gap-3 pb-0 min-w-0 max-w-xl w-full">
            {HERO_PHOTOS.map((photo, i) => (
              <div key={i} className="relative overflow-hidden rounded-xl" style={{ paddingBottom: "62%" }}>
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover"
                  unoptimized
                />
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "8px", background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}>
                  <p className="text-white text-xs font-semibold">{photo.alt}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section style={{ background: "#1e293b" }} className="pt-6 pb-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {STATS.map((s) => (
              <div key={s.number} className="rounded-xl p-5 text-center" style={{ background: "#1e3a5f" }}>
                <div className="text-3xl font-extrabold text-white mb-1">{s.number}</div>
                <div className="text-sm" style={{ color: "#64748b" }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              className="w-full sm:w-80 px-4 py-3 rounded-md text-sm outline-none"
              style={{ background: "#ffffff", border: "2px solid #e2e8f0", color: "#111827" }}
            />
            <Link
              href={email ? `/login?mode=register&email=${encodeURIComponent(email)}` : "/login?mode=register"}
              className="font-bold px-6 py-3 rounded-md text-sm transition-colors whitespace-nowrap"
              style={{ background: "#1d4ed8", color: "#ffffff" }}
            >
              Start Free — 15 Days
            </Link>
          </div>
          <p className="text-center text-xs mt-2" style={{ color: "#94a3b8" }}>Free for 15 days · Then $35/month · Cancel anytime · No credit card required</p>
        </div>
      </section>

      {/* ── Three pillars ── */}
      <section style={{ background: "#0f172a" }} className="py-14 px-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#64748b" }}>
            How FieldBase is different
          </p>
          <h2 className="text-3xl lg:text-4xl font-extrabold text-white text-center mb-3">
            Three moves. One login.
          </h2>
          <p className="text-center max-w-2xl mx-auto mb-10 text-base" style={{ color: "#94a3b8" }}>
            One tighter stack for what contractors actually do every day — from the first lead to getting paid.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {LANDING_PILLARS.map((pillar) => (
              <article
                key={pillar.id}
                className="rounded-2xl p-6 flex flex-col gap-3"
                style={{ border: "1px solid rgba(148,163,184,0.18)", background: "rgba(17,24,39,0.92)" }}
              >
                <div style={{ width: 44, height: 4, borderRadius: 999, background: pillar.accent }} />
                <p className="text-xs font-bold uppercase tracking-widest m-0" style={{ color: "#94a3b8" }}>{pillar.tagline}</p>
                <h3 className="text-xl font-extrabold text-white m-0">{pillar.title}</h3>
                <p className="text-sm flex-1 m-0" style={{ color: "#94a3b8", lineHeight: 1.55 }}>{pillar.desc}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {pillar.links.map((link) => (
                    <Link
                      key={link.href + link.label}
                      href={link.href}
                      className="text-xs font-semibold px-3 py-2 rounded-full transition-colors"
                      style={{ border: "1px solid rgba(148,163,184,0.25)", color: "#e2e8f0", background: "rgba(30,41,59,0.8)" }}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <WaveDivider fromColor="#0f172a" toColor="#eff6ff" />

      {/* ── Platform capabilities ── */}
      <section id="product" style={{ background: "#ffffff" }} className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#64748b" }}>
            Everything in one place
          </p>
          <h2 className="text-3xl lg:text-4xl font-extrabold text-center mb-4" style={{ color: "#1e293b" }}>
            Run your entire contracting business here
          </h2>
          <p className="text-center max-w-2xl mx-auto mb-10 text-base" style={{ color: "#6b7280" }}>
            CRM, estimates, invoices, websites, scheduling, and imports — not scattered tools with separate logins.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {PLATFORM_CAPABILITIES.map((cap) => (
              <Link
                key={cap.title}
                href={cap.href}
                className="rounded-2xl p-6 transition-shadow hover:shadow-md"
                style={{ border: "1px solid #e2e8f0", background: "#f8fafc" }}
              >
                <h3 className="text-lg font-bold mb-2" style={{ color: "#1e293b" }}>{cap.title}</h3>
                <p className="text-sm m-0" style={{ color: "#64748b", lineHeight: 1.55 }}>{cap.desc}</p>
                <span className="inline-block mt-4 text-sm font-semibold" style={{ color: "#1d4ed8" }}>
                  Start free →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Photo strip ── */}
      <section style={{ background: "#eff6ff", overflow: "hidden" }}>
        <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory">
          {HERO_PHOTOS.map((p, i) => (
            <div key={i} className="relative shrink-0 overflow-hidden rounded-lg snap-start" style={{ width: 256, height: 176 }}>
              <Image src={p.src} alt={p.alt} fill sizes="256px" className="object-cover" unoptimized />
            </div>
          ))}
        </div>
      </section>

      {/* ── Tabs / Feature showcase ── */}
      <section style={{ background: "#eff6ff" }} className="py-16 px-6" id="features">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {tabs.map((t, i) => (
              <button
                key={t.label}
                onClick={() => setActiveTab(i)}
                className="px-5 py-2 rounded-full font-semibold text-sm transition-all"
                style={{
                  border: "2px solid #1e293b",
                  background: activeTab === i ? "#1e293b" : "transparent",
                  color: activeTab === i ? "white" : "#1e293b",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col lg:flex-row">
            <div className="flex-1 p-10 flex flex-col justify-center">
              {tabs[activeTab].badge && (
                <span className="inline-flex w-fit items-center gap-1 text-xs font-bold px-3 py-1 rounded-full mb-4" style={{ background: "#eff6ff", color: "#1d4ed8" }}>{tabs[activeTab].badge}</span>
              )}
              <h2 className="text-3xl font-extrabold mb-4" style={{ color: "#1e293b" }}>{tabs[activeTab].headline}</h2>
              <p className="mb-6" style={{ color: "#6b7280" }}>{tabs[activeTab].body}</p>
              <Link href="/login?mode=register" className="inline-flex items-center gap-1 font-bold transition-colors" style={{ color: "#1d4ed8" }}>
                Try it free →
              </Link>
            </div>
            <div className="flex-1 relative" style={{ minHeight: 256 }}>
              <Image
                src={tabs[activeTab].img.src}
                alt={tabs[activeTab].headline}
                fill
                sizes="50vw"
                className="object-cover"
                unoptimized
              />
            </div>
          </div>
        </div>
      </section>

      <WaveDivider fromColor="#eff6ff" toColor="#ffffff" />

      {/* ── Make it easy for clients ── */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-extrabold text-center mb-4" style={{ color: "#1e293b" }}>
            Everything your business needs — all in one place
          </h2>
          <p className="text-center max-w-xl mx-auto mb-12" style={{ color: "#6b7280" }}>
            From AI-generated estimates to Google Calendar scheduling with live weather — FieldBase gives field service businesses the tools they need to look professional and run efficiently.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex flex-col rounded-xl p-6" style={{ border: "1px solid #e2e8f0" }}>
                <div className="mb-3 flex items-start justify-between">
                  <f.Icon />
                  {f.badge && (
                    <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: "#eff6ff", color: "#1d4ed8" }}>{f.badge}</span>
                  )}
                </div>
                <h3 className="font-bold text-lg mb-2" style={{ color: "#1e293b" }}>{f.title}</h3>
                <p className="text-sm flex-1" style={{ color: "#6b7280" }}>{f.desc}</p>
                {f.link && (
                  <>
                    <button
                      type="button"
                      onClick={() => setExpandedFeature(expandedFeature === f.title ? "" : f.title)}
                      className="mt-4 inline-flex items-center gap-1 font-semibold text-sm w-fit transition-colors"
                      style={{ color: "#1d4ed8" }}
                    >
                      {expandedFeature === f.title ? "Hide details" : "Learn more →"}
                    </button>
                    {expandedFeature === f.title && (
                      <p
                        className="mt-3 text-sm"
                        style={{ color: "#475569", background: "#eff6ff", border: "1px solid #dbeafe", borderRadius: 10, padding: "10px 12px" }}
                      >
                        {f.learnMore}
                      </p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <WaveDivider fromColor="#ffffff" toColor="#eff6ff" />

      {/* ── Industries ── */}
      <section style={{ background: "#eff6ff" }} className="py-16 px-6" id="industries">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-extrabold text-center mb-3" style={{ color: "#1e293b" }}>
            Proud partner to service pros in over 30 industries.
          </h2>
          <p className="text-center mb-10" style={{ color: "#6b7280" }}>
            Whatever your trade, FieldBase adapts to your workflow.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
            {INDUSTRIES.map((ind) => (
              <Link key={ind} href="/login?mode=register"
                className="bg-white rounded-xl p-4 flex items-center font-semibold text-sm transition-shadow hover:shadow-md"
                style={{ color: "#1e293b" }}>
                <IndustryIcon name={ind} />
                {ind}
              </Link>
            ))}
          </div>
          <div className="text-center">
            <Link href="/login?mode=register" className="font-semibold transition-colors" style={{ color: "#1e293b", borderBottom: "2px solid #1e293b" }}>
              See All Industries →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section style={{ background: "#eff6ff" }} className="py-8 pb-16 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="bg-white rounded-2xl p-8 shadow-sm">
              <p className="text-lg font-medium leading-relaxed mb-6" style={{ color: "#1e293b" }}>
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ background: "#1e293b" }}>
                  {t.avatar}
                </div>
                <div>
                  <div className="font-bold text-sm" style={{ color: "#1e293b" }}>{t.name}</div>
                  <div className="text-xs" style={{ color: "#6b7280" }}>{t.company}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <WaveDivider fromColor="#eff6ff" toColor="#ffffff" />

      {/* ── All sectors ── */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-12">
            <div className="lg:w-56 shrink-0">
              <h2 className="text-2xl font-extrabold mb-3" style={{ color: "#1e293b" }}>
                Main sectors that FieldBase works with
              </h2>
              <p className="text-sm" style={{ color: "#6b7280" }}>
                Whatever industry you work in, FieldBase&apos;s on-site service management software can be customized to suit your process.
              </p>
            </div>
            <div className="flex-1 text-sm columns-1 sm:columns-2 lg:columns-3 gap-8" style={{ color: "#1e293b" }}>
              {ALL_SECTORS.map((s) => (
                <div key={s} className="mb-1" style={{ breakInside: "avoid" }}>
                  {s},
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <WaveDivider fromColor="#ffffff" toColor="#1e293b" />

      {/* ── Pricing ── */}
      <section id="pricing" style={{ background: "#1e293b" }} className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-4">
              Simple pricing. No surprises.
            </h2>
            <p className="text-lg" style={{ color: "#94a3b8" }}>
              15 days free, then one flat monthly rate. No credit card to start.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <div className="rounded-2xl p-8 text-center" style={{ background: "#1e3a5f", border: "2px solid #1d4ed8" }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#93c5fd" }}>Standard</p>
              <p className="text-5xl font-extrabold text-white mb-1">$35<span className="text-xl font-semibold">/mo</span></p>
              <p className="text-sm mb-6" style={{ color: "#94a3b8" }}>After 15-day free trial · cancel anytime</p>
              <ul className="text-left text-sm space-y-2 mb-8" style={{ color: "#cbd5e1" }}>
                <li>✓ Full CRM, estimates, jobs & invoices</li>
                <li>✓ AI website builder & lead inbox</li>
                <li>✓ Calendar, weather & Stripe payments</li>
              </ul>
              <Link href="/login?mode=register"
                className="inline-block w-full font-bold px-6 py-3 rounded-md transition-all hover:shadow-lg"
                style={{ background: "#1d4ed8", color: "#ffffff" }}>
                Start Free Trial
              </Link>
            </div>
            <div className="rounded-2xl p-8 text-center relative overflow-hidden" style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(245,158,11,0.4)" }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#fbbf24" }}>Founding contractors</p>
              <p className="text-3xl font-extrabold text-white mb-2">Lock in $35/mo</p>
              <p className="text-sm mb-6" style={{ color: "#94a3b8" }}>
                Early accounts keep the launch rate as we add integrations and polish. Limited onboarding each month.
              </p>
              <p className="text-xs font-semibold px-3 py-2 rounded-full inline-block mb-6" style={{ background: "rgba(245,158,11,0.15)", color: "#fcd34d" }}>
                Same features · priority onboarding support
              </p>
              <Link href="/login?mode=register"
                className="inline-block w-full font-bold px-6 py-3 rounded-md transition-all"
                style={{ background: "#f59e0b", color: "#0f172a" }}>
                Claim Founding Access
              </Link>
            </div>
          </div>
        </div>
      </section>

      <WaveDivider fromColor="#1e293b" toColor="#eff6ff" />

      {/* ── Resources / AI Guide ── */}
      <section id="resources" style={{ background: "#eff6ff" }} className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold mb-4" style={{ color: "#1e293b" }}>How to Use FieldBase AI</h2>
            <p className="text-lg" style={{ color: "#6b7280" }}>Simple guides to get the most out of your estimates and scheduling</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* AI Estimates */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200">
              <div className="text-4xl mb-4">✨</div>
              <h3 className="text-2xl font-bold mb-3" style={{ color: "#1e293b" }}>AI Estimates</h3>
              <p style={{ color: "#6b7280" }} className="mb-4">Describe the job in plain language. FieldBase AI generates complete, professional estimates with line items and pricing in seconds.</p>
              <div style={{ background: "#f3f5fa", padding: "12px", borderRadius: "8px", fontSize: "13px", color: "#475569", marginBottom: "12px" }}>💡 Tip: Be specific about materials and scope for best results</div>
              <ul style={{ fontSize: "14px", color: "#6b7280", lineHeight: "1.8" }}>
                <li>• Write job details naturally</li>
                <li>• AI adds line items</li>
                <li>• Instant professional quotes</li>
              </ul>
            </div>

            {/* Google Calendar */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200">
              <div className="text-4xl mb-4">📅</div>
              <h3 className="text-2xl font-bold mb-3" style={{ color: "#1e293b" }}>Google Calendar Sync</h3>
              <p style={{ color: "#6b7280" }} className="mb-4">Schedule jobs directly from FieldBase into your Google Calendar. See all appointments in one place and avoid double-bookings.</p>
              <div style={{ background: "#f3f5fa", padding: "12px", borderRadius: "8px", fontSize: "13px", color: "#475569", marginBottom: "12px" }}>💡 Tip: Sync updates in real-time across all devices</div>
              <ul style={{ fontSize: "14px", color: "#6b7280", lineHeight: "1.8" }}>
                <li>• One-click scheduling</li>
                <li>• Real-time sync</li>
                <li>• Automatic reminders</li>
              </ul>
            </div>

            {/* Weather Forecasts */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200">
              <div className="text-4xl mb-4">🌤️</div>
              <h3 className="text-2xl font-bold mb-3" style={{ color: "#1e293b" }}>Live Weather Forecasts</h3>
              <p style={{ color: "#6b7280" }} className="mb-4">See real-time weather for each job location. Plan around rain, extreme temps, or storms before your crew arrives on site.</p>
              <div style={{ background: "#f3f5fa", padding: "12px", borderRadius: "8px", fontSize: "13px", color: "#475569", marginBottom: "12px" }}>💡 Tip: Check weather 24 hours before outdoor jobs</div>
              <ul style={{ fontSize: "14px", color: "#6b7280", lineHeight: "1.8" }}>
                <li>• Location-based forecasts</li>
                <li>• Hourly updates</li>
                <li>• Job site conditions</li>
              </ul>
            </div>
          </div>

          {/* Getting Started */}
          <div className="mt-16 bg-white rounded-2xl p-12 border border-gray-200 text-center">
            <h3 className="text-2xl font-bold mb-4" style={{ color: "#1e293b" }}>Ready to streamline your workflow?</h3>
            <p className="mb-8" style={{ color: "#6b7280" }}>Start your free 15-day trial today. All features included, no credit card required.</p>
            <Link href="/login?mode=register"
              className="inline-block font-bold px-10 py-3 rounded-md transition-all hover:shadow-lg"
              style={{ background: "#1d4ed8", color: "#ffffff" }}>
              Try Now Free — 15 Days
            </Link>
          </div>
        </div>
      </section>

      <WaveDivider fromColor="#eff6ff" toColor="#0f172a" />

      {/* ── Footer ── */}
      <footer style={{ background: "#0f172a", color: "#6b7280" }} className="py-8 px-6 text-center text-sm">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4" style={{ color: "#6b7280" }}>
          <span className="font-bold" style={{ color: "#94a3b8" }}>FieldBase</span>
          <div className="flex gap-6">
            <Link href="/legal" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/legal" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link href="/login?mode=login" className="hover:text-white transition-colors">Log In</Link>
          </div>
          <span>© {new Date().getFullYear()} FieldBase. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}


