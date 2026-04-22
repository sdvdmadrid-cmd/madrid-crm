"use client";

import { useEffect, useMemo, useState } from "react";
import TermsConditionsModal from "@/components/auth/TermsConditionsModal";
import { trackMarketingEvent } from "@/lib/marketing-analytics";
import styles from "./OnboardingEntrySection.module.css";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COPY = {
  en: {
    nav: {
      signIn: "Sign in",
      startFree: "Start Free",
      demo: "See Demo",
    },
    hero: {
      eyebrow: "All-in-one contractor operating system",
      title:
        "Win more jobs and get paid faster without losing control of the day-to-day.",
      body: "ContractorFlow gives service businesses one place to manage estimates, scheduling, jobs, invoices, payments, and business visibility.",
      meta: "No credit card required · Guided setup for service businesses",
      bullets: [
        "Built for contractors and service businesses",
        "Tracks money in and money out",
        "Connects office, field, and collections",
      ],
      stats: [
        { value: "1 system", label: "for jobs, invoices, and payments" },
        { value: "< 60 sec", label: "to reserve founder access" },
        { value: "24/7", label: "cash flow visibility" },
      ],
    },
    social: {
      title: "Designed for the operators who actually run service businesses.",
      tags: [
        "Contractors",
        "Landscaping teams",
        "Field service businesses",
        "Owner-operators",
      ],
      stats: [
        { value: "Jobs to cash", label: "one connected workflow" },
        { value: "Payments built-in", label: "not bolted onto the side" },
        { value: "Clearer control", label: "for schedule, crews, and money" },
      ],
    },
    features: {
      kicker: "Core workflow",
      title:
        "Everything needed to win the work, run the business, and collect faster.",
      items: [
        {
          title: "Win More Jobs",
          body: "Create estimates quickly, keep follow-up organized, and move approved work straight into the schedule.",
        },
        {
          title: "Run Your Business",
          body: "Manage jobs, crews, customers, and business activity from one operating dashboard instead of scattered tools.",
        },
        {
          title: "Get Paid Faster",
          body: "Send invoices, accept payments, track income, and stay ahead of outgoing bills without losing context.",
        },
      ],
    },
    payments: {
      kicker: "Payments system",
      title: "A cleaner way to handle money in and money out.",
      body: "Payments are part of the workflow, not a separate finance app. Invoice clients, collect faster, track revenue live, and stay on top of expenses and bills from the same operating system.",
      bullets: [
        "Send invoices as soon as work is ready",
        "Accept payments without slowing collections",
        "Monitor paid, pending, and overdue income",
        "Track bills and outgoing expenses in context",
      ],
      incomeLabel: "Income this week",
      billsLabel: "Bills this week",
    },
    steps: {
      kicker: "How it works",
      title: "A simple path from job setup to faster collections.",
      items: [
        {
          title: "Add your jobs",
          body: "Start with incoming work, estimates, and booked jobs without a heavy setup process.",
        },
        {
          title: "Manage everything in one place",
          body: "Keep operations, customers, crews, and financial workflow connected from the same system.",
        },
        {
          title: "Get paid faster",
          body: "Invoice earlier, follow payment status live, and keep tighter control over cash flow.",
        },
      ],
    },
    founder: {
      kicker: "Founder access",
      leadTitle: "Reserve founder access",
      leadBody:
        "Start with your business details. Then finish the secure owner account setup below.",
      companyLabel: "Company name",
      companyPlaceholder: "North Ridge Landscaping",
      emailLabel: "Work email",
      emailPlaceholder: "owner@company.com",
      termsLead: "I agree to the",
      termsLink: "Terms and Conditions",
      continue: "Reserve founder access",
      helper: "Secure signup. No credit card required.",
      accountTitle: "Create your owner account",
      accountBody:
        "Your company details are saved. Add the owner profile to activate the workspace.",
      nameLabel: "Owner full name",
      namePlaceholder: "Jordan Alvarez",
      passwordLabel: "Create password",
      passwordPlaceholder: "Choose a secure password",
      summaryLabel: "Business details",
      edit: "Edit business details",
      submit: "Create account",
      submitting: "Creating account...",
      assuranceTitle: "Why teams join early",
      assuranceBody:
        "Get a cleaner operating layer before more jobs, payments, and admin work make the process harder to untangle.",
    },
    verify: {
      eyebrow: "Verification required",
      title: "Check your email to finish setup.",
      body: "We sent a verification link to {{email}}. Open it to activate your workspace owner account.",
      resend: "Send another verification email",
      back: "Back to setup",
    },
    closing: {
      title: "Start running your business like a system.",
      body: "Replace scattered tools with one operating layer for jobs, customers, payments, and control.",
      cta: "Start Free",
    },
    errors: {
      companyRequired: "Please enter your company name.",
      emailRequired: "Please enter your work email.",
      emailInvalid: "Enter a valid email address.",
      termsRequired: "You must accept the Terms and Conditions to continue.",
      nameRequired: "Enter the owner full name.",
      passwordRequired: "Enter a password.",
    },
    terms: {
      title: "Terms & Conditions",
      updatedAt: "Updated April 15, 2026",
      intro:
        "These Terms and Conditions govern your use of ContractorFlow during the trial period and any paid subscription that follows.",
      close: "Close",
      sections: [
        {
          title: "Service usage",
          body: "You may use the platform to manage leads, scheduling, invoices, signatures, and related business workflows. You are responsible for submitted information and for protecting access to your workspace.",
        },
        {
          title: "Payment terms",
          body: "Paid plans renew on the billing interval shown at signup unless you cancel before renewal. Taxes, payment processing costs, and required local fees may apply.",
        },
        {
          title: "Cancellation policy",
          body: "You may cancel at any time. Cancellation stops future renewals, and access continues through the end of the current paid term unless a written agreement says otherwise.",
        },
        {
          title: "Data usage",
          body: "We use account and business data to operate the service, improve reliability, provide support, and meet legal or security obligations. We do not sell confidential customer records as standalone data products.",
        },
      ],
    },
  },
  es: {
    nav: {
      signIn: "Iniciar sesion",
      startFree: "Empieza gratis",
      demo: "Ver demo",
    },
    hero: {
      eyebrow: "Sistema operativo todo-en-uno para contratistas",
      title:
        "Gana mas trabajos y cobra mas rapido sin perder control del dia a dia.",
      body: "ContractorFlow le da a negocios de servicio un lugar para gestionar presupuestos, agenda, trabajos, facturas, pagos y visibilidad del negocio.",
      meta: "Sin tarjeta de credito · Configuracion guiada para negocios de servicio",
      bullets: [
        "Hecho para contratistas y negocios de servicio",
        "Controla el dinero que entra y sale",
        "Conecta oficina, campo y cobros",
      ],
      stats: [
        { value: "1 sistema", label: "para trabajos, facturas y pagos" },
        { value: "< 60 seg", label: "para reservar acceso fundador" },
        { value: "24/7", label: "de visibilidad del flujo de caja" },
      ],
    },
    social: {
      title: "Disenado para quienes de verdad operan negocios de servicio.",
      tags: [
        "Contratistas",
        "Equipos de paisajismo",
        "Negocios de servicio en campo",
        "Propietarios-operadores",
      ],
      stats: [
        { value: "Trabajo a cobro", label: "un flujo conectado" },
        { value: "Pagos integrados", label: "no pegados al final" },
        { value: "Mas control", label: "sobre agenda, cuadrillas y dinero" },
      ],
    },
    features: {
      kicker: "Flujo principal",
      title:
        "Todo lo necesario para ganar el trabajo, operar el negocio y cobrar antes.",
      items: [
        {
          title: "Gana mas trabajos",
          body: "Crea presupuestos rapido, organiza seguimiento y pasa el trabajo aprobado directo a la agenda.",
        },
        {
          title: "Dirige tu negocio",
          body: "Gestiona trabajos, cuadrillas, clientes y actividad del negocio desde un solo panel operativo.",
        },
        {
          title: "Cobra mas rapido",
          body: "Envia facturas, acepta pagos, sigue ingresos y mantente al dia con gastos y cuentas por pagar.",
        },
      ],
    },
    payments: {
      kicker: "Sistema de pagos",
      title: "Una forma mas limpia de manejar el dinero que entra y sale.",
      body: "Los pagos son parte del flujo, no una app financiera aparte. Factura clientes, cobra antes, sigue ingresos en vivo y controla gastos y cuentas desde el mismo sistema operativo.",
      bullets: [
        "Envia facturas apenas el trabajo esta listo",
        "Acepta pagos sin frenar la cobranza",
        "Sigue ingresos pagados, pendientes y vencidos",
        "Controla cuentas y gastos con contexto operativo",
      ],
      incomeLabel: "Ingresos esta semana",
      billsLabel: "Cuentas esta semana",
    },
    steps: {
      kicker: "Como funciona",
      title: "Un camino simple desde el alta del trabajo hasta cobrar antes.",
      items: [
        {
          title: "Agrega tus trabajos",
          body: "Empieza con trabajo entrante, presupuestos y trabajos confirmados sin una configuracion pesada.",
        },
        {
          title: "Gestiona todo en un lugar",
          body: "Mantiene conectados operaciones, clientes, cuadrillas y flujo financiero desde el mismo sistema.",
        },
        {
          title: "Cobra mas rapido",
          body: "Factura antes, sigue pagos en vivo y mantiene un control mas firme del flujo de caja.",
        },
      ],
    },
    founder: {
      kicker: "Acceso fundador",
      leadTitle: "Reserva acceso fundador",
      leadBody:
        "Empieza con los datos de tu negocio. Luego completa la configuracion segura de la cuenta propietaria abajo.",
      companyLabel: "Nombre de la empresa",
      companyPlaceholder: "North Ridge Landscaping",
      emailLabel: "Email de trabajo",
      emailPlaceholder: "owner@company.com",
      termsLead: "Acepto los",
      termsLink: "Terminos y Condiciones",
      continue: "Reservar acceso fundador",
      helper: "Registro seguro. Sin tarjeta de credito.",
      accountTitle: "Crea tu cuenta propietaria",
      accountBody:
        "Los datos de la empresa ya estan guardados. Agrega el perfil propietario para activar el espacio.",
      nameLabel: "Nombre completo del propietario",
      namePlaceholder: "Jordan Alvarez",
      passwordLabel: "Crea contrasena",
      passwordPlaceholder: "Elige una contrasena segura",
      summaryLabel: "Datos del negocio",
      edit: "Editar datos del negocio",
      submit: "Crear cuenta",
      submitting: "Creando cuenta...",
      assuranceTitle: "Por que entrar temprano",
      assuranceBody:
        "Consigue una capa operativa mas limpia antes de que mas trabajos, pagos y administracion hagan el proceso mas dificil de ordenar.",
    },
    verify: {
      eyebrow: "Verificacion requerida",
      title: "Revisa tu email para terminar la configuracion.",
      body: "Enviamos un enlace de verificacion a {{email}}. Abrelo para activar la cuenta propietaria del espacio.",
      resend: "Enviar otro email de verificacion",
      back: "Volver a la configuracion",
    },
    closing: {
      title: "Empieza a operar tu negocio como un sistema.",
      body: "Sustituye herramientas dispersas por una sola capa para trabajos, clientes, pagos y control.",
      cta: "Empieza gratis",
    },
    errors: {
      companyRequired: "Ingresa el nombre de tu empresa.",
      emailRequired: "Ingresa tu email de trabajo.",
      emailInvalid: "Ingresa un email valido.",
      termsRequired: "Debes aceptar los Terminos y Condiciones para continuar.",
      nameRequired: "Ingresa el nombre completo del propietario.",
      passwordRequired: "Ingresa una contrasena.",
    },
    terms: {
      title: "Terminos y Condiciones",
      updatedAt: "Actualizado el 15 de abril de 2026",
      intro:
        "Estos Terminos y Condiciones regulan el uso de ContractorFlow durante el periodo de prueba y cualquier suscripcion de pago posterior.",
      close: "Cerrar",
      sections: [
        {
          title: "Uso del servicio",
          body: "Puedes usar la plataforma para gestionar prospectos, agenda, facturas, firmas y flujos operativos relacionados. Eres responsable de la informacion enviada y de proteger el acceso a tu espacio.",
        },
        {
          title: "Terminos de pago",
          body: "Los planes pagos se renuevan segun el periodo mostrado al registrarte, salvo que canceles antes de la renovacion. Pueden aplicarse impuestos, costos de procesamiento y cargos locales obligatorios.",
        },
        {
          title: "Politica de cancelacion",
          body: "Puedes cancelar en cualquier momento. La cancelacion detiene futuras renovaciones y el acceso continua hasta el final del periodo pagado vigente, salvo indicacion distinta por escrito.",
        },
        {
          title: "Uso de datos",
          body: "Usamos datos de la cuenta y del negocio para operar el servicio, mejorar confiabilidad, brindar soporte y cumplir obligaciones legales o de seguridad. No vendemos registros confidenciales de clientes como productos independientes.",
        },
      ],
    },
  },
  pl: {
    nav: {
      signIn: "Zaloguj sie",
      startFree: "Zacznij za darmo",
      demo: "Zobacz demo",
    },
    hero: {
      eyebrow: "System operacyjny all-in-one dla wykonawcow",
      title:
        "Zdobywaj wiecej zlecen i szybciej odbieraj platnosci bez utraty kontroli nad codzienna praca.",
      body: "ContractorFlow daje firmom uslugowym jedno miejsce do wycen, harmonogramu, zlecen, faktur, platnosci i pelnej widocznosci biznesu.",
      meta: "Bez karty platniczej · Prowadzone wdrozenie dla firm uslugowych",
      bullets: [
        "Dla wykonawcow i firm uslugowych",
        "Kontrola pieniedzy wchodzacych i wychodzacych",
        "Biuro, teren i rozliczenia w jednym systemie",
      ],
      stats: [
        { value: "1 system", label: "dla zlecen, faktur i platnosci" },
        { value: "< 60 sek", label: "aby zarezerwowac dostep founderski" },
        { value: "24/7", label: "widocznosci cash flow" },
      ],
    },
    social: {
      title:
        "Zaprojektowane dla ludzi, ktorzy naprawde prowadza firmy uslugowe.",
      tags: [
        "Wykonawcy",
        "Ekipy landscapingowe",
        "Firmy field service",
        "Owner-operatorzy",
      ],
      stats: [
        { value: "Zlecenie do platnosci", label: "jeden polaczony workflow" },
        { value: "Platnosci w systemie", label: "a nie doklejone na koncu" },
        {
          value: "Wieksza kontrola",
          label: "nad grafikiem, ekipa i pieniedzmi",
        },
      ],
    },
    features: {
      kicker: "Glowny workflow",
      title:
        "Wszystko, czego potrzeba, aby wygrywac zlecenia, prowadzic biznes i szybciej odbierac platnosci.",
      items: [
        {
          title: "Zdobywaj wiecej zlecen",
          body: "Tworz wyceny szybciej, porzadkuj follow-up i przenos zatwierdzona prace prosto do harmonogramu.",
        },
        {
          title: "Prowadz swoj biznes",
          body: "Zarzadzaj zleceniami, ekipami, klientami i aktywnoscia firmy z jednego operacyjnego dashboardu.",
        },
        {
          title: "Odbieraj platnosci szybciej",
          body: "Wysylaj faktury, przyjmuj platnosci, sledz przychody i pilnuj wydatkow oraz rachunkow.",
        },
      ],
    },
    payments: {
      kicker: "System platnosci",
      title:
        "Czystszy sposob na ogarniecie pieniedzy wchodzacych i wychodzacych.",
      body: "Platnosci sa czescia workflow, a nie osobna aplikacja finansowa. Fakturuj klientow, odbieraj szybciej, sledz przychody na zywo i pilnuj kosztow oraz rachunkow z tego samego systemu.",
      bullets: [
        "Wysylaj faktury, gdy praca jest gotowa",
        "Przyjmuj platnosci bez spowalniania kolekcji",
        "Sledz przychody oplacone, oczekujace i przeterminowane",
        "Pilnuj rachunkow i wydatkow w kontekscie operacyjnym",
      ],
      incomeLabel: "Przychod w tym tygodniu",
      billsLabel: "Rachunki w tym tygodniu",
    },
    steps: {
      kicker: "Jak to dziala",
      title: "Prosta droga od dodania pracy do szybszej platnosci.",
      items: [
        {
          title: "Dodaj swoje zlecenia",
          body: "Zacznij od leadow, wycen i potwierdzonych prac bez ciezkiego wdrozenia.",
        },
        {
          title: "Zarzadzaj wszystkim w jednym miejscu",
          body: "Polacz operacje, klientow, ekipy i workflow finansowy w tym samym systemie.",
        },
        {
          title: "Odbieraj platnosci szybciej",
          body: "Fakturuj wczesniej, sledz status platnosci na zywo i trzymaj mocniejsza kontrole nad cash flow.",
        },
      ],
    },
    founder: {
      kicker: "Dostep founderski",
      leadTitle: "Zarezerwuj dostep founderski",
      leadBody:
        "Zacznij od danych firmy. Potem zakoncz bezpieczna konfiguracje konta wlasciciela ponizej.",
      companyLabel: "Nazwa firmy",
      companyPlaceholder: "North Ridge Landscaping",
      emailLabel: "Email firmowy",
      emailPlaceholder: "owner@company.com",
      termsLead: "Akceptuje",
      termsLink: "Warunki korzystania",
      continue: "Zarezerwuj dostep founderski",
      helper: "Bezpieczny signup. Bez karty platniczej.",
      accountTitle: "Utworz konto wlasciciela",
      accountBody:
        "Dane firmy sa juz zapisane. Dodaj profil wlasciciela, aby aktywowac workspace.",
      nameLabel: "Imie i nazwisko wlasciciela",
      namePlaceholder: "Jordan Alvarez",
      passwordLabel: "Utworz haslo",
      passwordPlaceholder: "Wybierz bezpieczne haslo",
      summaryLabel: "Dane firmy",
      edit: "Edytuj dane firmy",
      submit: "Utworz konto",
      submitting: "Tworzenie konta...",
      assuranceTitle: "Dlaczego wejsc wczesniej",
      assuranceBody:
        "Zdobadz czystsza warstwe operacyjna zanim wiecej zlecen, platnosci i administracji jeszcze bardziej skomplikuje proces.",
    },
    verify: {
      eyebrow: "Wymagana weryfikacja",
      title: "Sprawdz email, aby dokonczyc konfiguracje.",
      body: "Wyslalismy link weryfikacyjny na {{email}}. Otworz go, aby aktywowac konto wlasciciela workspace.",
      resend: "Wyslij kolejny email weryfikacyjny",
      back: "Wroc do konfiguracji",
    },
    closing: {
      title: "Prowadz biznes jak system.",
      body: "Zastap porozrzucane narzedzia jedna warstwa operacyjna dla zlecen, klientow, platnosci i kontroli.",
      cta: "Zacznij za darmo",
    },
    errors: {
      companyRequired: "Podaj nazwe firmy.",
      emailRequired: "Podaj email firmowy.",
      emailInvalid: "Podaj poprawny adres email.",
      termsRequired:
        "Musisz zaakceptowac Warunki korzystania, aby kontynuowac.",
      nameRequired: "Podaj imie i nazwisko wlasciciela.",
      passwordRequired: "Podaj haslo.",
    },
    terms: {
      title: "Warunki korzystania",
      updatedAt: "Zaktualizowano 15 kwietnia 2026",
      intro:
        "Te Warunki korzystania reguluja uzywanie ContractorFlow w okresie probnym oraz w kazdej platnej subskrypcji po nim.",
      close: "Zamknij",
      sections: [
        {
          title: "Korzystanie z uslugi",
          body: "Mozesz uzywac platformy do zarzadzania leadami, harmonogramem, fakturami, podpisami i powiazanymi workflow biznesowymi. Odpowiadasz za przesylane informacje oraz za ochrone dostepu do swojego workspace.",
        },
        {
          title: "Warunki platnosci",
          body: "Platne plany odnawiaja sie zgodnie z okresem pokazanym przy rejestracji, chyba ze anulujesz przed odnowieniem. Moga obowiazywac podatki, koszty przetwarzania platnosci oraz lokalne oplaty.",
        },
        {
          title: "Polityka anulowania",
          body: "Mozesz anulowac w dowolnym momencie. Anulowanie zatrzymuje przyszle odnowienia, a dostep trwa do konca biezacego okresu, chyba ze pisemna umowa stanowi inaczej.",
        },
        {
          title: "Wykorzystanie danych",
          body: "Uzywamy danych konta i firmy do prowadzenia uslugi, poprawy niezawodnosci, wsparcia oraz spelniania wymogow prawnych i bezpieczenstwa. Nie sprzedajemy poufnych danych klientow jako osobnych produktow.",
        },
      ],
    },
  },
};

function LogoMark() {
  return (
    <div className={styles.logoMark} aria-hidden="true">
      <span className={styles.logoStripe} />
      <span className={styles.logoDot} />
    </div>
  );
}

function MetricCard({ item }) {
  return (
    <div className={styles.metricCard}>
      <strong>{item.value}</strong>
      <span>{item.label}</span>
    </div>
  );
}

function ProductMockup({ copy }) {
  return (
    <div className={styles.mockupShell} id="product-demo">
      <div className={styles.mockupTopbar}>
        <div className={styles.trafficLights}>
          <span />
          <span />
          <span />
        </div>
        <div className={styles.mockupLabel}>Live operating system</div>
      </div>
      <div className={styles.mockupGrid}>
        <div className={styles.mockupSidebar}>
          <div className={styles.sidebarCard}>
            <span>Today</span>
            <strong>14 active jobs</strong>
          </div>
          <div className={styles.sidebarStack}>
            <span>Estimates</span>
            <span>Schedule</span>
            <span>Invoices</span>
            <span>Payments</span>
          </div>
        </div>
        <div className={styles.mockupMain}>
          <div className={styles.mockupPanelLarge}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.panelEyebrow}>Collections</span>
                <strong>$18,420</strong>
              </div>
              <span className={styles.panelDelta}>+12.4%</span>
            </div>
            <div className={styles.barChart}>
              <span style={{ height: "48%" }} />
              <span style={{ height: "68%" }} />
              <span style={{ height: "76%" }} />
              <span style={{ height: "88%" }} />
              <span style={{ height: "82%" }} />
              <span style={{ height: "100%" }} />
            </div>
          </div>
          <div className={styles.mockupRow}>
            <div className={styles.mockupPanelSmall}>
              <span className={styles.panelEyebrow}>
                {copy.payments.incomeLabel}
              </span>
              <strong>$7,260</strong>
              <small>12 invoices paid</small>
            </div>
            <div className={styles.mockupPanelMuted}>
              <span className={styles.panelEyebrow}>
                {copy.payments.billsLabel}
              </span>
              <strong>$2,180</strong>
              <small>4 vendor bills due</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentsPreview() {
  return (
    <div className={styles.paymentsPreview}>
      <div className={styles.paymentRail}>
        <div className={styles.paymentCardPrimary}>
          <span>Invoice sent</span>
          <strong>$1,280</strong>
          <small>Elm Street landscaping</small>
        </div>
        <div className={styles.paymentCardAccent}>
          <span>Payment received</span>
          <strong>$980</strong>
          <small>Bank transfer cleared</small>
        </div>
      </div>
      <div className={styles.paymentLedger}>
        <div className={styles.paymentLedgerRow}>
          <span>Client payments</span>
          <strong>+$5,420</strong>
        </div>
        <div className={styles.paymentLedgerRow}>
          <span>Open invoices</span>
          <strong>$3,800</strong>
        </div>
        <div className={styles.paymentLedgerRow}>
          <span>Vendor bills</span>
          <strong>-$1,240</strong>
        </div>
        <div className={styles.paymentDivider} />
        <div className={styles.paymentLedgerRowStrong}>
          <span>Net cash position</span>
          <strong>$4,180</strong>
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ message }) {
  if (!message) return null;
  return <div className={styles.errorBanner}>{message}</div>;
}

function VerifyCard({
  copy,
  pendingEmail,
  onResendVerification,
  onBackToSetup,
  submitting,
}) {
  return (
    <div className={styles.formCard} id="founder-access">
      <span className={styles.formKicker}>{copy.verify.eyebrow}</span>
      <h3>{copy.verify.title}</h3>
      <p>
        {copy.verify.body.replace("{{email}}", pendingEmail || "your email")}
      </p>
      <div className={styles.verifyIcon}>✉️</div>
      <button
        className={styles.primaryButtonLarge}
        disabled={submitting}
        onClick={onResendVerification}
        type="button"
      >
        {submitting ? "..." : copy.verify.resend}
      </button>
      <button
        className={styles.secondaryButtonLarge}
        onClick={onBackToSetup}
        type="button"
      >
        {copy.verify.back}
      </button>
    </div>
  );
}

export default function OnboardingEntrySection({
  initialValues,
  registerValues,
  signupStage,
  mode,
  error,
  submitting,
  pendingEmail,
  onStartTrial,
  onRegisterFieldChange,
  onSubmitRegister,
  onBackToSetup,
  onResendVerification,
  languageOptions,
  selectedLanguage,
  onLanguageChange,
}) {
  const copy = useMemo(
    () => COPY[selectedLanguage] || COPY.en,
    [selectedLanguage],
  );

  const trackCta = (eventName, metadata = {}) => {
    trackMarketingEvent(eventName, {
      language: selectedLanguage,
      mode,
      signupStage,
      ...metadata,
    });
  };

  const scrollToSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleStartFreeClick = (placement) => {
    trackCta("landing_start_free_click", { placement });
    scrollToSection("founder-access");
  };

  const handleDemoClick = (placement) => {
    trackCta("landing_demo_click", { placement });
    scrollToSection("product-demo");
  };

  const handleFounderFormFocus = () => {
    trackCta("landing_founder_form_view", {
      placement: accountStage ? "founder_account" : "founder_lead",
    });
  };

  const [leadForm, setLeadForm] = useState({
    companyName: initialValues?.companyName || "",
    email: initialValues?.email || "",
    agreed: false,
  });
  const [errors, setErrors] = useState({});
  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => {
    setLeadForm((current) => ({
      ...current,
      companyName: initialValues?.companyName ?? current.companyName,
      email: initialValues?.email ?? current.email,
    }));
  }, [initialValues?.companyName, initialValues?.email]);

  const accountStage = mode === "verify-email" || signupStage === "account";

  const updateLeadField = (field, value) => {
    setLeadForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      delete next.terms;
      return next;
    });
  };

  const handleLeadSubmit = (event) => {
    event.preventDefault();
    const nextErrors = {};
    const companyName = leadForm.companyName.trim();
    const email = leadForm.email.trim();

    if (!companyName) nextErrors.companyName = copy.errors.companyRequired;
    if (!email) nextErrors.email = copy.errors.emailRequired;
    else if (!EMAIL_PATTERN.test(email))
      nextErrors.email = copy.errors.emailInvalid;
    if (!leadForm.agreed) nextErrors.terms = copy.errors.termsRequired;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    trackCta("founder_access_submit", {
      placement: "founder_form_lead",
    });
    onStartTrial?.({ companyName, email });
  };

  const handleAccountSubmit = (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!String(registerValues?.name || "").trim()) {
      nextErrors.name = copy.errors.nameRequired;
    }
    if (!String(registerValues?.password || "").trim()) {
      nextErrors.password = copy.errors.passwordRequired;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    trackCta("founder_access_account_submit", {
      placement: "founder_form_account",
    });
    onSubmitRegister?.();
  };

  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlowTop} />
      <div className={styles.backgroundGlowBottom} />

      <header className={styles.header}>
        <div className={styles.containerWide}>
          <div className={styles.navbar}>
            <a className={styles.brand} href="#top">
              <LogoMark />
              <span>ContractorFlow</span>
            </a>
            <div className={styles.navActions}>
              <fieldset className={styles.languageSwitch}>
                {languageOptions.map((option) => (
                  <button
                    className={
                      selectedLanguage === option.value
                        ? styles.languageButtonActive
                        : styles.languageButton
                    }
                    key={option.value}
                    onClick={() => {
                      trackCta("landing_language_switch", {
                        placement: "header",
                        selected: option.value,
                      });
                      onLanguageChange(option.value);
                    }}
                    type="button"
                  >
                    {String(option.value || "").toUpperCase()}
                  </button>
                ))}
              </fieldset>
              <a className={styles.ghostLink} href="/login">
                {copy.nav.signIn}
              </a>
              <button
                className={styles.primaryButton}
                onClick={() => handleStartFreeClick("header")}
                type="button"
              >
                {copy.nav.startFree}
              </button>
            </div>
          </div>
        </div>
      </header>

      <section className={styles.heroSection} id="top">
        <div className={styles.containerWide}>
          <div className={styles.heroLayout}>
            <div className={styles.heroContent}>
              <span className={styles.eyebrow}>{copy.hero.eyebrow}</span>
              <h1>{copy.hero.title}</h1>
              <p className={styles.heroBody}>{copy.hero.body}</p>
              <div className={styles.heroActions}>
                <button
                  className={styles.primaryButtonLarge}
                  onClick={() => handleStartFreeClick("hero")}
                  type="button"
                >
                  {copy.nav.startFree}
                </button>
                <button
                  className={styles.secondaryButtonLarge}
                  onClick={() => handleDemoClick("hero")}
                  type="button"
                >
                  {copy.nav.demo}
                </button>
              </div>
              <div className={styles.heroMeta}>{copy.hero.meta}</div>
              <ul className={styles.heroBullets}>
                {copy.hero.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              <div className={styles.metricsRow}>
                {copy.hero.stats.map((item) => (
                  <MetricCard item={item} key={item.label} />
                ))}
              </div>
            </div>
            <ProductMockup copy={copy} />
          </div>
        </div>
      </section>

      <section className={styles.socialSection}>
        <div className={styles.containerWide}>
          <div className={styles.socialPanel}>
            <div>
              <span className={styles.sectionKicker}>Trusted fit</span>
              <h2>{copy.social.title}</h2>
              <div className={styles.socialTags}>
                {copy.social.tags.map((tag) => (
                  <span className={styles.socialTag} key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className={styles.socialStats}>
              {copy.social.stats.map((item) => (
                <div className={styles.socialStatCard} key={item.label}>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.featureSection}>
        <div className={styles.container}>
          <div className={styles.sectionHeadingCenter}>
            <span className={styles.sectionKicker}>{copy.features.kicker}</span>
            <h2>{copy.features.title}</h2>
          </div>
          <div className={styles.featureGrid}>
            {copy.features.items.map((item, index) => (
              <article className={styles.featureCard} key={item.title}>
                <div className={styles.featureIcon}>{index + 1}</div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.paymentsSection}>
        <div className={styles.containerWide}>
          <div className={styles.paymentsLayout}>
            <div>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionKicker}>
                  {copy.payments.kicker}
                </span>
                <h2>{copy.payments.title}</h2>
              </div>
              <p className={styles.sectionBody}>{copy.payments.body}</p>
              <ul className={styles.paymentBullets}>
                {copy.payments.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </div>
            <PaymentsPreview />
          </div>
        </div>
      </section>

      <section className={styles.stepsSection}>
        <div className={styles.container}>
          <div className={styles.sectionHeadingCenter}>
            <span className={styles.sectionKicker}>{copy.steps.kicker}</span>
            <h2>{copy.steps.title}</h2>
          </div>
          <div className={styles.stepsRow}>
            {copy.steps.items.map((item, index) => (
              <article className={styles.stepCard} key={item.title}>
                <span className={styles.stepNumber}>0{index + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.founderSection} id="founder-access">
        <div className={styles.containerWide}>
          <div className={styles.founderPanel}>
            <div className={styles.founderIntro}>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionKicker}>
                  {copy.founder.kicker}
                </span>
                <h2>
                  {accountStage
                    ? copy.founder.accountTitle
                    : copy.founder.leadTitle}
                </h2>
              </div>
              <p className={styles.sectionBody}>
                {accountStage
                  ? copy.founder.accountBody
                  : copy.founder.leadBody}
              </p>
              <div className={styles.assuranceCard}>
                <strong>{copy.founder.assuranceTitle}</strong>
                <span>{copy.founder.assuranceBody}</span>
              </div>
            </div>

            {mode === "verify-email"
              ? <VerifyCard
                  copy={copy}
                  onBackToSetup={onBackToSetup}
                  onResendVerification={onResendVerification}
                  pendingEmail={pendingEmail}
                  submitting={submitting}
                />
              : accountStage
                ? <form
                    className={styles.formCard}
                    id="signup-card"
                    onSubmit={handleAccountSubmit}
                  >
                    <ErrorBanner message={error} />
                    <div className={styles.summaryCard}>
                      <div>
                        <span>{copy.founder.summaryLabel}</span>
                        <strong>
                          {registerValues?.companyName || leadForm.companyName}
                        </strong>
                        <small>{registerValues?.email || leadForm.email}</small>
                      </div>
                      <button
                        className={styles.textButton}
                        onClick={onBackToSetup}
                        type="button"
                      >
                        {copy.founder.edit}
                      </button>
                    </div>
                    <label className={styles.fieldLabel}>
                      <span>{copy.founder.nameLabel}</span>
                      <input
                        id="register-name-input"
                        onChange={(event) =>
                          onRegisterFieldChange("name", event.target.value)
                        }
                        placeholder={copy.founder.namePlaceholder}
                        type="text"
                        value={registerValues?.name || ""}
                      />
                      {errors.name
                        ? <em className={styles.fieldError}>{errors.name}</em>
                        : null}
                    </label>
                    <label className={styles.fieldLabel}>
                      <span>{copy.founder.passwordLabel}</span>
                      <input
                        onChange={(event) =>
                          onRegisterFieldChange("password", event.target.value)
                        }
                        placeholder={copy.founder.passwordPlaceholder}
                        type="password"
                        value={registerValues?.password || ""}
                      />
                      {errors.password
                        ? <em className={styles.fieldError}>
                            {errors.password}
                          </em>
                        : null}
                    </label>
                    <button
                      className={styles.primaryButtonLarge}
                      disabled={submitting}
                      type="submit"
                    >
                      {submitting
                        ? copy.founder.submitting
                        : copy.founder.submit}
                    </button>
                  </form>
                : <form
                    className={styles.formCard}
                    onFocus={handleFounderFormFocus}
                    onSubmit={handleLeadSubmit}
                  >
                    <ErrorBanner message={error} />
                    <label className={styles.fieldLabel}>
                      <span>{copy.founder.companyLabel}</span>
                      <input
                        onChange={(event) =>
                          updateLeadField("companyName", event.target.value)
                        }
                        placeholder={copy.founder.companyPlaceholder}
                        type="text"
                        value={leadForm.companyName}
                      />
                      {errors.companyName
                        ? <em className={styles.fieldError}>
                            {errors.companyName}
                          </em>
                        : null}
                    </label>
                    <label className={styles.fieldLabel}>
                      <span>{copy.founder.emailLabel}</span>
                      <input
                        onChange={(event) =>
                          updateLeadField("email", event.target.value)
                        }
                        placeholder={copy.founder.emailPlaceholder}
                        type="email"
                        value={leadForm.email}
                      />
                      {errors.email
                        ? <em className={styles.fieldError}>{errors.email}</em>
                        : null}
                    </label>
                    <label className={styles.checkboxRow}>
                      <input
                        checked={leadForm.agreed}
                        onChange={(event) =>
                          updateLeadField("agreed", event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>
                        {copy.founder.termsLead}{" "}
                        <button
                          className={styles.inlineLinkButton}
                          onClick={() => setShowTerms(true)}
                          type="button"
                        >
                          {copy.founder.termsLink}
                        </button>
                      </span>
                    </label>
                    {errors.terms
                      ? <em className={styles.fieldError}>{errors.terms}</em>
                      : null}
                    <button
                      className={styles.primaryButtonLarge}
                      disabled={submitting}
                      type="submit"
                    >
                      {copy.founder.continue}
                    </button>
                    <small className={styles.formNote}>
                      {copy.founder.helper}
                    </small>
                  </form>}
          </div>
        </div>
      </section>

      <section className={styles.closingSection}>
        <div className={styles.container}>
          <div className={styles.closingCard}>
            <h2>{copy.closing.title}</h2>
            <p>{copy.closing.body}</p>
            <button
              className={styles.primaryButtonLarge}
              onClick={() => handleStartFreeClick("closing")}
              type="button"
            >
              {copy.closing.cta}
            </button>
          </div>
        </div>
      </section>

      <div className={styles.mobileActionBar}>
        <button
          className={styles.mobilePrimaryButton}
          onClick={() => handleStartFreeClick("mobile_bar")}
          type="button"
        >
          {copy.nav.startFree}
        </button>
        <a className={styles.mobileGhostLink} href="/login">
          {copy.nav.signIn}
        </a>
      </div>

      <TermsConditionsModal
        content={copy.terms}
        onClose={() => setShowTerms(false)}
        open={showTerms}
      />
    </main>
  );
}
