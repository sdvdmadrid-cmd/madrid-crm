const SUPPORTED_LANGUAGES = ["en", "es", "pl"];

function normalizeLanguage(language) {
  const value = String(language || "en").toLowerCase();
  const matched = SUPPORTED_LANGUAGES.find(
    (candidate) => value === candidate || value.startsWith(`${candidate}-`),
  );
  return matched || "en";
}

const ONBOARDING_COPY = {
  en: {
    topBadge: "Built for service teams",
    heroKicker: "From first site visit to final payment",
    heroTitle:
      "Close more jobs, manage clients, get paid without office chaos.",
    heroBody:
      "ContractorFlow gives landscaping companies, field crews, and service businesses one operating system for estimates, scheduling, signatures, invoices, bill payments, and follow-up.",
    contractorStrip: [
      "Built for contractors",
      "Landscape-ready workflows",
      "Office + field in sync",
    ],
    pricingLabel: "Founder rate",
    pricingValue: "$34.99/mo locked in",
    pricingNote:
      "Keep your launch pricing for as long as the workspace stays active.",
    urgencyLabel: "Current launch wave",
    spotsLeftSuffix: "spots left",
    progressSuffix: "founder spots claimed",
    progressCaption:
      "We open access in small batches so every new company gets a tighter setup experience.",
    featureIntroBadge: "What the platform covers",
    featureTitle:
      "Built to run the work that starts in the yard and ends when the invoice is paid.",
    featureCards: [
      {
        icon: "pipeline",
        eyebrow: "Win the work",
        title: "Turn inbound leads into booked jobs faster.",
        body: "Track inquiries, build polished estimates, and send approvals before the next crew slot disappears.",
      },
      {
        icon: "crew",
        eyebrow: "Run the day",
        title: "Keep the office, crews, and clients on the same page.",
        body: "Schedules, customer details, signed scopes, and job status all stay in one place instead of scattered across calls and texts.",
      },
      {
        icon: "payment",
        eyebrow: "Collect faster",
        title:
          "Invoice cleanly, pay vendors, and chase less money at the end of the job.",
        body: "Send invoices, centralize bill payments, capture approvals, and keep money movement tied to the work that was actually delivered.",
      },
    ],
    signup: {
      leadEyebrow: "Start your workspace",
      leadTitle: "Reserve founder access for your company.",
      leadIntro:
        "Enter the business details first. Then we will open the secure owner account setup below.",
      companyLabel: "Company name",
      companyPlaceholder: "North Ridge Landscaping",
      emailLabel: "Work email",
      emailPlaceholder: "owner@company.com",
      termsLead: "I agree to the",
      termsLink: "Terms and Conditions",
      continueLabel: "Continue to secure setup",
      helper:
        "No card required here. We use this to prepare your workspace and hold your founder rate.",
      accountEyebrow: "Finish account setup",
      accountTitle: "Create the owner login for your workspace.",
      accountIntro:
        "Your company details are saved below. Add the owner profile to activate the account.",
      summaryLabel: "Workspace details",
      editLabel: "Edit company details",
      nameLabel: "Owner full name",
      namePlaceholder: "Jordan Alvarez",
      passwordLabel: "Create password",
      passwordPlaceholder: "Choose a secure password",
      submitLabel: "Create workspace",
      submittingLabel: "Creating workspace...",
      secureNote:
        "Secure signup. Email verification may be required before the first login.",
    },
    verify: {
      eyebrow: "One more step",
      title: "Check your email to finish setup.",
      body: "We sent a verification link to {{email}}. Open it to activate the workspace owner account.",
      resend: "Send another verification email",
      back: "Back to workspace setup",
    },
    errors: {
      companyRequired: "Please enter your company name.",
      emailRequired: "Please enter your work email.",
      emailInvalid: "Enter a valid email address.",
      termsRequired: "You must accept the Terms and Conditions to continue.",
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
        {
          title: "Liability disclaimer",
          body: "The platform is provided on an as-available basis. To the maximum extent permitted by law, ContractorFlow disclaims indirect, incidental, and consequential damages arising from outages, third-party integrations, or user-entered content.",
        },
      ],
    },
  },
  es: {
    topBadge: "Hecho para equipos de servicio",
    heroKicker: "Desde la primera visita hasta el pago final",
    heroTitle:
      "Cierra mas trabajos, gestiona clientes y cobra sin caos de oficina.",
    heroBody:
      "ContractorFlow le da a empresas de paisajismo, cuadrillas de campo y negocios de servicio un solo sistema para presupuestos, agenda, firmas, facturas, pago de facturas y seguimiento.",
    contractorStrip: [
      "Hecho para contratistas",
      "Flujos listos para paisajismo",
      "Oficina y campo sincronizados",
    ],
    pricingLabel: "Tarifa fundador",
    pricingValue: "$34.99/mes bloqueado",
    pricingNote:
      "Mantienes el precio de lanzamiento mientras tu espacio de trabajo siga activo.",
    urgencyLabel: "Oleada actual de lanzamiento",
    spotsLeftSuffix: "cupos disponibles",
    progressSuffix: "cupos de fundador reclamados",
    progressCaption:
      "Abrimos el acceso en lotes pequenos para que cada empresa nueva reciba una configuracion mas cercana.",
    featureIntroBadge: "Lo que cubre la plataforma",
    featureTitle:
      "Pensado para manejar el trabajo que empieza en la calle y termina cuando la factura queda pagada.",
    featureCards: [
      {
        icon: "pipeline",
        eyebrow: "Gana el trabajo",
        title:
          "Convierte contactos entrantes en trabajos agendados mas rapido.",
        body: "Sigue consultas, arma presupuestos claros y envia aprobaciones antes de perder el siguiente hueco de la cuadrilla.",
      },
      {
        icon: "crew",
        eyebrow: "Opera el dia",
        title: "Mantiene a oficina, cuadrillas y clientes en la misma pagina.",
        body: "Agenda, datos del cliente, alcances firmados y estado del trabajo viven en un solo lugar, no repartidos entre llamadas y mensajes.",
      },
      {
        icon: "payment",
        eyebrow: "Cobra antes",
        title:
          "Factura mejor, paga proveedores y persigue menos pagos al final del trabajo.",
        body: "Envia facturas, centraliza el pago de facturas, captura aprobaciones y vincula el seguimiento del dinero con el trabajo realmente realizado.",
      },
    ],
    signup: {
      leadEyebrow: "Empieza tu espacio",
      leadTitle: "Reserva acceso fundador para tu empresa.",
      leadIntro:
        "Primero ingresa los datos del negocio. Luego abriremos la configuracion segura de la cuenta propietaria debajo.",
      companyLabel: "Nombre de la empresa",
      companyPlaceholder: "North Ridge Landscaping",
      emailLabel: "Email de trabajo",
      emailPlaceholder: "owner@company.com",
      termsLead: "Acepto los",
      termsLink: "Terminos y Condiciones",
      continueLabel: "Continuar a la configuracion segura",
      helper:
        "Aqui no pedimos tarjeta. Usamos esto para preparar tu espacio y reservar tu tarifa de fundador.",
      accountEyebrow: "Termina la configuracion",
      accountTitle: "Crea el acceso propietario de tu espacio.",
      accountIntro:
        "Los datos de la empresa ya quedan guardados. Agrega el perfil propietario para activar la cuenta.",
      summaryLabel: "Datos del espacio",
      editLabel: "Editar datos de la empresa",
      nameLabel: "Nombre completo del propietario",
      namePlaceholder: "Jordan Alvarez",
      passwordLabel: "Crea una contrasena",
      passwordPlaceholder: "Elige una contrasena segura",
      submitLabel: "Crear espacio",
      submittingLabel: "Creando espacio...",
      secureNote:
        "Registro seguro. Puede requerirse verificacion por email antes del primer inicio de sesion.",
    },
    verify: {
      eyebrow: "Falta un paso",
      title: "Revisa tu email para terminar la configuracion.",
      body: "Enviamos un enlace de verificacion a {{email}}. Abrelo para activar la cuenta propietaria del espacio.",
      resend: "Enviar otro email de verificacion",
      back: "Volver a la configuracion del espacio",
    },
    errors: {
      companyRequired: "Ingresa el nombre de tu empresa.",
      emailRequired: "Ingresa tu email de trabajo.",
      emailInvalid: "Ingresa un email valido.",
      termsRequired: "Debes aceptar los Terminos y Condiciones para continuar.",
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
        {
          title: "Descargo de responsabilidad",
          body: "La plataforma se ofrece segun disponibilidad. En la maxima medida permitida por ley, ContractorFlow no responde por danos indirectos, incidentales o consecuentes derivados de caidas, integraciones de terceros o contenido ingresado por el usuario.",
        },
      ],
    },
  },
  pl: {
    topBadge: "Zbudowane dla zespolow uslugowych",
    heroKicker: "Od pierwszej wizyty do ostatniej platnosci",
    heroTitle:
      "Zdobywaj wiecej zlecen, pilnuj klientow i odbieraj platnosci bez chaosu w biurze.",
    heroBody:
      "ContractorFlow daje firmom ogrodniczym, ekipom terenowym i biznesom uslugowym jeden system do wycen, harmonogramu, podpisow, faktur, platnosci rachunkow i follow-upu.",
    contractorStrip: [
      "Dla wykonawcow",
      "Procesy gotowe pod landscaping",
      "Biuro i teren w jednym rytmie",
    ],
    pricingLabel: "Stawka founderska",
    pricingValue: "$34.99/mies. na stale",
    title:
      "Fakturuj sprawnie, oplacaj dostawcow i scigaj mniej platnosci po zakonczonej pracy.",
    body: "Wysylaj faktury, centralizuj platnosci rachunkow, zbieraj akceptacje i trzymaj follow-up pieniedzy przy pracy, ktora faktycznie zostala wykonana.",
    urgencyLabel: "Aktualna pula startowa",
    spotsLeftSuffix: "miejsc zostalo",
    progressSuffix: "miejsc founderskich zajetych",
    progressCaption:
      "Otwieramy dostep partiami, aby kazda nowa firma dostala bardziej bezposrednie wdrozenie.",
    featureIntroBadge: "Co obejmuje platforma",
    featureTitle:
      "Zaprojektowane do prowadzenia pracy od pierwszego telefonu do oplaconej faktury.",
    featureCards: [
      {
        icon: "pipeline",
        eyebrow: "Zdobywaj zlecenia",
        title: "Zamieniaj nowe zapytania w zabookowane prace szybciej.",
        body: "Prowadz zapytania, tworz czytelne wyceny i wysylaj akceptacje zanim zniknie kolejne okno dla ekipy.",
      },
      {
        icon: "crew",
        eyebrow: "Prowadz dzien",
        title: "Biuro, ekipy i klienci pracuja na tych samych informacjach.",
        body: "Harmonogram, dane klienta, podpisane zakresy i status pracy sa w jednym miejscu zamiast w telefonach i wiadomosciach.",
      },
      {
        icon: "payment",
        eyebrow: "Szybciej odbieraj platnosci",
        title:
          "Fakturuj czysto i ogranicz pogonie za naleznosciami po zakonczeniu pracy.",
        body: "Wysylaj faktury, zbieraj akceptacje i lacz follow-up platnosci z faktycznie wykonana praca.",
      },
    ],
    signup: {
      leadEyebrow: "Uruchom swoj workspace",
      leadTitle: "Zarezerwuj founderski dostep dla swojej firmy.",
      leadIntro:
        "Najpierw podaj dane firmy. Potem otworzymy bezpieczna konfiguracje konta wlasciciela nizej.",
      companyLabel: "Nazwa firmy",
      companyPlaceholder: "North Ridge Landscaping",
      emailLabel: "Email firmowy",
      emailPlaceholder: "owner@company.com",
      termsLead: "Akceptuje",
      termsLink: "Warunki korzystania",
      continueLabel: "Przejdz do bezpiecznej konfiguracji",
      helper:
        "Nie prosimy tu o karte. Uzywamy tych danych, aby przygotowac workspace i przypiac cene founderska.",
      accountEyebrow: "Dokoncz konfiguracje",
      accountTitle: "Utworz login wlasciciela workspace.",
      accountIntro:
        "Dane firmy sa juz zapisane. Dodaj profil wlasciciela, aby aktywowac konto.",
      summaryLabel: "Dane workspace",
      editLabel: "Edytuj dane firmy",
      nameLabel: "Imie i nazwisko wlasciciela",
      namePlaceholder: "Jordan Alvarez",
      passwordLabel: "Utworz haslo",
      passwordPlaceholder: "Wybierz bezpieczne haslo",
      submitLabel: "Utworz workspace",
      submittingLabel: "Tworzenie workspace...",
      secureNote:
        "Bezpieczna rejestracja. Weryfikacja email moze byc wymagana przed pierwszym logowaniem.",
    },
    verify: {
      eyebrow: "Jeszcze jeden krok",
      title: "Sprawdz email, aby dokonczyc konfiguracje.",
      body: "Wyslalismy link weryfikacyjny na {{email}}. Otworz go, aby aktywowac konto wlasciciela workspace.",
      resend: "Wyslij kolejny email weryfikacyjny",
      back: "Wroc do konfiguracji workspace",
    },
    errors: {
      companyRequired: "Podaj nazwe firmy.",
      emailRequired: "Podaj email firmowy.",
      emailInvalid: "Podaj poprawny adres email.",
      termsRequired:
        "Musisz zaakceptowac Warunki korzystania, aby kontynuowac.",
    },
    terms: {
      title: "Warunki korzystania",
      updatedAt: "Zaktualizowano 15 kwietnia 2026",
      intro:
        "Niniejsze Warunki korzystania reguluja korzystanie z ContractorFlow w okresie probnym i podczas kazdej pozniejszej platnej subskrypcji.",
      close: "Zamknij",
      sections: [
        {
          title: "Korzystanie z uslugi",
          body: "Mozesz korzystac z platformy do obslugi leadow, harmonogramu, faktur, podpisow i powiazanych procesow biznesowych. Odpowiadasz za przesylane informacje oraz za bezpieczenstwo dostepu do workspace.",
        },
        {
          title: "Warunki platnosci",
          body: "Platne plany odnawiaja sie zgodnie z okresem rozliczeniowym pokazanym przy rejestracji, chyba ze anulujesz subskrypcje przed odnowieniem. Moga obowiazywac podatki, koszty platnosci i lokalne oplaty wymagane prawem.",
        },
        {
          title: "Polityka anulowania",
          body: "Mozesz anulowac w dowolnym momencie. Anulowanie zatrzymuje przyszle odnowienia, a dostep trwa do konca oplaconego okresu, chyba ze pisemna umowa stanowi inaczej.",
        },
        {
          title: "Wykorzystanie danych",
          body: "Wykorzystujemy dane konta i firmy do dzialania uslugi, poprawy niezawodnosci, wsparcia oraz realizacji obowiazkow prawnych i bezpieczenstwa. Nie sprzedajemy poufnych danych klientow jako samodzielnych produktow danych.",
        },
        {
          title: "Wylaczenie odpowiedzialnosci",
          body: "Platforma jest udostepniana w stanie dostepnosci. W maksymalnym zakresie dopuszczonym przez prawo ContractorFlow nie odpowiada za szkody posrednie, uboczne ani wynikowe zwiazane z awariami, integracjami zewnetrznymi lub tresciami dodanymi przez uzytkownika.",
        },
      ],
    },
  },
};

export function getOnboardingCopy(language) {
  return ONBOARDING_COPY[normalizeLanguage(language)];
}
