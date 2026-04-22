"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import GoogleIntegrationSection from "@/components/GoogleIntegrationSection";
import PlacesAutocomplete from "@/components/PlacesAutocomplete";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import {
  computeEstimateFinancials,
  getUsStateLabel,
  US_STATE_OPTIONS,
} from "@/lib/estimate-pricing";
import { sanitizeSearchInput } from "@/lib/input-sanitizer";
import { supabase } from "@/lib/supabase";

const initialClient = {
  name: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  zip: "",
  service: "",
  notes: "",
  price: "",
  leadStatus: "new_lead",
};

const initialJob = {
  title: "",
  clientId: "",
  clientName: "",
  service: "",
  status: "Pending",
  price: "",
  dueDate: "",
  taxState: "TX",
  downPaymentPercent: "0",
};

const initialInvoice = {
  invoiceNumber: "",
  clientId: "",
  clientName: "",
  jobId: "",
  invoiceTitle: "",
  amount: "",
  dueDate: "",
  status: "Unpaid",
  preferredPaymentMethod: "bank_transfer",
  lineItemsText: "",
  notes: "",
};

const PAYMENT_METHOD_LABELS = {
  en: {
    bank_transfer: "Bank transfer",
    credit_card: "Credit card",
    debit_card: "Debit card",
    cash: "Cash",
    check: "Check",
    zelle: "Zelle",
    venmo: "Venmo",
    paypal: "PayPal",
    other: "Other",
  },
  es: {
    bank_transfer: "Transferencia bancaria",
    credit_card: "Tarjeta de credito",
    debit_card: "Tarjeta de debito",
    cash: "Efectivo",
    check: "Cheque",
    zelle: "Zelle",
    venmo: "Venmo",
    paypal: "PayPal",
    other: "Otro",
  },
  pl: {
    bank_transfer: "Przelew bankowy",
    credit_card: "Karta kredytowa",
    debit_card: "Karta debetowa",
    cash: "Gotowka",
    check: "Czek",
    zelle: "Zelle",
    venmo: "Venmo",
    paypal: "PayPal",
    other: "Inne",
  },
};

const paymentMethodLabel = (value, language = "en") => {
  const labels = PAYMENT_METHOD_LABELS[language] || PAYMENT_METHOD_LABELS.en;
  return labels[value] || labels.other;
};

const REFERENCE_REQUIRED_METHODS = new Set([
  "bank_transfer",
  "credit_card",
  "debit_card",
  "check",
  "zelle",
  "venmo",
  "paypal",
]);

const NOTES_REQUIRED_METHODS = new Set(["cash", "other"]);

const todayIso = () => new Date().toISOString().slice(0, 10);

const clampInvoiceDueDays = (value) => {
  const parsed = Number.parseInt(String(value || "14"), 10);
  if (!Number.isFinite(parsed)) return 14;
  return Math.max(1, Math.min(120, parsed));
};

const normalizePhoneInput = (value) =>
  String(value || "")
    .trim()
    .replace(/[^\d+]/g, "");

const dueDateFromDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + clampInvoiceDueDays(days));
  return date.toISOString().slice(0, 10);
};

const getDefaultJobForm = (profile = initialCompanyProfile) => ({
  ...initialJob,
  taxState: profile?.defaultTaxState || "TX",
});

const getDefaultInvoiceForm = (profile = initialCompanyProfile) => ({
  ...initialInvoice,
  dueDate: dueDateFromDays(profile?.defaultInvoiceDueDays),
});

const initialPaymentDraft = (invoice) => ({
  amount: String(invoice.balanceDue || invoice.amount || ""),
  method: invoice.preferredPaymentMethod || "bank_transfer",
  date: todayIso(),
  reference: "",
  notes: "",
});

const formatInvoiceLineItems = (lineItems = []) =>
  Array.isArray(lineItems)
    ? lineItems
        .map((item) => {
          const label = String(item?.label || "").trim();
          const details = String(item?.details || "").trim();
          const amount = String(item?.amount || "").trim();
          if (!label && !details && !amount) {
            return "";
          }

          const left = [label, details].filter(Boolean).join(" - ");
          return amount ? `${left} | $${amount}` : left;
        })
        .filter(Boolean)
        .join("\n")
    : "";

const parseInvoiceLineItems = (value = "") =>
  String(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [leftPart, rightPart = ""] = line.split("|");
      const [label, ...detailParts] = leftPart.split(" - ");
      return {
        id: `manual-${index + 1}`,
        label: String(label || "").trim(),
        details: detailParts.join(" - ").trim(),
        amount: String(rightPart || "").replace(/[^0-9.]/g, ""),
      };
    });

const CONTRACT_TEMPLATE_LIBRARY = {
  patios: {
    label: { en: "Patios", es: "Patios", pl: "Tarasy" },
    options: {
      patio_maintenance: {
        label: {
          en: "Patio Maintenance",
          es: "Mantenimiento de patio",
          pl: "Utrzymanie tarasu",
        },
        scope: {
          en: "Routine patio cleaning, weed control, edge cleanup, and surface inspection.",
          es: "Limpieza rutinaria del patio, control de maleza, limpieza de bordes e inspeccion de superficies.",
          pl: "Rutynowe czyszczenie tarasu, usuwanie chwastow, czyszczenie krawedzi i kontrola powierzchni.",
        },
        terms: {
          en: [
            "Service covers visible patio areas and normal debris removal.",
            "Repairs outside standard maintenance are billed separately.",
          ],
          es: [
            "El servicio cubre areas visibles del patio y remocion normal de residuos.",
            "Las reparaciones fuera del mantenimiento estandar se cobran por separado.",
          ],
          pl: [
            "Usluga obejmuje widoczne obszary tarasu i standardowe usuwanie zanieczyszczen.",
            "Naprawy wykraczajace poza standardowe utrzymanie sa rozliczane osobno.",
          ],
        },
      },
      paver_installation: {
        label: {
          en: "Paver Installation",
          es: "Instalacion de adoquines",
          pl: "Montaz kostki brukowej",
        },
        scope: {
          en: "Layout preparation, base installation, paver placement, compaction, and finishing.",
          es: "Preparacion del trazado, instalacion de base, colocacion de adoquines, compactacion y acabado.",
          pl: "Przygotowanie ukladu, wykonanie podbudowy, ulozenie kostki, zageszczenie i wykonczenie.",
        },
        terms: {
          en: [
            "Material selection must be approved before installation.",
            "Subsurface issues may require a written change order.",
          ],
          es: [
            "La seleccion de materiales debe aprobarse antes de la instalacion.",
            "Problemas del subsuelo pueden requerir una orden de cambio por escrito.",
          ],
          pl: [
            "Wybor materialow musi zostac zatwierdzony przed montazem.",
            "Problemy z podlozem moga wymagac pisemnej zmiany zakresu prac.",
          ],
        },
      },
      outdoor_upgrade: {
        label: {
          en: "Outdoor Upgrade",
          es: "Mejora exterior",
          pl: "Modernizacja przestrzeni zewnetrznej",
        },
        scope: {
          en: "Patio redesign, decorative improvements, and enhancement work for outdoor living areas.",
          es: "Redise�o de patio, mejoras decorativas y trabajos de mejora para areas exteriores.",
          pl: "Przebudowa tarasu, ulepszenia dekoracyjne i poprawa przestrzeni zewnetrznej.",
        },
        terms: {
          en: [
            "Design revisions after approval may affect cost and timeline.",
            "Customer must provide site access during scheduled work hours.",
          ],
          es: [
            "Cambios de dise�o despues de aprobar pueden afectar costo y tiempo.",
            "El cliente debe dar acceso al sitio durante el horario programado.",
          ],
          pl: [
            "Zmiany projektu po akceptacji moga wplynac na koszt i termin realizacji.",
            "Klient musi zapewnic dostep do miejsca prac w ustalonych godzinach.",
          ],
        },
      },
    },
  },
  snow_removal: {
    label: { en: "Snow Removal", es: "Remocion de nieve", pl: "Odsniezanie" },
    options: {
      driveway_service: {
        label: {
          en: "Residential Driveway Service",
          es: "Servicio de entrada residencial",
          pl: "Odsniezanie podjazdu",
        },
        scope: {
          en: "Snow plowing and de-icing for residential driveways, entry paths, and walkways.",
          es: "Limpieza de nieve y deshielo para entradas residenciales, accesos y pasillos.",
          pl: "Odsniezanie i odladzanie podjazdow, wejsc i chodnikow przy domu.",
        },
        terms: {
          en: [
            "Trigger depth and response windows follow the selected service level.",
            "Ice melt products are applied as needed and may be billed separately.",
          ],
          es: [
            "La profundidad minima y tiempos de respuesta siguen el nivel de servicio seleccionado.",
            "Los productos para deshielo se aplican segun necesidad y pueden cobrarse aparte.",
          ],
          pl: [
            "Prog opadow i czas reakcji zaleza od wybranego poziomu uslugi.",
            "Srodki do odladzania sa stosowane w razie potrzeby i moga byc rozliczane osobno.",
          ],
        },
      },
      seasonal_plan: {
        label: {
          en: "Seasonal Snow Plan",
          es: "Plan estacional de nieve",
          pl: "Sezonowy plan odsniezania",
        },
        scope: {
          en: "Recurring snow removal visits during the contracted winter season.",
          es: "Visitas recurrentes de remocion de nieve durante la temporada invernal contratada.",
          pl: "Regularne wizyty odsniezania w trakcie zakontraktowanego sezonu zimowego.",
        },
        terms: {
          en: [
            "Seasonal plans include multiple service events under one agreement.",
            "Emergency call-outs outside the agreed scope may incur additional charges.",
          ],
          es: [
            "Los planes estacionales incluyen multiples servicios bajo un solo acuerdo.",
            "Llamadas de emergencia fuera del alcance acordado pueden generar cargos adicionales.",
          ],
          pl: [
            "Plany sezonowe obejmuja wiele wizyt w ramach jednej umowy.",
            "Pilne wyjazdy poza uzgodniony zakres moga powodowac dodatkowe oplaty.",
          ],
        },
      },
      commercial_lot: {
        label: {
          en: "Commercial Lot Clearing",
          es: "Limpieza de estacionamiento comercial",
          pl: "Odsniezanie parkingu komercyjnego",
        },
        scope: {
          en: "Parking lot clearing, sidewalk treatment, and priority access routes for commercial sites.",
          es: "Limpieza de estacionamientos, tratamiento de aceras y rutas prioritarias en sitios comerciales.",
          pl: "Odsniezanie parkingow, zabezpieczenie chodnikow i drog priorytetowych dla obiektow komercyjnych.",
        },
        terms: {
          en: [
            "Service sequencing is based on weather severity and site priority.",
            "Vehicles and obstacles must be moved to allow complete clearing.",
          ],
          es: [
            "La secuencia del servicio depende de la severidad del clima y prioridad del sitio.",
            "Vehiculos y obstaculos deben moverse para permitir una limpieza completa.",
          ],
          pl: [
            "Kolejnosc realizacji zalezy od warunkow pogodowych i priorytetu obiektu.",
            "Pojazdy i przeszkody musza zostac usuniete, aby umozliwic pelne odsniezenie.",
          ],
        },
      },
    },
  },
  house_cleaning: {
    label: {
      en: "House Cleaning",
      es: "Limpieza de casas",
      pl: "Sprzatanie domow",
    },
    options: {
      standard_cleaning: {
        label: {
          en: "Standard Cleaning",
          es: "Limpieza estandar",
          pl: "Sprzatanie standardowe",
        },
        scope: {
          en: "Routine cleaning of kitchens, bathrooms, floors, dusting, and general tidying.",
          es: "Limpieza rutinaria de cocina, ba�os, pisos, polvo y orden general.",
          pl: "Rutynowe sprzatanie kuchni, lazienek, podlog, odkurzanie kurzu i ogolne porzadkowanie.",
        },
        terms: {
          en: [
            "Service covers normally accessible surfaces only.",
            "Excessive buildup or specialty cleaning is quoted separately.",
          ],
          es: [
            "El servicio cubre solo superficies normalmente accesibles.",
            "Acumulacion excesiva o limpieza especial se cotiza por separado.",
          ],
          pl: [
            "Usluga obejmuje tylko normalnie dostepne powierzchnie.",
            "Silne zabrudzenia lub sprzatanie specjalistyczne sa wyceniane osobno.",
          ],
        },
      },
      deep_cleaning: {
        label: {
          en: "Deep Cleaning",
          es: "Limpieza profunda",
          pl: "Sprzatanie gruntowne",
        },
        scope: {
          en: "Detailed deep cleaning including baseboards, fixtures, high-touch surfaces, and buildup removal.",
          es: "Limpieza profunda detallada incluyendo zocalos, accesorios, superficies de alto contacto y eliminacion de acumulacion.",
          pl: "Dokladne sprzatanie gruntowne obejmujace listwy, armature, powierzchnie czesto dotykane i usuwanie nagromadzonego brudu.",
        },
        terms: {
          en: [
            "Deep cleaning timelines may vary depending on property condition.",
            "Specialty products can be requested in advance.",
          ],
          es: [
            "Los tiempos de limpieza profunda pueden variar segun la condicion de la propiedad.",
            "Productos especiales pueden solicitarse con anticipacion.",
          ],
          pl: [
            "Czas sprzatania gruntownego moze sie roznic w zaleznosci od stanu nieruchomosci.",
            "Specjalistyczne srodki moga zostac zamowione z wyprzedzeniem.",
          ],
        },
      },
      move_in_out: {
        label: {
          en: "Move-In / Move-Out Cleaning",
          es: "Limpieza de mudanza",
          pl: "Sprzatanie po wyprowadzce / przed wprowadzeniem",
        },
        scope: {
          en: "Comprehensive empty-home cleaning for turnovers, move-ins, or move-outs.",
          es: "Limpieza integral de vivienda vacia para entregas, mudanzas de entrada o salida.",
          pl: "Kompleksowe sprzatanie pustego domu lub mieszkania przed wprowadzeniem lub po wyprowadzce.",
        },
        terms: {
          en: [
            "Property should be vacant or mostly cleared before service begins.",
            "Appliance interiors are included only when accessible.",
          ],
          es: [
            "La propiedad debe estar vacia o casi despejada antes del servicio.",
            "El interior de electrodomesticos se incluye solo si esta accesible.",
          ],
          pl: [
            "Nieruchomosc powinna byc pusta lub prawie oprozniona przed rozpoczeciem uslugi.",
            "Wnetrza urzadzen AGD sa uwzgledniane tylko przy zapewnionym dostepie.",
          ],
        },
      },
    },
  },
  landscaping: {
    label: {
      en: "Landscaping",
      es: "Paisajismo",
      pl: "Architektura krajobrazu",
    },
    options: {
      lawn_maintenance: {
        label: {
          en: "Lawn Maintenance",
          es: "Mantenimiento de cesped",
          pl: "Utrzymanie trawnika",
        },
        scope: {
          en: "Mowing, edging, trimming, and seasonal lawn care for residential or commercial sites.",
          es: "Corte, bordes, recorte y cuidado estacional del cesped para sitios residenciales o comerciales.",
          pl: "Koszenie, przycinanie krawedzi, trymowanie i sezonowa pielegnacja trawnika dla obiektow mieszkalnych lub komercyjnych.",
        },
        terms: {
          en: [
            "Service frequency follows the agreed maintenance schedule.",
            "Additional fertilization or treatment services may be billed separately.",
          ],
          es: [
            "La frecuencia del servicio sigue el calendario de mantenimiento acordado.",
            "Fertilizacion o tratamientos adicionales pueden cobrarse aparte.",
          ],
          pl: [
            "Czestotliwosc uslugi wynika z uzgodnionego harmonogramu utrzymania.",
            "Dodatkowe nawozenie lub zabiegi moga byc rozliczane osobno.",
          ],
        },
      },
      garden_installation: {
        label: {
          en: "Garden Installation",
          es: "Instalacion de jardin",
          pl: "Zakladanie ogrodu",
        },
        scope: {
          en: "Installation of plants, soil preparation, mulching, and layout work for garden areas.",
          es: "Instalacion de plantas, preparacion del suelo, acolchado y trabajo de distribucion para areas de jardin.",
          pl: "Sadzenie roslin, przygotowanie gleby, sciolkowanie i wykonanie ukladu ogrodu.",
        },
        terms: {
          en: [
            "Plant availability may affect scheduling and final selections.",
            "Irrigation or drainage changes require written approval.",
          ],
          es: [
            "La disponibilidad de plantas puede afectar tiempos y seleccion final.",
            "Cambios de riego o drenaje requieren aprobacion escrita.",
          ],
          pl: [
            "Dostepnosc roslin moze wplynac na termin i ostateczny wybor.",
            "Zmiany dotyczace nawadniania lub odwodnienia wymagaja pisemnej akceptacji.",
          ],
        },
      },
      tree_shrub_service: {
        label: {
          en: "Tree and Shrub Service",
          es: "Servicio de arboles y arbustos",
          pl: "Pielegnacja drzew i krzewow",
        },
        scope: {
          en: "Pruning, trimming, shaping, and cleanup for trees, hedges, and shrubs.",
          es: "Poda, recorte, formado y limpieza de arboles, setos y arbustos.",
          pl: "Przycinanie, formowanie i sprzatanie drzew, zywoplotow i krzewow.",
        },
        terms: {
          en: [
            "Work above standard height limits may require specialty equipment.",
            "Hauling of oversized debris may be quoted separately.",
          ],
          es: [
            "Trabajos sobre alturas estandar pueden requerir equipo especial.",
            "El retiro de residuos grandes puede cotizarse por separado.",
          ],
          pl: [
            "Prace powyzej standardowych wysokosci moga wymagac specjalistycznego sprzetu.",
            "Wywoz duzych ilosci odpadow moze byc wyceniany osobno.",
          ],
        },
      },
    },
  },
  painting: {
    label: { en: "Painting", es: "Pintura", pl: "Malowanie" },
    options: {
      interior_painting: {
        label: {
          en: "Interior Painting",
          es: "Pintura interior",
          pl: "Malowanie wnetrz",
        },
        scope: {
          en: "Preparation, priming, painting, and cleanup for interior walls, ceilings, and trim.",
          es: "Preparacion, imprimacion, pintura y limpieza para paredes interiores, techos y molduras.",
          pl: "Przygotowanie, gruntowanie, malowanie i sprzatanie scian, sufitow i listew wewnetrznych.",
        },
        terms: {
          en: [
            "Furniture protection and room access must be arranged before service.",
            "Major drywall or plaster repairs are outside standard painting scope.",
          ],
          es: [
            "La proteccion de muebles y acceso al area deben organizarse antes del servicio.",
            "Reparaciones mayores de drywall o yeso estan fuera del alcance estandar.",
          ],
          pl: [
            "Zabezpieczenie mebli i dostep do pomieszczen musza byc przygotowane przed usluga.",
            "Wieksze naprawy scian i tynkow nie sa objete standardowym zakresem malowania.",
          ],
        },
      },
      exterior_painting: {
        label: {
          en: "Exterior Painting",
          es: "Pintura exterior",
          pl: "Malowanie elewacji",
        },
        scope: {
          en: "Surface prep, exterior painting, weatherproofing steps, and jobsite cleanup.",
          es: "Preparacion de superficies, pintura exterior, proteccion climatica y limpieza final.",
          pl: "Przygotowanie powierzchni, malowanie zewnetrzne, zabezpieczenie przed warunkami pogodowymi i sprzatanie.",
        },
        terms: {
          en: [
            "Weather conditions may delay exterior work.",
            "Rotten wood, structural damage, or advanced repairs require change approval.",
          ],
          es: [
            "Las condiciones climaticas pueden retrasar el trabajo exterior.",
            "Madera podrida, da�os estructurales o reparaciones mayores requieren aprobacion de cambio.",
          ],
          pl: [
            "Warunki pogodowe moga opoznic prace zewnetrzne.",
            "Zgnile drewno, uszkodzenia konstrukcyjne lub wieksze naprawy wymagaja zatwierdzenia zmian.",
          ],
        },
      },
      cabinet_finish: {
        label: {
          en: "Cabinet Finishing",
          es: "Acabado de gabinetes",
          pl: "Malowanie szafek",
        },
        scope: {
          en: "Sanding, prep, refinishing, and protective coating of cabinets and built-in units.",
          es: "Lijado, preparacion, acabado y recubrimiento protector de gabinetes y muebles empotrados.",
          pl: "Szlifowanie, przygotowanie, odnawianie i zabezpieczenie szafek oraz zabudow.",
        },
        terms: {
          en: [
            "Drying and curing times must be respected between coats.",
            "Hardware replacement or carpentry modifications are not included unless listed.",
          ],
          es: [
            "Los tiempos de secado y curado deben respetarse entre capas.",
            "Cambio de herrajes o carpinteria no esta incluido salvo indicacion expresa.",
          ],
          pl: [
            "Nalezy zachowac czas schniecia i utwardzania miedzy warstwami.",
            "Wymiana okuc lub modyfikacje stolarskie nie sa uwzglednione, chyba ze wskazano inaczej.",
          ],
        },
      },
    },
  },
  plumbing: {
    label: { en: "Plumbing", es: "Plomeria", pl: "Hydraulika" },
    options: {
      fixture_installation: {
        label: {
          en: "Fixture Installation",
          es: "Instalacion de accesorios",
          pl: "Montaz armatury",
        },
        scope: {
          en: "Installation or replacement of faucets, sinks, toilets, and related plumbing fixtures.",
          es: "Instalacion o reemplazo de grifos, lavabos, inodoros y accesorios relacionados.",
          pl: "Montaz lub wymiana baterii, umywalek, toalet i powiazanej armatury hydraulicznej.",
        },
        terms: {
          en: [
            "Customer-supplied fixtures must be on site before installation.",
            "Hidden piping issues discovered during installation may require additional work.",
          ],
          es: [
            "Los accesorios provistos por el cliente deben estar en sitio antes de la instalacion.",
            "Problemas ocultos de tuberia detectados durante la instalacion pueden requerir trabajo adicional.",
          ],
          pl: [
            "Elementy dostarczone przez klienta musza byc dostepne przed montazem.",
            "Ukryte problemy z instalacja odkryte podczas montazu moga wymagac dodatkowych prac.",
          ],
        },
      },
      leak_repair: {
        label: {
          en: "Leak Repair",
          es: "Reparacion de fugas",
          pl: "Naprawa przeciekow",
        },
        scope: {
          en: "Inspection and repair of visible leaks in supply lines, drains, and fixture connections.",
          es: "Inspeccion y reparacion de fugas visibles en lineas de suministro, drenajes y conexiones.",
          pl: "Inspekcja i naprawa widocznych przeciekow na przewodach zasilajacych, odplywach i polaczeniach.",
        },
        terms: {
          en: [
            "Wall opening or restoration work is not included unless specified.",
            "Emergency service outside scheduled hours may incur premium rates.",
          ],
          es: [
            "Abrir muros o restauracion no esta incluido salvo especificacion expresa.",
            "Servicio de emergencia fuera de horario puede tener tarifa premium.",
          ],
          pl: [
            "Otwieranie scian lub prace odtworzeniowe nie sa uwzglednione, chyba ze wskazano inaczej.",
            "Awaryjna usluga poza ustalonymi godzinami moze podlegac wyzszej stawce.",
          ],
        },
      },
      water_heater: {
        label: {
          en: "Water Heater Service",
          es: "Servicio de calentador de agua",
          pl: "Serwis podgrzewacza wody",
        },
        scope: {
          en: "Replacement, maintenance, or service work for residential water heaters.",
          es: "Reemplazo, mantenimiento o servicio para calentadores de agua residenciales.",
          pl: "Wymiana, konserwacja lub serwis domowych podgrzewaczy wody.",
        },
        terms: {
          en: [
            "Permits or code upgrades are billed separately when required.",
            "Disposal of old units is included only if listed in the estimate.",
          ],
          es: [
            "Permisos o actualizaciones de codigo se cobran por separado cuando sean requeridos.",
            "El retiro de la unidad anterior se incluye solo si aparece en el estimado.",
          ],
          pl: [
            "Pozwolenia lub dostosowanie do przepisow sa rozliczane osobno, jesli wymagane.",
            "Utylizacja starego urzadzenia jest uwzgledniona tylko wtedy, gdy widnieje w wycenie.",
          ],
        },
      },
    },
  },
  electrical: {
    label: { en: "Electrical", es: "Electricidad", pl: "Elektryka" },
    options: {
      lighting_installation: {
        label: {
          en: "Lighting Installation",
          es: "Instalacion de iluminacion",
          pl: "Montaz oswietlenia",
        },
        scope: {
          en: "Installation or replacement of light fixtures, switches, dimmers, and related electrical fittings.",
          es: "Instalacion o reemplazo de luminarias, interruptores, dimmers y accesorios relacionados.",
          pl: "Montaz lub wymiana opraw oswietleniowych, wlacznikow, sciemniaczy i powiazanych elementow.",
        },
        terms: {
          en: [
            "Power shutdowns may be required during installation.",
            "Customer-supplied fixtures must meet local electrical requirements.",
          ],
          es: [
            "Puede ser necesario cortar la energia durante la instalacion.",
            "Los accesorios del cliente deben cumplir requisitos electricos locales.",
          ],
          pl: [
            "Podczas montazu moze byc wymagane wylaczenie zasilania.",
            "Elementy dostarczone przez klienta musza spelniac lokalne wymagania elektryczne.",
          ],
        },
      },
      panel_upgrade: {
        label: {
          en: "Panel Upgrade",
          es: "Actualizacion de panel",
          pl: "Modernizacja rozdzielni",
        },
        scope: {
          en: "Electrical panel replacement or upgrade to support improved capacity and code compliance.",
          es: "Reemplazo o actualizacion del panel electrico para mejorar capacidad y cumplir codigo.",
          pl: "Wymiana lub modernizacja rozdzielni elektrycznej w celu zwiekszenia mocy i zgodnosci z przepisami.",
        },
        terms: {
          en: [
            "Permits and utility coordination may affect scheduling.",
            "Additional branch circuit work is outside scope unless listed.",
          ],
          es: [
            "Permisos y coordinacion con la compania electrica pueden afectar tiempos.",
            "Trabajo adicional en circuitos derivados esta fuera del alcance salvo que se indique.",
          ],
          pl: [
            "Pozwolenia i uzgodnienia z dostawca energii moga wplynac na harmonogram.",
            "Dodatkowe prace przy obwodach nie wchodza w zakres, chyba ze zostaly wymienione.",
          ],
        },
      },
      outlet_wiring: {
        label: {
          en: "Outlet and Wiring Work",
          es: "Tomacorrientes y cableado",
          pl: "Gniazdka i okablowanie",
        },
        scope: {
          en: "Installation, relocation, or repair of outlets, wiring runs, and standard electrical points.",
          es: "Instalacion, reubicacion o reparacion de tomacorrientes, cableado y puntos electricos estandar.",
          pl: "Montaz, przeniesienie lub naprawa gniazdek, przewodow i standardowych punktow elektrycznych.",
        },
        terms: {
          en: [
            "Wall patching and painting are excluded unless specified.",
            "Concealed code deficiencies discovered during work may require change approval.",
          ],
          es: [
            "Resane de muros y pintura quedan excluidos salvo especificacion.",
            "Deficiencias ocultas de codigo encontradas durante el trabajo pueden requerir aprobacion de cambio.",
          ],
          pl: [
            "Naprawy scian i malowanie nie sa uwzglednione, chyba ze wskazano inaczej.",
            "Ukryte niezgodnosci z przepisami ujawnione podczas prac moga wymagac zatwierdzenia zmian.",
          ],
        },
      },
    },
  },
};

const initialContractForm = {
  mode: "template",
  contractLanguage: "en",
  clientId: "",
  clientName: "",
  jobId: "",
  jobTitle: "",
  amount: "",
  status: "Draft",
  contractCategory: "patios",
  contractOption: "patio_maintenance",
  additionalTerms: "",
  body: "",
};

const initialCompanyProfile = {
  companyName: "",
  logoDataUrl: "",
  websiteUrl: "",
  googleReviewsUrl: "",
  phone: "",
  businessAddress: "",
  poBoxAddress: "",
  legalFooter: "",
  documentLanguage: "en",
  forceEnglishTranslation: false,
  defaultTaxState: "TX",
  defaultInvoiceDueDays: 14,
};

const DOCUMENT_LANGUAGE_OPTIONS = [
  { value: "en", label: "English (Primary)" },
  { value: "es", label: "Espanol" },
  { value: "pl", label: "Polski" },
];

const JOB_SERVICE_LIBRARY = {
  landscaping: {
    maintenance: [
      "Lawn mowing",
      "Edging",
      "Shrub and hedge trimming",
      "Leaf cleanup",
      "Seasonal yard cleanup",
      "Weed control",
      "Fertilize treatment",
      "Spring cleanup",
      "Fall cleanup",
    ],
    installations: [
      "Mulch installation",
      "Mulch removal and replacement",
      "Sod installation",
      "Yard grading",
    ],
    hardscaping: ["Paver patio installation", "Retaining wall installation"],
  },
  concrete: {
    decorative: [
      "Stamped concrete",
      "Colored concrete",
      "Exposed aggregate concrete",
      "Concrete sealing",
    ],
    installations: [
      "Concrete driveway installation",
      "Concrete patio installation",
      "Concrete sidewalk",
      "Concrete slab",
      "Concrete steps and curbs",
    ],
    repairAndRemoval: [
      "Concrete resurfacing",
      "Concrete crack repair",
      "Concrete demolition and removal",
    ],
  },
};

const ALL_JOB_SERVICES = Array.from(
  new Set(
    Object.values(JOB_SERVICE_LIBRARY)
      .flatMap((category) => Object.values(category))
      .flat(),
  ),
);

const SEND_LANGUAGE_OPTIONS = DOCUMENT_LANGUAGE_OPTIONS;

const UI_I18N = {
  en: {
    appSubtitle:
      "Complete contractor management system for clients jobs invoices and contracts.",
    language: "Language",
    loading: "Loading data...",
    tabs: {
      dashboard: "Dashboard",
      clients: "Clients",
      jobs: "Jobs",
      invoices: "Invoices",
      contracts: "Contracts",
      branding: "Settings",
    },
    stats: {
      clients: "Clients",
      jobs: "Jobs",
      invoices: "Invoices",
      contracts: "Contracts",
    },
    dashboard: {
      recentClients: "Recent clients",
      recentJobs: "Recent jobs",
      recentInvoices: "Recent invoices",
      noClients: "No clients yet.",
      noJobs: "No jobs yet.",
      noInvoices: "No invoices yet.",
      invoiceWithoutNumber: "Invoice without number",
      overview: "Overview",
      newRequests: "New requests",
      totalRequests: "Total requests",
      active: "Active",
      pendingDraft: "Pending / Draft",
      needsInvoicing: "Needs invoicing",
      awaitingPayment: "awaiting payment",
      draft: "Draft",
      pastDue: "Past due",
      allClear: "\u2713 All clear",
      signed: "Signed",
      quickActions: "Quick Actions",
      newJobBtn: "New Job",
      newInvoiceBtn: "New Invoice",
      newClientBtn: "New Client",
      newContractBtn: "New Contract",
      businessSummary: "Business Summary",
      totalRevenue: "Total Revenue",
      totalPayments: "Total Payments",
      fromAllJobs: "from all jobs",
      fromPaidPayments: "from paid payments",
      paidTransactions: "paid transactions",
      revenueLoading: "Loading live revenue...",
      revenueUnavailable: "Live revenue unavailable",
      outstanding: "Outstanding",
      unpaidInvoices: "unpaid invoices",
      activeClients: "Active Clients",
      inYourWorkspace: "in your workspace",
      openContracts: "Open Contracts",
      activeAgreements: "active agreements",
      conversionRate: "Conversion Rate",
      totalLeads: "Total Leads",
      wonJobs: "Won Jobs",
      wonOutOf: "won out of",
      leads: "leads",
      estimatesSent: "Estimates Sent",
      winRateEstimates: "Win Rate (from estimates)",
      filterThisWeek: "This week",
      filterThisMonth: "This month",
      filterCustom: "Custom range",
      filterAll: "All time",
      noLeadsYet: "No leads yet",
    },
    sections: {
      clients: "Clients",
      jobs: "Jobs",
      invoices: "Invoices",
      contracts: "Contracts",
      branding: "Company settings",
    },
    actions: {
      hideForm: "Hide form",
      newClient: "+ New client",
      newJob: "+ New job",
      newInvoice: "+ New invoice",
      newContract: "+ New contract",
    },
    forms: {
      client: {
        name: "Name",
        email: "Email",
        phone: "Phone",
        address: "Address",
        addressLine1: "Address line 1",
        addressLine1Placeholder: "123 Main St",
        addressLine2: "Address line 2 (apt, unit)",
        addressLine2Placeholder: "Apt 4B",
        city: "City",
        state: "State",
        zip: "ZIP code",
        service: "Service",
        notes: "Notes",
        price: "Price",
        leadStatus: "Lead status",
        save: "Save client",
      },
      leadStatuses: {
        new_lead: "New Lead",
        contacted: "Contacted",
        estimate_sent: "Estimate Sent",
        waiting_approval: "Waiting Approval",
        won: "Won",
        lost: "Lost",
      },
      job: {
        title: "Job title",
        selectClient: "Select client",
        client: "Client",
        service: "Service",
        serviceLibraryButton: "Choose from service library",
        landscapingCategory: "Landscaping and hardscaping",
        concreteCategory: "Concrete services",
        landscapingMaintenance: "Maintenance",
        landscapingInstallations: "Installations",
        landscapingHardscaping: "Hardscaping",
        concreteDecorative: "Decorative",
        concreteInstallations: "Installations",
        concreteRepairAndRemoval: "Repair and removal",
        serviceSearchPlaceholder: "Search services...",
        favoritesTitle: "Favorites",
        noServiceResults: "No services match your search.",
        addFavorite: "Add to favorites",
        removeFavorite: "Remove favorite",
        smartTableTitle: "Smart estimator",
        smartTableHint:
          "Estimate by square feet, mulch yards, and seasonal cleanup in one table.",
        rowArea: "Area work",
        rowMulch: "Mulch",
        rowFertilizer: "Fertilize",
        rowSpringCleanup: "Spring cleanup",
        rowFallCleanup: "Fall cleanup",
        rowCustomItem: "Custom item",
        unitSqft: "sq ft",
        unitYards: "yd",
        unitPieces: "pieces",
        unitFlat: "flat",
        columnItem: "Item",
        columnQuantity: "Qty",
        columnRate: "Rate",
        columnTotal: "Total",
        estimatedTotal: "Estimated total",
        applyEstimateToPrice: "Apply total to price",
        clearEstimate: "Clear estimator",
        addItem: "Add item",
        removeItem: "Remove",
        itemNamePlaceholder: "Item name",
        price: "Price",
        downPayment: "% down payment",
        save: "Save job",
      },
      invoice: {
        editTitle: "Edit invoice",
        newTitle: "New invoice",
        selectJob: "Select job",
        orAddJob: "or add job",
        selectClient: "Select client",
        orAddClient: "or add client",
        concept: "Service description",
        number: "Invoice number",
        amount: "Amount",
        lineItems: "Service lines (one per line, optional)",
        internalNotes: "Internal notes",
        aiGenerating: "AI generating...",
        aiComplete: "AI complete invoice",
        update: "Update invoice",
        save: "Add invoice",
        clear: "Clear",
        registerPayment: "Register payment",
        reference: "Reference",
        notes: "Notes",
        saving: "Saving...",
        savePayment: "Save payment",
        cancel: "Cancel",
      },
      contract: {
        description:
          "Automatic drafts and manual contracts using templates or your own text.",
        newTitle: "New contract",
        editTitle: "Edit contract",
        templateMode: "Use template",
        customMode: "Write my own contract",
        selectClient: "Select client",
        selectJob: "Select job (optional)",
        client: "Client",
        title: "Contract title",
        amount: "Amount",
        additionalTerms: "Additional terms (optional)",
        customBody: "Write your own contract",
        preview: "Preview",
        clear: "Clear",
      },
    },
    labels: {
      status: "Status",
      price: "Price",
      date: "Date",
      noDate: "No date",
      linkedInvoice: "Linked invoice",
      noNumber: "Without number",
      amount: "Amount",
      paid: "Paid",
      balance: "Balance",
      preferredMethod: "Preferred method",
      due: "Due",
      linkedJob: "Linked job",
      contract: "Contract",
      quoteStatus: "Quote status",
      clientLink: "Client link",
      sentTo: "Sent to",
      approved: "Approved",
      signed: "Signed",
      requests: "Client requests",
      noRequests: "No requests yet.",
      contact: "Contact",
      notAvailable: "N/A",
      undefinedClient: "Client not defined",
      invoiceLabel: "Invoice",
      noInvoice: "No invoice",
    },
    buttons: {
      linkCopied: "Link copied",
      copyClientLink: "Copy client link",
      sending: "Sending...",
      quoteSent: "Quote sent",
      sendQuoteEmail: "Send quote by email",
      regenerateLink: "Regenerate link",
      printEstimate: "Print estimate/PDF",
      editLinkedInvoice: "Edit linked invoice",
      createInvoice: "Create invoice",
      markReviewed: "Mark reviewed",
      markResolved: "Mark resolved",
      actionsMenu: "Actions",
      printInvoice: "Print/PDF",
      sendInvoiceEmail: "Send by email",
      sendInvoiceText: "Send by text",
      chargeOnline: "Charge online",
      registerPayment: "Register payment",
      edit: "Edit",
      delete: "Delete",
      viewContract: "View contract",
      createContract: "Create contract",
      printContract: "Print contract/PDF",
    },
    empty: {
      clients: "No clients in database.",
      jobs: "No jobs registered.",
      invoices: "No invoices registered.",
      contracts: "No contracts created yet.",
    },
    settings: {
      description:
        "Configure company identity, document defaults and legal data for your PDFs per tenant.",
      businessMetricsTitle: "Business metrics",
      pendingInvoicesLabel: "Pending invoices",
      outstandingLabel: "Outstanding",
      totalRevenueLabel: "Total revenue",
      reviewsLabel: "Google reviews",
      reviewsMissing: "Not configured",
      companyNameLabel: "Company name",
      documentLanguageLabel: "Document language (3 languages)",
      alwaysTranslateCheckbox: "Always translate to English",
      taxStateLabel: "Tax state default (jobs)",
      invoiceDueDaysLabel: "Default invoice due days",
      logoUploadLabel: "Upload logo",
      websiteUrlPlaceholder: "https://your-site.com",
      googleReviewsPlaceholder: "https://g.page/r/... (Google Reviews)",
      phoneLabel: "Contact phone",
      businessAddressLabel: "Business address (optional)",
      poBoxAddressLabel: "P.O. box address (optional)",
      legalFooterPlaceholder: "Legal footer text",
      saveSettings: "Save settings",
      savingSettings: "Saving...",
      restoreSettings: "Restore",
      removeLogo: "Remove logo",
      contractAIGenerating: "AI drafting...",
      contractAILabel: "AI draft contract",
      contractAISave: "Save contract",
    },
  },
  es: {
    appSubtitle:
      "Sistema completo para gestionar clientes, trabajos, facturas y contratos.",
    language: "Idioma",
    loading: "Cargando datos...",
    tabs: {
      dashboard: "Dashboard",
      clients: "Clientes",
      jobs: "Trabajos",
      invoices: "Facturas",
      contracts: "Contratos",
      branding: "Ajustes",
    },
    stats: {
      clients: "Clientes",
      jobs: "Trabajos",
      invoices: "Facturas",
      contracts: "Contratos",
    },
    dashboard: {
      recentClients: "Ultimos clientes",
      recentJobs: "Trabajos recientes",
      recentInvoices: "Facturas recientes",
      noClients: "No hay clientes aun.",
      noJobs: "No hay trabajos cargados.",
      noInvoices: "No hay facturas registradas.",
      invoiceWithoutNumber: "Factura sin numero",
      overview: "Resumen",
      newRequests: "Nuevas solicitudes",
      totalRequests: "Total solicitudes",
      active: "Activos",
      pendingDraft: "Pendiente / Borrador",
      needsInvoicing: "Necesita factura",
      awaitingPayment: "en espera de pago",
      draft: "Borrador",
      pastDue: "Vencido",
      allClear: "\u2713 Todo al dia",
      signed: "Firmado",
      quickActions: "Acciones rapidas",
      newJobBtn: "Nuevo trabajo",
      newInvoiceBtn: "Nueva factura",
      newClientBtn: "Nuevo cliente",
      newContractBtn: "Nuevo contrato",
      businessSummary: "Resumen del negocio",
      totalRevenue: "Ingresos totales",
      totalPayments: "Pagos totales",
      fromAllJobs: "de todos los trabajos",
      fromPaidPayments: "de pagos cobrados",
      paidTransactions: "pagos cobrados",
      revenueLoading: "Cargando ingresos en vivo...",
      revenueUnavailable: "Ingresos en vivo no disponibles",
      outstanding: "Pendiente de cobro",
      unpaidInvoices: "facturas sin pagar",
      activeClients: "Clientes activos",
      inYourWorkspace: "en tu espacio de trabajo",
      openContracts: "Contratos activos",
      activeAgreements: "acuerdos vigentes",
      conversionRate: "Tasa de conversion",
      totalLeads: "Total de leads",
      wonJobs: "Trabajos ganados",
      wonOutOf: "ganados de",
      leads: "leads",
      estimatesSent: "Estimados enviados",
      winRateEstimates: "Tasa de cierre (de estimados)",
      filterThisWeek: "Esta semana",
      filterThisMonth: "Este mes",
      filterCustom: "Rango personalizado",
      filterAll: "Todo el tiempo",
      noLeadsYet: "Sin leads aun",
    },
    sections: {
      clients: "Clientes",
      jobs: "Trabajos",
      invoices: "Facturas",
      contracts: "Contratos",
      branding: "Configuracion de la compania",
    },
    actions: {
      hideForm: "Ocultar formulario",
      newClient: "+ Nuevo cliente",
      newJob: "+ Nuevo trabajo",
      newInvoice: "+ Nueva factura",
      newContract: "+ Nuevo contrato",
    },
    forms: {
      client: {
        name: "Nombre",
        email: "Email",
        phone: "Telefono",
        address: "Direccion",
        addressLine1: "Direcci�n linea 1",
        addressLine1Placeholder: "123 Main St",
        addressLine2: "Direcci�n linea 2 (apto, unidad)",
        addressLine2Placeholder: "Apto 4B",
        city: "Ciudad",
        state: "Estado",
        zip: "C�digo postal",
        service: "Servicio",
        notes: "Notas",
        price: "Precio",
        leadStatus: "Estado del lead",
        save: "Guardar cliente",
      },
      leadStatuses: {
        new_lead: "Nuevo lead",
        contacted: "Contactado",
        estimate_sent: "Estimado enviado",
        waiting_approval: "En espera de aprobacion",
        won: "Ganado",
        lost: "Perdido",
      },
      job: {
        title: "Titulo del trabajo",
        selectClient: "Seleccionar cliente",
        client: "Cliente",
        service: "Servicio",
        serviceLibraryButton: "Elegir desde libreria de servicios",
        landscapingCategory: "Landscaping y hardscaping",
        concreteCategory: "Servicios de concreto",
        landscapingMaintenance: "Mantenimiento",
        landscapingInstallations: "Instalaciones",
        landscapingHardscaping: "Hardscaping",
        concreteDecorative: "Decorativo",
        concreteInstallations: "Instalaciones",
        concreteRepairAndRemoval: "Reparacion y demolicion",
        serviceSearchPlaceholder: "Buscar servicios...",
        favoritesTitle: "Favoritos",
        noServiceResults: "No hay servicios que coincidan con tu busqueda.",
        addFavorite: "Agregar a favoritos",
        removeFavorite: "Quitar favorito",
        smartTableTitle: "Tabla inteligente",
        smartTableHint:
          "Calcula por pies cuadrados, yardas de mulch y limpiezas de temporada en una sola tabla.",
        rowArea: "Trabajo por area",
        rowMulch: "Mulch",
        rowFertilizer: "Fertilizacion",
        rowSpringCleanup: "Limpieza de primavera",
        rowFallCleanup: "Limpieza de otono",
        rowCustomItem: "Item personalizado",
        unitSqft: "pies",
        unitYards: "yardas",
        unitPieces: "piezas",
        unitFlat: "fijo",
        columnItem: "Concepto",
        columnQuantity: "Cant.",
        columnRate: "Tarifa",
        columnTotal: "Total",
        estimatedTotal: "Total estimado",
        applyEstimateToPrice: "Pasar total a precio",
        clearEstimate: "Limpiar tabla",
        addItem: "Agregar item",
        removeItem: "Quitar",
        itemNamePlaceholder: "Nombre del item",
        price: "Precio",
        downPayment: "% anticipo",
        save: "Guardar trabajo",
      },
      invoice: {
        editTitle: "Editar factura",
        newTitle: "Nueva factura",
        selectJob: "Seleccionar trabajo",
        orAddJob: "o agregar trabajo",
        selectClient: "Seleccionar cliente",
        orAddClient: "o agregar cliente",
        concept: "Descripcion del servicio",
        number: "Numero de factura",
        amount: "Monto",
        lineItems: "Lineas de servicio (una por linea, opcional)",
        internalNotes: "Notas internas",
        aiGenerating: "IA generando...",
        aiComplete: "IA completar factura",
        update: "Actualizar factura",
        save: "Agregar factura",
        clear: "Limpiar",
        registerPayment: "Registrar pago",
        reference: "Referencia",
        notes: "Notas",
        saving: "Guardando...",
        savePayment: "Guardar pago",
        cancel: "Cancelar",
      },
      contract: {
        description:
          "Borradores automaticos y contratos manuales con plantillas o texto propio.",
        newTitle: "Nuevo contrato",
        editTitle: "Editar contrato",
        templateMode: "Usar plantilla",
        customMode: "Escribir mi propio contrato",
        selectClient: "Seleccionar cliente",
        selectJob: "Seleccionar trabajo (opcional)",
        client: "Cliente",
        title: "Titulo del contrato",
        amount: "Monto",
        additionalTerms: "Terminos adicionales (opcional)",
        customBody: "Escribe tu propio contrato",
        preview: "Vista previa",
        clear: "Limpiar",
      },
    },
    labels: {
      status: "Estado",
      price: "Precio",
      date: "Fecha",
      noDate: "Sin fecha",
      linkedInvoice: "Factura vinculada",
      noNumber: "Sin numero",
      amount: "Monto",
      paid: "Pagado",
      balance: "Saldo",
      preferredMethod: "Metodo preferido",
      due: "Vence",
      linkedJob: "Trabajo vinculado",
      contract: "Contrato",
      quoteStatus: "Estado quote",
      clientLink: "Link cliente",
      sentTo: "Enviado a",
      approved: "Aprobado",
      signed: "Firmado",
      requests: "Solicitudes del cliente",
      noRequests: "Sin solicitudes por ahora.",
      contact: "Contacto",
      notAvailable: "N/A",
      undefinedClient: "Cliente sin definir",
      invoiceLabel: "Factura",
      noInvoice: "Sin factura",
    },
    buttons: {
      linkCopied: "Link copiado",
      copyClientLink: "Copiar link cliente",
      sending: "Enviando...",
      quoteSent: "Quote enviado",
      sendQuoteEmail: "Enviar quote por email",
      regenerateLink: "Regenerar link",
      printEstimate: "Imprimir estimate/PDF",
      editLinkedInvoice: "Editar factura vinculada",
      createInvoice: "Crear factura",
      markReviewed: "Marcar revisado",
      markResolved: "Marcar resuelto",
      actionsMenu: "Acciones",
      printInvoice: "Imprimir/PDF",
      sendInvoiceEmail: "Enviar por email",
      sendInvoiceText: "Enviar por texto",
      chargeOnline: "Cobrar online",
      registerPayment: "Registrar pago",
      edit: "Editar",
      delete: "Eliminar",
      viewContract: "Ver contrato",
      createContract: "Crear contrato",
      printContract: "Imprimir contrato/PDF",
    },
    empty: {
      clients: "No hay clientes en la base de datos.",
      jobs: "No hay trabajos registrados.",
      invoices: "No hay facturas registradas.",
      contracts: "No hay contratos creados todavia.",
    },
    settings: {
      description:
        "Configura identidad de la empresa, defaults de documentos y datos legales para tus PDFs por tenant.",
      businessMetricsTitle: "Metricas del negocio",
      pendingInvoicesLabel: "Facturas pendientes",
      outstandingLabel: "Por cobrar",
      totalRevenueLabel: "Ingresos totales",
      reviewsLabel: "Resenas de Google",
      reviewsMissing: "Sin configurar",
      companyNameLabel: "Nombre de la compania",
      documentLanguageLabel: "Idioma de documentos (3 idiomas)",
      alwaysTranslateCheckbox: "Siempre traducir al ingles",
      taxStateLabel: "Estado de impuesto default (trabajos)",
      invoiceDueDaysLabel: "Dias de vencimiento default",
      logoUploadLabel: "Subir logo",
      websiteUrlPlaceholder: "https://tu-sitio.com",
      googleReviewsPlaceholder: "https://g.page/r/... (Resenas de Google)",
      phoneLabel: "Telefono de contacto",
      businessAddressLabel: "Direccion comercial (opcional)",
      poBoxAddressLabel: "Apartado postal (opcional)",
      legalFooterPlaceholder: "Texto legal para pie de pagina",
      saveSettings: "Guardar ajustes",
      savingSettings: "Guardando...",
      restoreSettings: "Restaurar",
      removeLogo: "Quitar logo",
      contractAIGenerating: "IA redactando...",
      contractAILabel: "IA redactar contrato",
      contractAISave: "Guardar contrato",
    },
  },
  pl: {
    appSubtitle:
      "Kompletny system do zarzadzania klientami, zleceniami, fakturami i umowami.",
    language: "Jezyk",
    loading: "Ladowanie danych...",
    tabs: {
      dashboard: "Panel",
      clients: "Klienci",
      jobs: "Zlecenia",
      invoices: "Faktury",
      contracts: "Umowy",
      branding: "Ustawienia",
    },
    stats: {
      clients: "Klienci",
      jobs: "Zlecenia",
      invoices: "Faktury",
      contracts: "Umowy",
    },
    dashboard: {
      recentClients: "Ostatni klienci",
      recentJobs: "Ostatnie zlecenia",
      recentInvoices: "Ostatnie faktury",
      noClients: "Brak klientow.",
      noJobs: "Brak zlecen.",
      noInvoices: "Brak faktur.",
      invoiceWithoutNumber: "Faktura bez numeru",
      overview: "Przeglad",
      newRequests: "Nowe zapytania",
      totalRequests: "Wszystkie zapytania",
      active: "Aktywne",
      pendingDraft: "Oczekujace / Robocze",
      needsInvoicing: "Do zafakturowania",
      awaitingPayment: "oczekuje na platnosc",
      draft: "Robocze",
      pastDue: "Przeterminowane",
      allClear: "\u2713 Wszystko w porzadku",
      signed: "Podpisane",
      quickActions: "Szybkie akcje",
      newJobBtn: "Nowe zlecenie",
      newInvoiceBtn: "Nowa faktura",
      newClientBtn: "Nowy klient",
      newContractBtn: "Nowa umowa",
      businessSummary: "Podsumowanie firmy",
      totalRevenue: "Laczne przychody",
      totalPayments: "Liczba platnosci",
      fromAllJobs: "ze wszystkich zlecen",
      fromPaidPayments: "z oplaconych platnosci",
      paidTransactions: "oplacone transakcje",
      revenueLoading: "Ladowanie przychodu na zywo...",
      revenueUnavailable: "Przychod na zywo jest niedostepny",
      outstanding: "Do zaplaty",
      unpaidInvoices: "niezaplacone faktury",
      activeClients: "Aktywni klienci",
      inYourWorkspace: "w Twoim panelu",
      openContracts: "Otwarte umowy",
      activeAgreements: "aktywne umowy",
      conversionRate: "Wskaznik konwersji",
      totalLeads: "Wszystkie leady",
      wonJobs: "Wygrane zlecenia",
      wonOutOf: "wygrane z",
      leads: "leadow",
      estimatesSent: "Wyslane kosztorysy",
      winRateEstimates: "Skutecznosc (z kosztorysow)",
      filterThisWeek: "Ten tydzien",
      filterThisMonth: "Ten miesiac",
      filterCustom: "Zakres dat",
      filterAll: "Wszystkie",
      noLeadsYet: "Brak leadow",
    },
    sections: {
      clients: "Klienci",
      jobs: "Zlecenia",
      invoices: "Faktury",
      contracts: "Umowy",
      branding: "Ustawienia firmy",
    },
    actions: {
      hideForm: "Ukryj formularz",
      newClient: "+ Nowy klient",
      newJob: "+ Nowe zlecenie",
      newInvoice: "+ Nowa faktura",
      newContract: "+ Nowa umowa",
    },
    forms: {
      client: {
        name: "Nazwa",
        email: "Email",
        phone: "Telefon",
        address: "Adres",
        addressLine1: "Adres � linia 1",
        addressLine1Placeholder: "ul. Gl�wna 123",
        addressLine2: "Adres � linia 2 (mieszkanie, lokal)",
        addressLine2Placeholder: "Mieszkanie 4B",
        city: "Miasto",
        state: "Stan",
        zip: "Kod pocztowy",
        service: "Usluga",
        notes: "Notatki",
        price: "Cena",
        leadStatus: "Status leada",
        save: "Zapisz klienta",
      },
      leadStatuses: {
        new_lead: "Nowy lead",
        contacted: "Skontaktowany",
        estimate_sent: "Kosztorys wyslany",
        waiting_approval: "Oczekuje na odpowiedz",
        won: "Wygrany",
        lost: "Przegrany",
      },
      job: {
        title: "Tytul zlecenia",
        selectClient: "Wybierz klienta",
        client: "Klient",
        service: "Usluga",
        serviceLibraryButton: "Wybierz z biblioteki uslug",
        landscapingCategory: "Landscaping i hardscaping",
        concreteCategory: "Uslugi betonowe",
        landscapingMaintenance: "Utrzymanie",
        landscapingInstallations: "Instalacje",
        landscapingHardscaping: "Hardscaping",
        concreteDecorative: "Dekoracyjne",
        concreteInstallations: "Instalacje",
        concreteRepairAndRemoval: "Naprawa i usuwanie",
        serviceSearchPlaceholder: "Szukaj uslug...",
        favoritesTitle: "Ulubione",
        noServiceResults: "Brak uslug pasujacych do wyszukiwania.",
        addFavorite: "Dodaj do ulubionych",
        removeFavorite: "Usun z ulubionych",
        smartTableTitle: "Inteligentna tabela",
        smartTableHint:
          "Licz wedlug stop kwadratowych, yardow mulch i sezonowych porzadkow w jednej tabeli.",
        rowArea: "Prace powierzchniowe",
        rowMulch: "Mulch",
        rowFertilizer: "Nawozenie",
        rowSpringCleanup: "Wiosenne porzadki",
        rowFallCleanup: "Jesienne porzadki",
        rowCustomItem: "Wlasna pozycja",
        unitSqft: "stopy",
        unitYards: "yardy",
        unitPieces: "sztuki",
        unitFlat: "ryczalt",
        columnItem: "Pozycja",
        columnQuantity: "Ilosc",
        columnRate: "Stawka",
        columnTotal: "Suma",
        estimatedTotal: "Suma szacowana",
        applyEstimateToPrice: "Przenies sume do ceny",
        clearEstimate: "Wyczysc tabele",
        addItem: "Dodaj pozycje",
        removeItem: "Usun",
        itemNamePlaceholder: "Nazwa pozycji",
        price: "Cena",
        downPayment: "% zaliczki",
        save: "Zapisz zlecenie",
      },
      invoice: {
        editTitle: "Edytuj fakture",
        newTitle: "Nowa faktura",
        selectJob: "Wybierz zlecenie",
        orAddJob: "lub dodaj zlecenie",
        selectClient: "Wybierz klienta",
        orAddClient: "lub dodaj klienta",
        concept: "Opis uslugi",
        number: "Numer faktury",
        amount: "Kwota",
        lineItems: "Pozycje uslug (jedna na linie, opcjonalnie)",
        internalNotes: "Notatki wewnetrzne",
        aiGenerating: "AI generuje...",
        aiComplete: "AI uzupelnij fakture",
        update: "Aktualizuj fakture",
        save: "Dodaj fakture",
        clear: "Wyczysc",
        registerPayment: "Zarejestruj platnosc",
        reference: "Referencja",
        notes: "Notatki",
        saving: "Zapisywanie...",
        savePayment: "Zapisz platnosc",
        cancel: "Anuluj",
      },
      contract: {
        description:
          "Automatyczne szkice i umowy tworzone z szablonow lub wlasnego tekstu.",
        newTitle: "Nowa umowa",
        editTitle: "Edytuj umowe",
        templateMode: "Uzyj szablonu",
        customMode: "Napisz wlasna umowe",
        selectClient: "Wybierz klienta",
        selectJob: "Wybierz zlecenie (opcjonalnie)",
        client: "Klient",
        title: "Tytul umowy",
        amount: "Kwota",
        additionalTerms: "Dodatkowe warunki (opcjonalnie)",
        customBody: "Napisz wlasna umowe",
        preview: "Podglad",
        clear: "Wyczysc",
      },
    },
    labels: {
      status: "Status",
      price: "Cena",
      date: "Data",
      noDate: "Brak daty",
      linkedInvoice: "Powiazana faktura",
      noNumber: "Bez numeru",
      amount: "Kwota",
      paid: "Oplacone",
      balance: "Saldo",
      preferredMethod: "Preferowana metoda",
      due: "Termin",
      linkedJob: "Powiazane zlecenie",
      contract: "Umowa",
      quoteStatus: "Status wyceny",
      clientLink: "Link klienta",
      sentTo: "Wyslano do",
      approved: "Zatwierdzono",
      signed: "Podpisano",
      requests: "Prosby klienta",
      noRequests: "Brak zgloszen na razie.",
      contact: "Kontakt",
      notAvailable: "Brak",
      undefinedClient: "Klient nieokreslony",
      invoiceLabel: "Faktura",
      noInvoice: "Brak faktury",
    },
    buttons: {
      linkCopied: "Skopiowano link",
      copyClientLink: "Kopiuj link klienta",
      sending: "Wysylanie...",
      quoteSent: "Wycena wyslana",
      sendQuoteEmail: "Wyslij wycene emailem",
      regenerateLink: "Wygeneruj link ponownie",
      printEstimate: "Drukuj wycene/PDF",
      editLinkedInvoice: "Edytuj powiazana fakture",
      createInvoice: "Utworz fakture",
      markReviewed: "Oznacz jako sprawdzone",
      markResolved: "Oznacz jako rozwiazane",
      actionsMenu: "Akcje",
      printInvoice: "Drukuj/PDF",
      sendInvoiceEmail: "Wyslij emailem",
      sendInvoiceText: "Wyslij SMS",
      chargeOnline: "Pobierz online",
      registerPayment: "Zarejestruj platnosc",
      edit: "Edytuj",
      delete: "Usun",
      viewContract: "Zobacz umowe",
      createContract: "Utworz umowe",
      printContract: "Drukuj umowe/PDF",
    },
    empty: {
      clients: "Brak klientow w bazie.",
      jobs: "Brak zlecen.",
      invoices: "Brak faktur.",
      contracts: "Brak utworzonych umow.",
    },
    settings: {
      description:
        "Skonfiguruj tozsamosc firmy, domyslne ustawienia dokumentow i dane prawne dla swoich plikow PDF na dzierzawce.",
      businessMetricsTitle: "Metryki biznesowe",
      pendingInvoicesLabel: "Oczekujace faktury",
      outstandingLabel: "Do zaplaty",
      totalRevenueLabel: "Laczny przychod",
      reviewsLabel: "Opinie Google",
      reviewsMissing: "Brak konfiguracji",
      companyNameLabel: "Nazwa firmy",
      documentLanguageLabel: "Jezyk dokumentu (3 jezyki)",
      alwaysTranslateCheckbox: "Zawsze tlumacz na angielski",
      taxStateLabel: "Domyslny stan podatku (zlecenia)",
      invoiceDueDaysLabel: "Domyslne dni dla terminu faktury",
      logoUploadLabel: "Wyslij logo",
      websiteUrlPlaceholder: "https://twoja-witryna.com",
      googleReviewsPlaceholder: "https://g.page/r/... (Opinie Google)",
      phoneLabel: "Telefon kontaktowy",
      businessAddressLabel: "Adres firmy (opcjonalnie)",
      poBoxAddressLabel: "Adres skrytki pocztowej (opcjonalnie)",
      legalFooterPlaceholder: "Tekst prawny w stopce",
      saveSettings: "Zapisz ustawienia",
      savingSettings: "Zapisywanie...",
      restoreSettings: "Przywroc",
      removeLogo: "Usun logo",
      contractAIGenerating: "AI redaguje...",
      contractAILabel: "AI redaguj umowe",
      contractAISave: "Zapisz umowe",
    },
  },
};

const DOC_I18N = {
  en: {
    website: "Website",
    reviews: "Google Reviews",
    businessAddress: "Business address",
    poBoxAddress: "P.O. box address",
    details: "Details",
    tip: 'Tip: in the print dialog choose "Save as PDF".',
    quoteEstimate: "Quote / Estimate",
    invoice: "Invoice",
    contract: "Contract",
    jobPrefix: "Job:",
    invoicePrefix: "Invoice #",
    invoiceDocument: "Invoice document",
    generatedContract: "Generated contract",
    client: "Client",
    service: "Service",
    status: "Status",
    dueDate: "Due date",
    estimatedAmount: "Estimated amount",
    subtotal: "Subtotal",
    taxState: "Tax state (USA)",
    taxRate: "Tax rate",
    taxAmount: "Tax amount",
    estimateTotal: "Estimate total",
    downPaymentPercent: "Down payment %",
    downPaymentAmount: "Down payment amount",
    balanceAfterDownPayment: "Balance after down payment",
    amount: "Amount",
    linkedJob: "Linked job",
    contractField: "Contract",
    unknown: "Unknown",
    notSpecified: "Not specified",
    pending: "Pending",
    noDueDate: "No due date",
    notLinked: "Not linked",
    notGenerated: "Not generated",
    draft: "Draft",
  },
  es: {
    website: "Sitio web",
    reviews: "Resenas de Google",
    businessAddress: "Direccion comercial",
    poBoxAddress: "Apartado postal",
    details: "Detalles",
    tip: 'Tip: en el dialogo de impresion elige "Guardar como PDF".',
    quoteEstimate: "Cotizacion / Estimacion",
    invoice: "Factura",
    contract: "Contrato",
    jobPrefix: "Trabajo:",
    invoicePrefix: "Factura #",
    invoiceDocument: "Documento de factura",
    generatedContract: "Contrato generado",
    client: "Cliente",
    service: "Servicio",
    status: "Estado",
    dueDate: "Vencimiento",
    estimatedAmount: "Monto estimado",
    subtotal: "Subtotal",
    taxState: "Estado de impuesto (USA)",
    taxRate: "Tasa de impuesto",
    taxAmount: "Monto de impuesto",
    estimateTotal: "Total estimado",
    downPaymentPercent: "% de anticipo",
    downPaymentAmount: "Monto de anticipo",
    balanceAfterDownPayment: "Saldo despues de anticipo",
    amount: "Monto",
    linkedJob: "Trabajo vinculado",
    contractField: "Contrato",
    unknown: "Desconocido",
    notSpecified: "No especificado",
    pending: "Pendiente",
    noDueDate: "Sin fecha",
    notLinked: "No vinculado",
    notGenerated: "No generado",
    draft: "Borrador",
  },
  pl: {
    website: "Strona WWW",
    reviews: "Opinie Google",
    businessAddress: "Adres firmy",
    poBoxAddress: "Adres skrytki pocztowej",
    details: "Szczegoly",
    tip: 'Wskazowka: w oknie drukowania wybierz "Zapisz jako PDF".',
    quoteEstimate: "Wycena / Estymacja",
    invoice: "Faktura",
    contract: "Umowa",
    jobPrefix: "Zlecenie:",
    invoicePrefix: "Faktura #",
    invoiceDocument: "Dokument faktury",
    generatedContract: "Wygenerowana umowa",
    client: "Klient",
    service: "Usluga",
    status: "Status",
    dueDate: "Termin",
    estimatedAmount: "Kwota szacunkowa",
    subtotal: "Kwota bazowa",
    taxState: "Stan podatkowy (USA)",
    taxRate: "Stawka podatku",
    taxAmount: "Kwota podatku",
    estimateTotal: "Laczna kwota wyceny",
    downPaymentPercent: "Procent zaliczki",
    downPaymentAmount: "Kwota zaliczki",
    balanceAfterDownPayment: "Pozostale saldo po zaliczce",
    amount: "Kwota",
    linkedJob: "Powiazane zlecenie",
    contractField: "Umowa",
    unknown: "Nieznany",
    notSpecified: "Nie okreslono",
    pending: "Oczekuje",
    noDueDate: "Brak terminu",
    notLinked: "Niepowiazane",
    notGenerated: "Nie wygenerowano",
    draft: "Szkic",
  },
};

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function normalizeCompanyProfile(data) {
  const normalizedTaxState = String(data?.defaultTaxState || "TX")
    .trim()
    .toUpperCase();
  const safeTaxState = US_STATE_OPTIONS.some(
    (state) => state.code === normalizedTaxState,
  )
    ? normalizedTaxState
    : "TX";

  return {
    ...initialCompanyProfile,
    ...(data || {}),
    businessAddress: String(
      data?.businessAddress || data?.fiscalAddress || "",
    ).trim(),
    poBoxAddress: String(data?.poBoxAddress || "").trim(),
    documentLanguage: ["en", "es", "pl"].includes(
      String(data?.documentLanguage || "").toLowerCase(),
    )
      ? String(data.documentLanguage).toLowerCase()
      : "en",
    forceEnglishTranslation: Boolean(data?.forceEnglishTranslation),
    defaultTaxState: safeTaxState,
    defaultInvoiceDueDays: clampInvoiceDueDays(data?.defaultInvoiceDueDays),
  };
}

function getLocalizedText(value, language = "en") {
  if (typeof value === "string") {
    return value;
  }

  return value?.[language] || value?.en || "";
}

function getLocalizedTerms(value, language = "en") {
  if (Array.isArray(value)) {
    return value;
  }

  return value?.[language] || value?.en || [];
}

function getContractText(language = "en") {
  const translations = {
    en: {
      serviceAgreementSuffix: "SERVICE AGREEMENT",
      client: "Client",
      contractTitle: "Contract title",
      serviceOption: "Service option",
      estimatedAmount: "Estimated amount",
      scopeOfWork: "Scope of work",
      scopeFallback: "Detailed scope to be confirmed by both parties.",
      termsAndConditions: "Terms and conditions",
      additionalTerms: "Additional terms",
      initialStatus: "Initial contract status",
      customOption: "Custom option",
      undefinedClient: "Client to be defined",
      manualContract: "Manual contract",
      previewFallback: "The contract content will appear here.",
    },
    es: {
      serviceAgreementSuffix: "CONTRATO DE SERVICIO",
      client: "Cliente",
      contractTitle: "Titulo del contrato",
      serviceOption: "Opcion de servicio",
      estimatedAmount: "Monto estimado",
      scopeOfWork: "Alcance del trabajo",
      scopeFallback: "El alcance detallado sera confirmado por ambas partes.",
      termsAndConditions: "Terminos y condiciones",
      additionalTerms: "Terminos adicionales",
      initialStatus: "Estado inicial del contrato",
      customOption: "Opcion personalizada",
      undefinedClient: "Cliente por definir",
      manualContract: "Contrato manual",
      previewFallback: "El contenido del contrato aparecera aqui.",
    },
    pl: {
      serviceAgreementSuffix: "UMOWA O USLUGE",
      client: "Klient",
      contractTitle: "Tytul umowy",
      serviceOption: "Opcja uslugi",
      estimatedAmount: "Szacowana kwota",
      scopeOfWork: "Zakres prac",
      scopeFallback:
        "Szczegolowy zakres prac zostanie potwierdzony przez obie strony.",
      termsAndConditions: "Warunki i postanowienia",
      additionalTerms: "Dodatkowe warunki",
      initialStatus: "Poczatkowy status umowy",
      customOption: "Opcja niestandardowa",
      undefinedClient: "Klient do uzupelnienia",
      manualContract: "Umowa niestandardowa",
      previewFallback: "Tresc umowy pojawi sie tutaj.",
    },
  };

  return translations[language] || translations.en;
}

const RUNTIME_I18N = {
  en: {
    receipt: {
      title: "Payment receipt",
      invoiceLabel: "Invoice",
      invoicePayment: "Invoice payment",
      client: "Client",
      invoiceTitle: "Invoice title",
      amountPaid: "Amount paid",
      method: "Method",
      date: "Date",
      reference: "Reference",
      paidTotal: "Paid total",
      balanceDue: "Balance due",
      notAvailable: "N/A",
    },
    paymentValidation: {
      invalidAmount: "Enter a valid amount greater than 0.",
      exceedsBalance: "Payment exceeds the pending balance",
      missingDate: "Payment date is required (YYYY-MM-DD).",
      missingReference: "Reference is required for this method.",
      missingNotes: "Notes are required for this method.",
    },
    errors: {
      generic: "An error occurred",
      loadClients: "Error loading clients",
      loadJobs: "Error loading jobs",
      loadInvoices: "Error loading invoices",
      loadContracts: "Error loading contracts",
      loadCompanyProfile: "Error loading company profile",
      loadEstimateRequests: "Error loading client requests",
      saveClient: "Unable to save client",
      saveClientFallback: "Error saving client",
      saveJob: "Unable to save job",
      saveJobFallback: "Error saving job",
      saveInvoice: "Unable to save invoice",
      saveInvoiceFallback: "Error saving invoice",
      invoiceAi: "Unable to generate invoice AI suggestion",
      invoiceAiFallback: "Error generating invoice with AI",
      deleteInvoice: "Unable to delete invoice",
      deleteInvoiceFallback: "Error deleting invoice",
      registerPayment: "Unable to register payment",
      registerPaymentFallback: "Error registering payment",
      startOnlinePayment: "Unable to start online payment",
      checkoutMissing: "Stripe did not return checkoutUrl",
      openCheckoutFallback: "Error opening online checkout",
      contractMissingClient:
        "Select or type a client before creating the contract.",
      contractMissingBody:
        "Write the contract content or select a valid template.",
      saveManualContract: "Unable to create manual contract",
      saveContractFallback: "Error creating contract",
      contractAi: "Unable to generate AI contract draft",
      contractAiFallback: "Error drafting contract with AI",
      invoiceNeedsJob:
        "Link the invoice to a job before generating the contract.",
      invalidLogoType: "Select a valid image for the logo.",
      invalidLogoSize: "The logo must be 2MB max.",
      saveCompanyProfile: "Unable to save company profile",
      saveCompanyProfileFallback: "Error saving company profile",
      quoteLink: "Unable to generate quote link",
      quoteToken: "Unable to generate quote token",
      quoteLinkFallback: "Error generating quote link",
      missingClientEmail:
        "This client does not have an email saved. Add the client email to send the quote without a manual prompt.",
      sendQuote: "Unable to send quote by email",
      sendQuoteFallback: "Error sending quote by email",
      sendInvoice: "Unable to send invoice by email",
      sendInvoiceFallback: "Error sending invoice by email",
      invalidRecipientPhone: "Enter a valid phone number",
      sendInvoiceText: "Unable to prepare invoice text message",
      sendInvoiceTextFallback: "Error preparing invoice text message",
      updateRequest: "Unable to update request",
      updateRequestFallback: "Error updating request",
      popupBlocked: "Enable pop-ups to print and export as PDF.",
    },
    quoteStatus: {
      signed: "Signed",
      approved: "Approved",
      changes_requested: "Changes requested",
      sent: "Sent",
    },
    generatedFromJob: "Generated from job",
    quoteTitleFallback: "job",
    quoteEmailConfirm: "Send quote for",
    prompts: {
      recipientEmail: "Recipient email (leave blank to use client email):",
      recipientPhone: "Recipient phone number for SMS:",
    },
    messages: {
      invoiceSent: "Invoice sent to {email}",
      invoiceTextOpened: "Opened SMS app for {phone}",
      invoiceTextMessage:
        "Hi, your invoice {invoice} for {amount} is ready. Pay online here: {link}",
    },
  },
  es: {
    receipt: {
      title: "Recibo de pago",
      invoiceLabel: "Factura",
      invoicePayment: "Pago de factura",
      client: "Cliente",
      invoiceTitle: "Concepto de la factura",
      amountPaid: "Monto pagado",
      method: "Metodo",
      date: "Fecha",
      reference: "Referencia",
      paidTotal: "Total pagado",
      balanceDue: "Saldo pendiente",
      notAvailable: "N/A",
    },
    paymentValidation: {
      invalidAmount: "Ingresa un monto valido mayor a 0.",
      exceedsBalance: "El pago excede el saldo pendiente",
      missingDate: "La fecha del pago es obligatoria (YYYY-MM-DD).",
      missingReference: "La referencia es obligatoria para este metodo.",
      missingNotes: "Las notas son obligatorias para este metodo.",
    },
    errors: {
      generic: "Ocurrio un error",
      loadClients: "Error al cargar clientes",
      loadJobs: "Error al cargar trabajos",
      loadInvoices: "Error al cargar facturas",
      loadContracts: "Error al cargar contratos",
      loadCompanyProfile: "Error al cargar perfil de empresa",
      loadEstimateRequests: "Error al cargar solicitudes del cliente",
      saveClient: "No se pudo guardar el cliente",
      saveClientFallback: "Error al guardar cliente",
      saveJob: "No se pudo guardar el trabajo",
      saveJobFallback: "Error al guardar trabajo",
      saveInvoice: "No se pudo guardar la factura",
      saveInvoiceFallback: "Error al guardar factura",
      invoiceAi: "No se pudo generar sugerencia IA para factura",
      invoiceAiFallback: "Error al generar factura con IA",
      deleteInvoice: "No se pudo eliminar la factura",
      deleteInvoiceFallback: "Error al eliminar factura",
      registerPayment: "No se pudo registrar el pago",
      registerPaymentFallback: "Error al registrar pago",
      startOnlinePayment: "No se pudo iniciar el pago online",
      checkoutMissing: "Stripe no devolvio checkoutUrl",
      openCheckoutFallback: "Error al abrir checkout online",
      contractMissingClient:
        "Selecciona o escribe un cliente para crear el contrato.",
      contractMissingBody:
        "Escribe el contenido del contrato o selecciona una plantilla valida.",
      saveManualContract: "No se pudo crear el contrato manual",
      saveContractFallback: "Error al crear contrato",
      contractAi: "No se pudo generar borrador IA para contrato",
      contractAiFallback: "Error al redactar contrato con IA",
      invoiceNeedsJob:
        "Primero vincula la factura a un trabajo para generar el contrato.",
      invalidLogoType: "Selecciona una imagen valida para el logo.",
      invalidLogoSize: "El logo debe pesar maximo 2MB.",
      saveCompanyProfile: "No se pudo guardar el perfil de empresa",
      saveCompanyProfileFallback: "Error al guardar perfil de empresa",
      quoteLink: "No se pudo generar el link de quote",
      quoteToken: "No se pudo generar token de quote",
      quoteLinkFallback: "Error al generar link de quote",
      missingClientEmail:
        "Este cliente no tiene email guardado. Agrega el email del cliente para enviar el quote sin prompt manual.",
      sendQuote: "No se pudo enviar el quote por email",
      sendQuoteFallback: "Error al enviar quote por email",
      sendInvoice: "No se pudo enviar la factura por email",
      sendInvoiceFallback: "Error al enviar la factura por email",
      invalidRecipientPhone: "Ingresa un telefono valido",
      sendInvoiceText: "No se pudo preparar el mensaje de texto de la factura",
      sendInvoiceTextFallback:
        "Error al preparar el mensaje de texto de la factura",
      updateRequest: "No se pudo actualizar la solicitud",
      updateRequestFallback: "Error al actualizar solicitud",
      popupBlocked: "Habilita pop-ups para imprimir y exportar a PDF.",
    },
    quoteStatus: {
      signed: "Firmado",
      approved: "Aprobado",
      changes_requested: "Solicito cambios",
      sent: "Enviado",
    },
    generatedFromJob: "Generada desde el trabajo",
    quoteTitleFallback: "trabajo",
    quoteEmailConfirm: "Enviar quote de",
    prompts: {
      recipientEmail:
        "Email del destinatario (deja vacio para usar el email del cliente):",
      recipientPhone: "Telefono del destinatario para SMS:",
    },
    messages: {
      invoiceSent: "Factura enviada a {email}",
      invoiceTextOpened: "Se abrio la app SMS para {phone}",
      invoiceTextMessage:
        "Hola, tu factura {invoice} por {amount} esta lista. Paga en linea aqui: {link}",
    },
  },
  pl: {
    receipt: {
      title: "Potwierdzenie platnosci",
      invoiceLabel: "Faktura",
      invoicePayment: "Platnosc faktury",
      client: "Klient",
      invoiceTitle: "Tytul faktury",
      amountPaid: "Kwota oplaty",
      method: "Metoda",
      date: "Data",
      reference: "Referencja",
      paidTotal: "Suma oplat",
      balanceDue: "Pozostale saldo",
      notAvailable: "N/A",
    },
    paymentValidation: {
      invalidAmount: "Wprowadz poprawna kwote wieksza niz 0.",
      exceedsBalance: "Platnosc przekracza pozostale saldo",
      missingDate: "Data platnosci jest wymagana (YYYY-MM-DD).",
      missingReference: "Referencja jest wymagana dla tej metody.",
      missingNotes: "Notatki sa wymagane dla tej metody.",
    },
    errors: {
      generic: "Wystapil blad",
      loadClients: "Blad podczas ladowania klientow",
      loadJobs: "Blad podczas ladowania zlecen",
      loadInvoices: "Blad podczas ladowania faktur",
      loadContracts: "Blad podczas ladowania umow",
      loadCompanyProfile: "Blad podczas ladowania profilu firmy",
      loadEstimateRequests: "Blad podczas ladowania prosb klienta",
      saveClient: "Nie udalo sie zapisac klienta",
      saveClientFallback: "Blad podczas zapisu klienta",
      saveJob: "Nie udalo sie zapisac zlecenia",
      saveJobFallback: "Blad podczas zapisu zlecenia",
      saveInvoice: "Nie udalo sie zapisac faktury",
      saveInvoiceFallback: "Blad podczas zapisu faktury",
      invoiceAi: "Nie udalo sie wygenerowac sugestii AI dla faktury",
      invoiceAiFallback: "Blad podczas generowania faktury przez AI",
      deleteInvoice: "Nie udalo sie usunac faktury",
      deleteInvoiceFallback: "Blad podczas usuwania faktury",
      registerPayment: "Nie udalo sie zarejestrowac platnosci",
      registerPaymentFallback: "Blad podczas rejestrowania platnosci",
      startOnlinePayment: "Nie udalo sie uruchomic platnosci online",
      checkoutMissing: "Stripe nie zwrocil checkoutUrl",
      openCheckoutFallback: "Blad podczas otwierania checkout online",
      contractMissingClient:
        "Wybierz lub wpisz klienta przed utworzeniem umowy.",
      contractMissingBody: "Wpisz tresc umowy lub wybierz poprawny szablon.",
      saveManualContract: "Nie udalo sie utworzyc umowy recznej",
      saveContractFallback: "Blad podczas tworzenia umowy",
      contractAi: "Nie udalo sie wygenerowac szkicu umowy przez AI",
      contractAiFallback: "Blad podczas redagowania umowy przez AI",
      invoiceNeedsJob:
        "Najpierw powiaz fakture ze zleceniem, aby wygenerowac umowe.",
      invalidLogoType: "Wybierz prawidlowy obraz logo.",
      invalidLogoSize: "Logo musi miec maksymalnie 2 MB.",
      saveCompanyProfile: "Nie udalo sie zapisac profilu firmy",
      saveCompanyProfileFallback: "Blad podczas zapisu profilu firmy",
      quoteLink: "Nie udalo sie wygenerowac linku oferty",
      quoteToken: "Nie udalo sie wygenerowac tokenu oferty",
      quoteLinkFallback: "Blad podczas generowania linku oferty",
      missingClientEmail:
        "Ten klient nie ma zapisanego adresu email. Dodaj email klienta, aby wyslac oferte bez recznego promptu.",
      sendQuote: "Nie udalo sie wyslac oferty emailem",
      sendQuoteFallback: "Blad podczas wysylania oferty emailem",
      sendInvoice: "Nie udalo sie wyslac faktury emailem",
      sendInvoiceFallback: "Blad podczas wysylania faktury emailem",
      invalidRecipientPhone: "Wpisz poprawny numer telefonu",
      sendInvoiceText: "Nie udalo sie przygotowac wiadomosci SMS z faktura",
      sendInvoiceTextFallback:
        "Blad podczas przygotowywania wiadomosci SMS z faktura",
      updateRequest: "Nie udalo sie zaktualizowac prosby",
      updateRequestFallback: "Blad podczas aktualizacji prosby",
      popupBlocked: "Wlacz pop-upy, aby drukowac i eksportowac do PDF.",
    },
    quoteStatus: {
      signed: "Podpisano",
      approved: "Zatwierdzono",
      changes_requested: "Poproszono o zmiany",
      sent: "Wyslano",
    },
    generatedFromJob: "Wygenerowano ze zlecenia",
    quoteTitleFallback: "zlecenia",
    quoteEmailConfirm: "Wyslac oferte dla",
    prompts: {
      recipientEmail: "Email odbiorcy (zostaw puste, aby uzyc emaila klienta):",
      recipientPhone: "Numer telefonu odbiorcy dla SMS:",
    },
    messages: {
      invoiceSent: "Faktura wyslana do {email}",
      invoiceTextOpened: "Otwarto aplikacje SMS dla numeru {phone}",
      invoiceTextMessage:
        "Czesc, Twoja faktura {invoice} na kwote {amount} jest gotowa. Oplac online tutaj: {link}",
    },
  },
};

export function WorkspaceContent() {
  const { t, i18n } = useTranslation();
  const uiLanguage = ["en", "es", "pl"].includes(i18n.language)
    ? i18n.language
    : "en";
  const _setUiLanguage = useCallback(
    (_lang) => {
      i18n.changeLanguage(_lang);
      if (typeof window !== "undefined")
        window.localStorage.setItem("ui-language", _lang);
      if (typeof document !== "undefined")
        document.documentElement.lang = _lang;
    },
    [i18n],
  );
  const [activeTab, setActiveTab] = useState("dashboard");
  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [clientForm, setClientForm] = useState(initialClient);
  const [jobForm, setJobForm] = useState(getDefaultJobForm());
  const [invoiceForm, setInvoiceForm] = useState(getDefaultInvoiceForm());
  const [companyProfile, setCompanyProfile] = useState(initialCompanyProfile);
  const [companyForm, setCompanyForm] = useState(initialCompanyProfile);
  const [contractForm, setContractForm] = useState(initialContractForm);
  const [estimateLanguageByJobId, setEstimateLanguageByJobId] = useState({});
  const [invoiceLanguageById, setInvoiceLanguageById] = useState({});
  const [contractLanguageById, setContractLanguageById] = useState({});
  const [estimateRequests, setEstimateRequests] = useState([]);
  const [copiedQuoteLinkJobId, setCopiedQuoteLinkJobId] = useState("");
  const [sendingQuoteEmailJobId, setSendingQuoteEmailJobId] = useState("");
  const [sentQuoteEmailJobId, setSentQuoteEmailJobId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showJobForm, setShowJobForm] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showContractForm, setShowContractForm] = useState(false);
  const [editingContractId, setEditingContractId] = useState(null);
  const [jobServiceSearch, setJobServiceSearch] = useState("");
  const [favoriteJobServices, setFavoriteJobServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingCompanyProfile, setSavingCompanyProfile] = useState(false);
  const [invoiceAiLoading, _setInvoiceAiLoading] = useState(false);
  const [contractAiLoading, setContractAiLoading] = useState(false);
  const [paymentDraftByInvoiceId, setPaymentDraftByInvoiceId] = useState({});
  const [openPaymentFormInvoiceId, setOpenPaymentFormInvoiceId] = useState("");
  const [savingInvoicePaymentId, setSavingInvoicePaymentId] = useState("");
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Conversion rate metrics
  const [conversionMetrics, setConversionMetrics] = useState(null);
  const [conversionFilter, setConversionFilter] = useState("month"); // week|month|all|custom
  const [conversionFrom, setConversionFrom] = useState("");
  const [conversionTo, setConversionTo] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("job-service-favorites-v1");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setFavoriteJobServices(
          parsed.filter((item) => typeof item === "string" && item.trim()),
        );
      }
    } catch {
      // ignore invalid local cache
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "job-service-favorites-v1",
      JSON.stringify(favoriteJobServices),
    );
  }, [favoriteJobServices]);

  const printPaymentReceipt = (invoice, payment) => {
    openPrintableDocument({
      title: runtimeText.receipt.title,
      subtitle: invoice.invoiceNumber
        ? `${runtimeText.receipt.invoiceLabel} ${invoice.invoiceNumber}`
        : runtimeText.receipt.invoicePayment,
      items: [
        {
          label: runtimeText.receipt.client,
          value: invoice.clientName || runtimeText.receipt.notAvailable,
        },
        {
          label: runtimeText.receipt.invoiceTitle,
          value: invoice.invoiceTitle || runtimeText.receipt.notAvailable,
        },
        {
          label: runtimeText.receipt.amountPaid,
          value: money(payment?.amount),
        },
        {
          label: runtimeText.receipt.method,
          value: paymentMethodLabel(payment?.method, uiLanguage),
        },
        {
          label: runtimeText.receipt.date,
          value: payment?.date || runtimeText.receipt.notAvailable,
        },
        {
          label: runtimeText.receipt.reference,
          value: payment?.reference || runtimeText.receipt.notAvailable,
        },
        {
          label: runtimeText.receipt.paidTotal,
          value: money(invoice.paidAmount),
        },
        {
          label: runtimeText.receipt.balanceDue,
          value: money(invoice.balanceDue),
        },
      ],
      notes: payment?.notes || "",
      preferredLanguage: uiLanguage,
    });
  };

  const validatePaymentDraft = (draft, invoice) => {
    const amount = Number(String(draft.amount || "").replace(/[^0-9.]/g, ""));
    const balance = Number(invoice.balanceDue || invoice.amount || 0);
    const method = String(draft.method || "other").toLowerCase();

    if (!Number.isFinite(amount) || amount <= 0)
      return runtimeText.paymentValidation.invalidAmount;
    if (amount > balance)
      return `${runtimeText.paymentValidation.exceedsBalance} (${balance.toFixed(2)}).`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(draft.date || "")))
      return runtimeText.paymentValidation.missingDate;
    if (
      REFERENCE_REQUIRED_METHODS.has(method) &&
      !String(draft.reference || "").trim()
    )
      return runtimeText.paymentValidation.missingReference;
    if (NOTES_REQUIRED_METHODS.has(method) && !String(draft.notes || "").trim())
      return runtimeText.paymentValidation.missingNotes;
    return "";
  };

  const _fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    const runtimeErrors =
      (RUNTIME_I18N[uiLanguage] || RUNTIME_I18N.en)?.errors ||
      RUNTIME_I18N.en.errors;

    try {
      const [
        clientsRes,
        jobsRes,
        invoicesRes,
        contractsRes,
        companyProfileRes,
        estimateRequestsRes,
      ] = await Promise.all([
        apiFetch("/api/clients"),
        apiFetch("/api/jobs"),
        apiFetch("/api/invoices"),
        apiFetch("/api/contracts"),
        apiFetch("/api/company-profile"),
        apiFetch("/api/estimate-requests"),
      ]);

      const [
        clientsData,
        jobsData,
        invoicesData,
        contractsData,
        companyProfilePayload,
        estimateRequestsData,
      ] = await Promise.all([
        getJsonOrThrow(clientsRes, runtimeErrors.loadClients),
        getJsonOrThrow(jobsRes, runtimeErrors.loadJobs),
        getJsonOrThrow(invoicesRes, runtimeErrors.loadInvoices),
        getJsonOrThrow(contractsRes, runtimeErrors.loadContracts),
        getJsonOrThrow(companyProfileRes, runtimeErrors.loadCompanyProfile),
        getJsonOrThrow(estimateRequestsRes, runtimeErrors.loadEstimateRequests),
      ]);

      setClients(clientsData);
      setJobs(jobsData);
      setInvoices(invoicesData);
      setContracts(contractsData);
      setEstimateRequests(
        Array.isArray(estimateRequestsData) ? estimateRequestsData : [],
      );
      const normalizedProfile = normalizeCompanyProfile(
        companyProfilePayload.data,
      );
      setCompanyProfile(normalizedProfile);
      setCompanyForm(normalizedProfile);
    } catch (err) {
      console.error(err);
      setError(err.message || runtimeErrors.generic);
    } finally {
      setLoading(false);
    }
  }, [uiLanguage]);

  // Per-tab lazy loader: track which tabs have been fetched
  const [loadedTabs, setLoadedTabs] = useState(new Set());
  const [dashboardMetrics, setDashboardMetrics] = useState(null);
  const [revenueDashboard, setRevenueDashboard] = useState(null);
  const [revenueLoading, setRevenueLoading] = useState(true);
  const [revenueError, setRevenueError] = useState("");

  const fetchRevenueDashboard = useCallback(async () => {
    setRevenueLoading(true);
    setRevenueError("");
    try {
      const sessionRes = await apiFetch("/api/auth/me", {
        suppressUnauthorizedEvent: true,
      });
      const sessionPayload = await getJsonOrThrow(
        sessionRes,
        "Failed to load session",
      );
      const contractorId = String(
        sessionPayload?.data?.tenantDbId || sessionPayload?.data?.userId || "",
      );

      if (!contractorId) {
        throw new Error("Missing contractor id for revenue dashboard");
      }

      const { data, error: rpcError } = await supabase.rpc(
        "get_revenue_dashboard",
        {
          contractor_id: contractorId,
          limit_count: 10,
        },
      );

      if (rpcError) {
        throw rpcError;
      }

      setRevenueDashboard({
        totalRevenue: Number(data?.totalRevenue || 0),
        totalPayments: Number(data?.totalPayments || 0),
      });
    } catch (err) {
      console.error("[dashboard] Failed to load revenue dashboard", err);
      setRevenueDashboard(null);
      setRevenueError(err?.message || "Failed to load revenue dashboard");
    } finally {
      setRevenueLoading(false);
    }
  }, []);

  const _fetchDashboardMetrics = useCallback(async () => {
    try {
      const res = await apiFetch("/api/dashboard-metrics");
      if (!res.ok) return;
      const data = await res.json();
      setDashboardMetrics(data);
      // Pre-seed conversion metrics from the aggregated response
      if (data?.conversion) setConversionMetrics(data.conversion);
    } catch {
      // silent � full data still loaded via fetchData
    }
  }, []);

  // Load company profile + dashboard metrics on mount (fast, no full scans)
  const fetchInitial = useCallback(async () => {
    setLoading(true);
    setError("");
    const runtimeErrors =
      (RUNTIME_I18N[uiLanguage] || RUNTIME_I18N.en)?.errors ||
      RUNTIME_I18N.en.errors;
    try {
      const [profileRes, metricsRes] = await Promise.all([
        apiFetch("/api/company-profile"),
        apiFetch("/api/dashboard-metrics"),
      ]);
      const profilePayload = await getJsonOrThrow(
        profileRes,
        runtimeErrors.loadCompanyProfile,
      );
      const normalizedProfile = normalizeCompanyProfile(profilePayload.data);
      setCompanyProfile(normalizedProfile);
      setCompanyForm(normalizedProfile);

      if (metricsRes.ok) {
        const mData = await metricsRes.json();
        setDashboardMetrics(mData);
        if (mData?.conversion) setConversionMetrics(mData.conversion);
        // Seed estimate-requests count
        if (mData?.estimateRequests?.total >= 0) {
          setEstimateRequests(
            Array.from({ length: mData.estimateRequests.total }, (_, i) => ({
              _id: `__placeholder_${i}`,
            })),
          );
        }
      }
    } catch (err) {
      console.error(err);
      setError(
        err.message ||
          (RUNTIME_I18N[uiLanguage] || RUNTIME_I18N.en).errors.generic,
      );
    } finally {
      setLoading(false);
    }
  }, [uiLanguage]);

  // Fetch full data for a specific tab the first time it is opened
  const fetchTabData = useCallback(
    async (tab) => {
      if (loadedTabs.has(tab)) return;
      const runtimeErrors =
        (RUNTIME_I18N[uiLanguage] || RUNTIME_I18N.en)?.errors ||
        RUNTIME_I18N.en.errors;
      try {
        if (tab === "clients") {
          const res = await apiFetch("/api/clients");
          const data = await getJsonOrThrow(res, runtimeErrors.loadClients);
          setClients(data);
        } else if (tab === "jobs") {
          const res = await apiFetch("/api/jobs");
          const data = await getJsonOrThrow(res, runtimeErrors.loadJobs);
          setJobs(data);
        } else if (tab === "invoices") {
          const res = await apiFetch("/api/invoices");
          const data = await getJsonOrThrow(res, runtimeErrors.loadInvoices);
          setInvoices(data);
        } else if (tab === "contracts") {
          const res = await apiFetch("/api/contracts");
          const data = await getJsonOrThrow(res, runtimeErrors.loadContracts);
          setContracts(data);
        } else if (tab === "branding") {
          // already loaded; nothing extra needed
        }
        setLoadedTabs((prev) => new Set([...prev, tab]));
      } catch (err) {
        console.error(err);
        setError(
          err.message ||
            (RUNTIME_I18N[uiLanguage] || RUNTIME_I18N.en).errors.generic,
        );
      }
    },
    [loadedTabs, uiLanguage],
  );

  // Also fetch estimate-requests lazily (needed in dashboard + jobs)
  const fetchEstimateRequestsOnce = useCallback(async () => {
    if (loadedTabs.has("estimate-requests")) return;
    try {
      const res = await apiFetch("/api/estimate-requests");
      if (!res.ok) return;
      const data = await res.json();
      setEstimateRequests(Array.isArray(data) ? data : []);
      setLoadedTabs((prev) => new Set([...prev, "estimate-requests"]));
    } catch {
      // silent
    }
  }, [loadedTabs]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  useEffect(() => {
    fetchRevenueDashboard();
  }, [fetchRevenueDashboard]);

  useEffect(() => {
    if (activeTab !== "dashboard") {
      fetchTabData(activeTab);
    }
    // Also get estimate-requests when jobs tab opens (for quote requests panel)
    if (activeTab === "jobs") {
      fetchEstimateRequestsOnce();
    }
  }, [activeTab, fetchTabData, fetchEstimateRequestsOnce]);

  // -- Notification polling (every 20s) -------------------------------------
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiFetch("/api/notifications");
      if (!res.ok) return;
      const payload = await res.json();
      if (payload?.success && Array.isArray(payload.data)) {
        setNotifications(payload.data);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 20000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications([]);
    try {
      await apiFetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      // silent
    }
  }, []);

  const fetchConversionMetrics = useCallback(async (filter, from, to) => {
    try {
      let url = `/api/clients/conversion?period=${filter}`;
      if (filter === "custom" && from && to) {
        url += `&from=${from}&to=${to}`;
      }
      const res = await apiFetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setConversionMetrics(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchConversionMetrics(conversionFilter, conversionFrom, conversionTo);
  }, [fetchConversionMetrics, conversionFilter, conversionFrom, conversionTo]);

  const updateClientLeadStatus = useCallback(
    async (clientId, newStatus) => {
      try {
        const res = await apiFetch(`/api/clients/${clientId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadStatus: newStatus }),
        });
        if (!res.ok) return;
        const result = await res.json();
        if (result?.data) {
          setClients((prev) =>
            prev.map((c) => (c._id === clientId ? result.data : c)),
          );
          // Refresh conversion metrics after a status change
          fetchConversionMetrics(
            conversionFilter,
            conversionFrom,
            conversionTo,
          );
        }
      } catch {
        // silent
      }
    },
    [fetchConversionMetrics, conversionFilter, conversionFrom, conversionTo],
  );

  const findClientById = (clientId) =>
    clients.find((client) => client._id === clientId) || null;

  const findClientByName = (clientName) =>
    clients.find(
      (client) =>
        String(client.name || "").toLowerCase() ===
        String(clientName || "").toLowerCase(),
    ) || null;

  const getLinkedInvoice = (jobId) =>
    invoices.find((invoice) => invoice.jobId === jobId) || null;

  const getLinkedJob = (invoice) =>
    jobs.find((job) => job._id === invoice.jobId) || null;

  const addClient = async () => {
    try {
      const res = await apiFetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientForm),
      });
      const result = await getJsonOrThrow(res, runtimeText.errors.saveClient);
      setClients([result.data, ...clients]);
      setClientForm(initialClient);
      setShowClientForm(false);
    } catch (err) {
      console.error(err);
      setError(err.message || runtimeText.errors.saveClientFallback);
    }
  };

  const saveJob = async () => {
    try {
      const res = await apiFetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobForm),
      });
      const result = await getJsonOrThrow(res, runtimeText.errors.saveJob);
      setJobs([result.data, ...jobs]);
      setJobForm(getDefaultJobForm(companyProfile));
      setShowJobForm(false);
    } catch (err) {
      console.error(err);
      setError(err.message || runtimeText.errors.saveJobFallback);
    }
  };

  const resetInvoiceForm = () => {
    setInvoiceForm(getDefaultInvoiceForm(companyProfile));
    setSelectedInvoiceId(null);
  };

  const saveInvoice = async () => {
    try {
      const method = selectedInvoiceId ? "PATCH" : "POST";
      const url = selectedInvoiceId
        ? `/api/invoices/${selectedInvoiceId}`
        : "/api/invoices";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...invoiceForm,
          lineItems: parseInvoiceLineItems(invoiceForm.lineItemsText),
        }),
      });
      const result = await getJsonOrThrow(res, runtimeText.errors.saveInvoice);

      if (selectedInvoiceId) {
        setInvoices(
          invoices.map((invoice) =>
            invoice._id === selectedInvoiceId ? result.data : invoice,
          ),
        );
      } else {
        setInvoices([result.data, ...invoices]);
      }

      resetInvoiceForm();
      setShowInvoiceForm(false);
    } catch (err) {
      console.error(err);
      setError(err.message || runtimeText.errors.saveInvoiceFallback);
    }
  };

  const registerInvoicePayment = async (invoice) => {
    const draft =
      paymentDraftByInvoiceId[invoice._id] || initialPaymentDraft(invoice);
    const validationError = validatePaymentDraft(draft, invoice);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSavingInvoicePaymentId(invoice._id);
    setError("");
    try {
      const res = await apiFetch(`/api/invoices/${invoice._id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: draft.amount,
          method: draft.method,
          date: draft.date,
          reference: draft.reference,
          notes: draft.notes,
        }),
      });
      const payload = await getJsonOrThrow(
        res,
        runtimeText.errors.registerPayment,
      );
      setInvoices((current) =>
        current.map((item) => (item._id === invoice._id ? payload.data : item)),
      );
      setOpenPaymentFormInvoiceId("");
      setPaymentDraftByInvoiceId((current) => {
        const next = { ...current };
        delete next[invoice._id];
        return next;
      });
      printPaymentReceipt(
        payload.data,
        payload.data.payments?.[payload.data.payments.length - 1] || draft,
      );
      if (selectedInvoiceId === invoice._id) {
        editInvoice(payload.data);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || runtimeText.errors.registerPaymentFallback);
    } finally {
      setSavingInvoicePaymentId("");
    }
  };

  const getInvoiceCheckoutUrl = async (invoice) => {
    const res = await apiFetch(`/api/invoices/${invoice._id}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: invoice.balanceDue || invoice.amount }),
    });
    const payload = await getJsonOrThrow(
      res,
      runtimeText.errors.startOnlinePayment,
    );
    const checkoutUrl = payload?.data?.checkoutUrl;
    if (!checkoutUrl) {
      throw new Error(runtimeText.errors.checkoutMissing);
    }
    return checkoutUrl;
  };

  const payInvoiceOnline = async (invoice) => {
    try {
      const checkoutUrl = await getInvoiceCheckoutUrl(invoice);
      window.open(checkoutUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      setError(err.message || runtimeText.errors.openCheckoutFallback);
    }
  };

  const sendInvoiceByEmail = async (invoice) => {
    try {
      const linkedClient =
        findClientById(invoice.clientId) ||
        findClientByName(invoice.clientName);
      const suggested = String(
        invoice.invoiceEmailSentTo || linkedClient?.email || "",
      )
        .trim()
        .toLowerCase();
      const promptValue = window.prompt(
        runtimeText.prompts.recipientEmail,
        suggested,
      );
      if (promptValue === null) return;

      const recipientEmail = String(promptValue || "")
        .trim()
        .toLowerCase();
      const res = await apiFetch(`/api/invoices/${invoice._id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipientEmail ? { recipientEmail } : {}),
      });
      const payload = await getJsonOrThrow(res, runtimeText.errors.sendInvoice);

      if (payload?.data?.invoice?._id) {
        setInvoices((current) =>
          current.map((item) =>
            item._id === invoice._id
              ? {
                  ...item,
                  ...payload.data.invoice,
                }
              : item,
          ),
        );
      }

      const sentTo = payload?.data?.recipientEmail || recipientEmail;
      if (sentTo) {
        window.alert(
          runtimeText.messages.invoiceSent.replace("{email}", sentTo),
        );
      }
    } catch (err) {
      console.error(err);
      setError(err.message || runtimeText.errors.sendInvoiceFallback);
    }
  };

  const sendInvoiceByText = async (invoice) => {
    try {
      const linkedClient =
        findClientById(invoice.clientId) ||
        findClientByName(invoice.clientName);
      const suggested = String(linkedClient?.phone || "").trim();
      const promptValue = window.prompt(
        runtimeText.prompts.recipientPhone,
        suggested,
      );
      if (promptValue === null) return;

      const recipientPhone = normalizePhoneInput(promptValue);
      if (!recipientPhone || recipientPhone.length < 7) {
        throw new Error(runtimeText.errors.invalidRecipientPhone);
      }

      const checkoutUrl = await getInvoiceCheckoutUrl(invoice);
      const amount = Number(invoice.balanceDue || invoice.amount || 0).toFixed(
        2,
      );
      const smsBody = runtimeText.messages.invoiceTextMessage
        .replace("{invoice}", invoice.invoiceNumber || uiText.labels.noNumber)
        .replace("{amount}", amount)
        .replace("{link}", checkoutUrl);

      window.location.href = `sms:${recipientPhone}?body=${encodeURIComponent(smsBody)}`;
      window.alert(
        runtimeText.messages.invoiceTextOpened.replace(
          "{phone}",
          recipientPhone,
        ),
      );
    } catch (err) {
      console.error(err);
      setError(err.message || runtimeText.errors.sendInvoiceTextFallback);
    }
  };

  const handleJobClientChange = (clientId) => {
    const selectedClient = findClientById(clientId);
    setJobForm({
      ...jobForm,
      clientId: selectedClient?._id || "",
      clientName: selectedClient?.name || "",
      service: jobForm.service || selectedClient?.service || "",
    });
  };

  const applyJobServiceTemplate = (service) => {
    setJobForm((current) => ({
      ...current,
      service,
      title: String(current.title || "").trim() ? current.title : service,
    }));
  };

  const isFavoriteJobService = (service) =>
    favoriteJobServices.includes(service);

  const toggleFavoriteJobService = (service) => {
    setFavoriteJobServices((current) =>
      current.includes(service)
        ? current.filter((item) => item !== service)
        : [service, ...current].slice(0, 20),
    );
  };

  const filterServicesBySearch = (services) => {
    const normalizedSearch = String(jobServiceSearch || "")
      .trim()
      .toLowerCase();
    if (!normalizedSearch) return services;
    return services.filter((service) =>
      service.toLowerCase().includes(normalizedSearch),
    );
  };

  const handleInvoiceClientChange = (clientId) => {
    const selectedClient = findClientById(clientId);
    setInvoiceForm({
      ...invoiceForm,
      clientId: selectedClient?._id || "",
      clientName: selectedClient?.name || invoiceForm.clientName,
    });
  };

  const deriveInvoiceNumberFromJob = (job) => {
    if (!job) return "";
    const normalizeDigits = (value) => {
      const parsed = Number.parseInt(String(value || ""), 10);
      return Number.isFinite(parsed) ? String(parsed) : "";
    };

    const candidate = String(
      job.estimateNumber || job.jobNumber || job.quoteNumber || job.title || "",
    )
      .trim()
      .toUpperCase();

    const fromInvoice = candidate.match(/\bINV[-\s_]*(\d{1,6})\b/);
    if (fromInvoice) return `INV-${normalizeDigits(fromInvoice[1])}`;

    const fromEstimate = candidate.match(
      /\b(?:EST|ESTIMATE|QUOTE|JOB)[-\s_]*(\d{1,6})\b/,
    );
    if (fromEstimate) return `INV-${normalizeDigits(fromEstimate[1])}`;

    const plainNumber = candidate.match(/\b(\d{1,6})\b/);
    if (plainNumber) return `INV-${normalizeDigits(plainNumber[1])}`;

    return "";
  };

  const handleInvoiceJobChange = (jobId) => {
    const selectedJob = jobs.find((job) => job._id === jobId);
    const linkedClient =
      findClientById(selectedJob?.clientId) ||
      findClientByName(selectedJob?.clientName);
    const autoNumber = deriveInvoiceNumberFromJob(selectedJob);

    setInvoiceForm({
      ...invoiceForm,
      jobId: selectedJob?._id || "",
      clientId: linkedClient?._id || selectedJob?.clientId || "",
      clientName:
        linkedClient?.name || selectedJob?.clientName || invoiceForm.clientName,
      invoiceNumber: autoNumber || invoiceForm.invoiceNumber,
      invoiceTitle:
        selectedJob?.title || selectedJob?.service || invoiceForm.invoiceTitle,
      amount: selectedJob?.price || invoiceForm.amount,
      dueDate: selectedJob?.dueDate || invoiceForm.dueDate,
      notes: selectedJob
        ? `${runtimeText.generatedFromJob}: ${selectedJob.title}`
        : invoiceForm.notes,
    });
  };

  const getTemplateOptions = (
    category,
    language = contractForm.contractLanguage,
  ) =>
    Object.entries(CONTRACT_TEMPLATE_LIBRARY[category]?.options || {}).map(
      ([value, option]) => ({
        value,
        ...option,
        label: getLocalizedText(option.label, language),
      }),
    );

  const buildManualContractBody = (formState) => {
    const language = ["en", "es", "pl"].includes(formState.contractLanguage)
      ? formState.contractLanguage
      : "en";
    const contractText = getContractText(language);
    const template = CONTRACT_TEMPLATE_LIBRARY[formState.contractCategory];
    const selectedOption = template?.options?.[formState.contractOption];
    const clientLabel = formState.clientName || contractText.undefinedClient;
    const titleLabel =
      formState.jobTitle ||
      getLocalizedText(selectedOption?.label, language) ||
      contractText.manualContract;
    const amountLabel = money(formState.amount);

    if (formState.mode === "custom") {
      return String(formState.body || "").trim();
    }

    return [
      `${getLocalizedText(template?.label, language) || "Service"} ${contractText.serviceAgreementSuffix}`,
      "",
      `${contractText.client}: ${clientLabel}`,
      `${contractText.contractTitle}: ${titleLabel}`,
      `${contractText.serviceOption}: ${getLocalizedText(selectedOption?.label, language) || contractText.customOption}`,
      `${contractText.estimatedAmount}: ${amountLabel}`,
      "",
      `${contractText.scopeOfWork}:`,
      getLocalizedText(selectedOption?.scope, language) ||
        contractText.scopeFallback,
      "",
      `${contractText.termsAndConditions}:`,
      ...getLocalizedTerms(selectedOption?.terms, language).map(
        (term, index) => `${index + 1}. ${term}`,
      ),
      ...(formState.additionalTerms.trim()
        ? [
            "",
            `${contractText.additionalTerms}:`,
            formState.additionalTerms.trim(),
          ]
        : []),
      "",
      `${contractText.initialStatus}: ${formState.status || "Draft"}`,
    ].join("\n");
  };

  const handleContractClientChange = (clientId) => {
    const selectedClient = findClientById(clientId);
    setContractForm({
      ...contractForm,
      clientId: selectedClient?._id || "",
      clientName: selectedClient?.name || "",
    });
  };

  const handleContractJobChange = (jobId) => {
    const selectedJob = jobs.find((job) => job._id === jobId);
    const linkedClient =
      findClientById(selectedJob?.clientId) ||
      findClientByName(selectedJob?.clientName);

    setContractForm({
      ...contractForm,
      jobId: selectedJob?._id || "",
      jobTitle: selectedJob?.title || contractForm.jobTitle,
      amount: selectedJob?.price || contractForm.amount,
      clientId:
        linkedClient?._id || selectedJob?.clientId || contractForm.clientId,
      clientName:
        linkedClient?.name ||
        selectedJob?.clientName ||
        contractForm.clientName,
    });
  };

  const resetContractForm = () => {
    setContractForm(initialContractForm);
    setEditingContractId(null);
  };

  const loadContractForEdit = (contract) => {
    setContractForm({
      mode: contract.contractCategory === "custom" ? "custom" : "template",
      contractLanguage: contract.contractLanguage || "en",
      clientId: contract.clientId || "",
      clientName: contract.clientName || "",
      jobId: contract.jobId || "",
      jobTitle: contract.jobTitle || "",
      amount: contract.amount || "",
      status: contract.status || "Draft",
      contractCategory: contract.contractCategory || "patios",
      contractOption: contract.contractOption || "patio_maintenance",
      additionalTerms: "",
      body: contract.body || "",
    });
    setEditingContractId(contract._id);
    setShowContractForm(true);
    setTimeout(() => {
      document
        .querySelector("[data-contract-form]")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const saveManualContract = async () => {
    const payload = {
      clientId: contractForm.clientId,
      clientName: contractForm.clientName,
      jobId: contractForm.jobId,
      jobTitle: contractForm.jobTitle,
      amount: contractForm.amount,
      status: contractForm.status,
      contractLanguage: contractForm.contractLanguage,
      contractCategory:
        contractForm.mode === "template"
          ? contractForm.contractCategory
          : "custom",
      contractOption:
        contractForm.mode === "template"
          ? contractForm.contractOption
          : "custom",
      body: buildManualContractBody(contractForm),
    };

    if (!payload.clientId && !payload.clientName) {
      setError(runtimeText.errors.contractMissingClient);
      return;
    }

    if (!payload.body.trim()) {
      setError(runtimeText.errors.contractMissingBody);
      return;
    }

    try {
      if (editingContractId) {
        const res = await apiFetch(`/api/contracts/${editingContractId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await getJsonOrThrow(
          res,
          runtimeText.errors.saveManualContract,
        );
        setContracts((current) =>
          current.map((c) => (c._id === editingContractId ? result.data : c)),
        );
      } else {
        const res = await apiFetch("/api/contracts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await getJsonOrThrow(
          res,
          runtimeText.errors.saveManualContract,
        );
        setContracts([result.data, ...contracts]);
        if (payload.jobId) {
          setJobs((current) =>
            current.map((job) =>
              job._id === payload.jobId
                ? { ...job, contractId: result.data._id }
                : job,
            ),
          );
        }
      }
      resetContractForm();
      setShowContractForm(false);
    } catch (err) {
      console.error(err);
      setError(err.message || runtimeText.errors.saveContractFallback);
    }
  };

  const runContractAI = async () => {
    setContractAiLoading(true);
    setError("");

    try {
      const selectedOption =
        CONTRACT_TEMPLATE_LIBRARY[contractForm.contractCategory]?.options?.[
          contractForm.contractOption
        ];
      const res = await apiFetch("/api/ai/contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: contractForm.contractLanguage,
          category: getLocalizedText(
            CONTRACT_TEMPLATE_LIBRARY[contractForm.contractCategory]?.label,
            contractForm.contractLanguage,
          ),
          option: getLocalizedText(
            selectedOption?.label,
            contractForm.contractLanguage,
          ),
          clientName: contractForm.clientName,
          jobTitle: contractForm.jobTitle,
          amount: contractForm.amount,
          dueDate:
            jobs.find((job) => job._id === contractForm.jobId)?.dueDate || "",
          status: contractForm.status,
          scopeDetails: getLocalizedText(
            selectedOption?.scope,
            contractForm.contractLanguage,
          ),
          additionalTerms: contractForm.additionalTerms,
          body: contractForm.mode === "custom" ? contractForm.body : "",
        }),
      });
      const payload = await getJsonOrThrow(res, runtimeText.errors.contractAi);
      setContractForm((current) => ({
        ...current,
        mode: "custom",
        body: payload.data.body || current.body,
      }));
    } catch (err) {
      console.error(err);
      setError(err.message || runtimeText.errors.contractAiFallback);
    } finally {
      setContractAiLoading(false);
    }
  };

  const openInvoiceForJob = (job) => {
    const linkedInvoice = getLinkedInvoice(job._id);
    if (linkedInvoice) {
      editInvoice(linkedInvoice);
      return;
    }

    const linkedClient =
      findClientById(job.clientId) || findClientByName(job.clientName);

    setInvoiceForm({
      ...initialInvoice,
      clientId: linkedClient?._id || job.clientId || "",
      clientName: linkedClient?.name || job.clientName || "",
      jobId: job._id,
      invoiceTitle: job.title || job.service || "",
      amount: job.price || "",
      dueDate: job.dueDate || "",
      notes: `${runtimeText.generatedFromJob}: ${job.title}`,
    });
    setSelectedInvoiceId(null);
    setShowInvoiceForm(true);
    setActiveTab("invoices");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const createContractFromInvoice = async (invoice) => {
    if (invoice.contractId) {
      setActiveTab("contracts");
      return;
    }

    if (!invoice.jobId) {
      setError(runtimeText.errors.invoiceNeedsJob);
      return;
    }

    try {
      const res = await apiFetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice._id }),
      });
      const result = await getJsonOrThrow(
        res,
        runtimeText.errors.saveManualContract,
      );
      const contract = result.data;

      setContracts([
        contract,
        ...contracts.filter((item) => item._id !== contract._id),
      ]);
      setInvoices(
        invoices.map((item) =>
          item._id === invoice._id
            ? {
                ...item,
                contractId: contract._id,
                contractStatus: contract.status,
              }
            : item,
        ),
      );
      setJobs(
        jobs.map((job) =>
          job._id === contract.jobId
            ? { ...job, contractId: contract._id }
            : job,
        ),
      );
      setActiveTab("contracts");
    } catch (err) {
      console.error(err);
      setError(err.message || runtimeText.errors.saveContractFallback);
    }
  };

  const handleLogoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError(runtimeText.errors.invalidLogoType);
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError(runtimeText.errors.invalidLogoSize);
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCompanyForm((current) => ({
        ...current,
        logoDataUrl: String(reader.result || ""),
      }));
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const resetCompanyForm = () => {
    setCompanyForm(companyProfile || initialCompanyProfile);
  };

  const saveCompanyProfile = async () => {
    setSavingCompanyProfile(true);
    setError("");

    try {
      const res = await apiFetch("/api/company-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyForm),
      });
      const payload = await getJsonOrThrow(
        res,
        runtimeText.errors.saveCompanyProfile,
      );
      const normalizedProfile = normalizeCompanyProfile(payload.data);
      setCompanyProfile(normalizedProfile);
      setCompanyForm(normalizedProfile);
    } catch (err) {
      console.error(err);
      setError(err.message || runtimeText.errors.saveCompanyProfileFallback);
    } finally {
      setSavingCompanyProfile(false);
    }
  };

  const buildQuoteUrl = (token) => {
    if (!token || typeof window === "undefined") return "";
    return `${window.location.origin}/quote/${token}`;
  };

  const createOrCopyQuoteLink = async (job, rotate = false) => {
    try {
      const res = await apiFetch(`/api/jobs/${job._id}/quote-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotate }),
      });

      const payload = await getJsonOrThrow(res, runtimeText.errors.quoteLink);
      const token = payload?.data?.quoteToken;
      if (!token) {
        throw new Error(runtimeText.errors.quoteToken);
      }

      const nextJobs = jobs.map((item) => {
        if (item._id !== job._id) return item;

        const shouldResetQuoteState = rotate || !item.quoteToken;
        return {
          ...item,
          quoteToken: token,
          ...(shouldResetQuoteState
            ? {
                quoteStatus: "sent",
                quoteApprovedAt: "",
                quoteSignedAt: "",
                quoteApprovedByName: "",
                quoteApprovedByEmail: "",
                quoteSignedByName: "",
                quoteSignedByEmail: "",
                quoteSignatureText: "",
              }
            : {}),
        };
      });
      setJobs(nextJobs);

      const url = buildQuoteUrl(token);
      if (url && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopiedQuoteLinkJobId(job._id);
        setTimeout(() => setCopiedQuoteLinkJobId(""), 1800);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || runtimeText.errors.quoteLinkFallback);
    }
  };

  const sendQuoteByEmail = async (job) => {
    const linkedClient =
      findClientById(job.clientId) || findClientByName(job.clientName);
    const normalizedEmail = String(job.quoteSentTo || linkedClient?.email || "")
      .trim()
      .toLowerCase();
    if (!normalizedEmail) {
      setError(runtimeText.errors.missingClientEmail);
      return;
    }

    const confirmed = window.confirm(
      `${runtimeText.quoteEmailConfirm} "${job.title || runtimeText.quoteTitleFallback}" a ${normalizedEmail}?`,
    );
    if (!confirmed) {
      return;
    }

    setSendingQuoteEmailJobId(job._id);
    setError("");

    try {
      const res = await apiFetch(`/api/jobs/${job._id}/send-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: normalizedEmail }),
      });

      const payload = await getJsonOrThrow(res, runtimeText.errors.sendQuote);
      const quoteToken = payload?.data?.quoteToken;
      const sentTo = payload?.data?.recipientEmail || normalizedEmail;

      setJobs((current) =>
        current.map((item) =>
          item._id === job._id
            ? {
                ...item,
                quoteToken: quoteToken || item.quoteToken,
                quoteSentTo: sentTo,
              }
            : item,
        ),
      );

      setSentQuoteEmailJobId(job._id);
      setTimeout(() => setSentQuoteEmailJobId(""), 2200);
    } catch (err) {
      console.error(err);
      setError(err.message || runtimeText.errors.sendQuoteFallback);
    } finally {
      setSendingQuoteEmailJobId("");
    }
  };

  const updateEstimateRequestStatus = async (requestId, status) => {
    try {
      const res = await apiFetch("/api/estimate-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, status }),
      });
      const payload = await getJsonOrThrow(
        res,
        runtimeText.errors.updateRequest,
      );
      const updated = payload?.data;
      if (!updated?._id) return;
      setEstimateRequests((current) =>
        current.map((item) => (item._id === updated._id ? updated : item)),
      );
    } catch (err) {
      console.error(err);
      setError(err.message || runtimeText.errors.updateRequestFallback);
    }
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const resolveDocumentLanguage = (preferredLanguage = "default") => {
    if (["en", "es", "pl"].includes(preferredLanguage)) {
      return preferredLanguage;
    }

    if (companyProfile.forceEnglishTranslation) {
      return "en";
    }

    return ["en", "es", "pl"].includes(companyProfile.documentLanguage)
      ? companyProfile.documentLanguage
      : "en";
  };

  const openPrintableDocument = ({
    title,
    subtitle = "",
    items = [],
    notes = "",
    preferredLanguage = "default",
  }) => {
    if (typeof window === "undefined") {
      return;
    }

    const printableItems = items
      .map(
        (item) =>
          `<tr><th>${escapeHtml(item.label)}</th><td>${escapeHtml(item.value)}</td></tr>`,
      )
      .join("");

    const language = resolveDocumentLanguage(preferredLanguage);
    const docText = DOC_I18N[language] || DOC_I18N.en;

    const printableNotes = notes
      ? `<section class="notes"><h3>${escapeHtml(docText.details)}</h3><p>${escapeHtml(notes).replace(/\n/g, "<br />")}</p></section>`
      : "";

    const brandingName = companyProfile.companyName || "ContractorFlow";
    const brandingLogo = companyProfile.logoDataUrl || "";
    const brandingWebsite = companyProfile.websiteUrl || "";
    const brandingReviews = companyProfile.googleReviewsUrl || "";
    const brandingPhone = companyProfile.phone || "";
    const brandingContactLines = [
      brandingPhone,
      companyProfile.businessAddress
        ? `${docText.businessAddress}: ${companyProfile.businessAddress}`
        : "",
      companyProfile.poBoxAddress
        ? `${docText.poBoxAddress}: ${companyProfile.poBoxAddress}`
        : "",
    ].filter(Boolean);
    const brandingLegal = companyProfile.legalFooter || "";

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px;
        color: #1b1b1b;
        background: #ffffff;
        font-family: "Segoe UI", Arial, sans-serif;
      }
      h1 {
        margin: 0;
        font-size: 28px;
      }
      .brand-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        border-bottom: 1px solid #e5e5e5;
        padding-bottom: 18px;
      }
      .brand-logo {
        max-width: 180px;
        max-height: 72px;
        object-fit: contain;
      }
      .brand-links {
        margin-top: 8px;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        font-size: 13px;
      }
      .brand-contact {
        margin-top: 8px;
        color: #555;
        font-size: 13px;
      }
      .brand-links a {
        color: #0b69ff;
        text-decoration: none;
      }
      .subtitle {
        margin: 8px 0 0;
        color: #555;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 24px;
      }
      th, td {
        border: 1px solid #d8d8d8;
        padding: 10px 12px;
        text-align: left;
        vertical-align: top;
      }
      th {
        width: 30%;
        background: #f5f5f5;
      }
      .notes {
        margin-top: 22px;
      }
      .notes h3 {
        margin: 0 0 8px;
      }
      .notes p {
        margin: 0;
        line-height: 1.6;
      }
      .hint {
        margin-top: 20px;
        color: #666;
        font-size: 13px;
      }
      .legal-footer {
        margin-top: 16px;
        border-top: 1px solid #e5e5e5;
        padding-top: 10px;
        color: #555;
        font-size: 12px;
        line-height: 1.5;
      }
      @media print {
        body { padding: 0; }
      }
    </style>
  </head>
  <body>
    <div class="brand-row">
      <div>
        <h1>${escapeHtml(brandingName)}</h1>
        <div class="brand-links">
          ${brandingWebsite ? `<a href="${escapeHtml(brandingWebsite)}" target="_blank" rel="noreferrer">${escapeHtml(docText.website)}</a>` : ""}
          ${brandingReviews ? `<a href="${escapeHtml(brandingReviews)}" target="_blank" rel="noreferrer">${escapeHtml(docText.reviews)}</a>` : ""}
        </div>
        <p class="brand-contact">${brandingContactLines.map((line) => escapeHtml(line)).join("<br />")}</p>
      </div>
      ${brandingLogo ? `<img class="brand-logo" src="${escapeHtml(brandingLogo)}" alt="Company logo" />` : ""}
    </div>
    <h1 style="margin-top:18px;">${escapeHtml(title)}</h1>
    <p class="subtitle">${escapeHtml(subtitle)}</p>
    <table>
      <tbody>${printableItems}</tbody>
    </table>
    ${printableNotes}
    ${brandingLegal ? `<p class="legal-footer">${escapeHtml(brandingLegal).replace(/\n/g, "<br />")}</p>` : ""}
    <p class="hint">${escapeHtml(docText.tip)}</p>
  </body>
</html>`;

    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;";
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  };

  const printEstimate = (job, preferredLanguage = "default") => {
    const language = resolveDocumentLanguage(preferredLanguage);
    const docText = DOC_I18N[language] || DOC_I18N.en;
    const linkedClient =
      findClientById(job.clientId) || findClientByName(job.clientName);
    const financials = computeEstimateFinancials({
      baseAmount: job.price,
      taxState: job.taxState,
      downPaymentPercent: job.downPaymentPercent,
    });
    openPrintableDocument({
      title: docText.quoteEstimate,
      subtitle: `${docText.jobPrefix} ${job.title || "Untitled"}`,
      items: [
        {
          label: docText.client,
          value: linkedClient?.name || job.clientName || docText.unknown,
        },
        { label: docText.service, value: job.service || docText.notSpecified },
        { label: docText.status, value: job.status || docText.pending },
        { label: docText.dueDate, value: job.dueDate || docText.noDueDate },
        { label: docText.estimatedAmount, value: money(job.price) },
        { label: docText.subtotal, value: money(financials.subtotal) },
        {
          label: docText.taxState,
          value: `${financials.taxState} - ${getUsStateLabel(financials.taxState)}`,
        },
        { label: docText.taxRate, value: `${financials.taxRate.toFixed(3)}%` },
        { label: docText.taxAmount, value: money(financials.taxAmount) },
        { label: docText.estimateTotal, value: money(financials.total) },
        {
          label: docText.downPaymentPercent,
          value: `${financials.downPaymentPercent.toFixed(2)}%`,
        },
        {
          label: docText.downPaymentAmount,
          value: money(financials.downPaymentAmount),
        },
        {
          label: docText.balanceAfterDownPayment,
          value: money(financials.balanceAfterDownPayment),
        },
      ],
      notes: linkedClient?.notes || "",
      preferredLanguage,
    });
  };

  const printInvoice = (invoice, preferredLanguage = "default") => {
    const language = resolveDocumentLanguage(preferredLanguage);
    const docText = DOC_I18N[language] || DOC_I18N.en;
    const linkedJob = getLinkedJob(invoice);
    openPrintableDocument({
      title: docText.invoice,
      subtitle: invoice.invoiceNumber
        ? `${docText.invoicePrefix}${invoice.invoiceNumber}`
        : docText.invoiceDocument,
      items: [
        { label: docText.client, value: invoice.clientName || docText.unknown },
        {
          label: docText.service,
          value:
            invoice.invoiceTitle || linkedJob?.title || docText.notSpecified,
        },
        { label: docText.status, value: invoice.status || "Unpaid" },
        { label: docText.amount, value: money(invoice.amount) },
        { label: docText.dueDate, value: invoice.dueDate || docText.noDueDate },
        {
          label: docText.linkedJob,
          value: linkedJob?.title || docText.notLinked,
        },
        {
          label: docText.contractField,
          value: invoice.contractStatus || docText.notGenerated,
        },
      ],
      notes: [
        formatInvoiceLineItems(invoice.lineItems),
        invoice.lineItemsText,
        invoice.notes,
      ]
        .filter(Boolean)
        .join("\n\n"),
      preferredLanguage,
    });
  };

  const printContract = (contract, preferredLanguage = "default") => {
    const language = resolveDocumentLanguage(preferredLanguage);
    const docText = DOC_I18N[language] || DOC_I18N.en;
    openPrintableDocument({
      title: docText.contract,
      subtitle: contract.jobTitle
        ? `${docText.jobPrefix} ${contract.jobTitle}`
        : docText.generatedContract,
      items: [
        {
          label: docText.client,
          value: contract.clientName || docText.unknown,
        },
        { label: docText.status, value: contract.status || docText.draft },
        {
          label: docText.invoice,
          value: contract.invoiceNumber || docText.notLinked,
        },
        { label: docText.amount, value: money(contract.amount) },
      ],
      notes: contract.body || "",
      preferredLanguage,
    });
  };

  const totalRevenue = useMemo(
    () =>
      dashboardMetrics?.jobs?.totalRevenue ??
      jobs.reduce((sum, job) => sum + Number(job.price || 0), 0),
    [dashboardMetrics, jobs],
  );
  const outstandingAmount = useMemo(
    () =>
      dashboardMetrics?.invoices?.outstanding ??
      invoices
        .filter((invoice) => invoice.status !== "Paid")
        .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
    [dashboardMetrics, invoices],
  );

  const uiText = UI_I18N[uiLanguage] || UI_I18N.en;
  const runtimeText = RUNTIME_I18N[uiLanguage] || RUNTIME_I18N.en;

  // Jobber-style dashboard computed values
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const greeting = t(
    now.getHours() < 12
      ? "greeting.morning"
      : now.getHours() < 18
        ? "greeting.afternoon"
        : "greeting.evening",
  );
  const ownerFirstName =
    (companyProfile?.companyName || "").split(" ")[0] || "there";

  // Quotes = jobs with a quote (all jobs are leads/quotes until invoiced)
  const jobsActive = useMemo(
    () =>
      jobs.filter((j) => j.status === "Active" || j.status === "In Progress"),
    [jobs],
  );
  const jobsPendingInvoice = useMemo(
    () => jobs.filter((j) => j.status === "Completed" && !j.invoiced),
    [jobs],
  );
  const jobsDraft = useMemo(
    () => jobs.filter((j) => j.status === "Pending" || j.status === "Draft"),
    [jobs],
  );
  const totalJobsValue = useMemo(
    () => jobs.reduce((s, j) => s + Number(j.price || 0), 0),
    [jobs],
  );

  const invoicesAwaiting = useMemo(
    () => invoices.filter((i) => i.status === "Unpaid" || i.status === "Sent"),
    [invoices],
  );
  const invoicesDraft = useMemo(
    () => invoices.filter((i) => i.status === "Draft"),
    [invoices],
  );
  const invoicesPastDue = useMemo(
    () =>
      invoices.filter((i) => {
        if (i.status === "Paid") return false;
        if (!i.dueDate) return false;
        return i.dueDate < todayStr;
      }),
    [invoices, todayStr],
  );
  const totalAwaitingValue = useMemo(
    () => invoicesAwaiting.reduce((s, i) => s + Number(i.amount || 0), 0),
    [invoicesAwaiting],
  );

  const fmt = (n) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

  // Dashboard cards prefer dashboardMetrics (aggregated, fast) when local arrays haven't loaded yet
  const dm = dashboardMetrics;
  const dashClients = dm?.clients?.total ?? clients.length;
  const dashJobsTotal = dm?.jobs?.total ?? jobs.length;
  const dashJobsActive = dm?.jobs?.active ?? jobsActive.length;
  const dashJobsDraft = dm?.jobs?.pendingDraft ?? jobsDraft.length;
  const dashJobsPendingInvoice =
    dm?.jobs?.pendingInvoice ?? jobsPendingInvoice.length;
  const _dashInvoicesTotal = dm?.invoices?.total ?? invoices.length;
  const dashInvoicesUnpaid =
    dm?.invoices?.unpaidCount ?? invoicesAwaiting.length;
  const _dashInvoicesDraft = dm?.invoices?.draftCount ?? invoicesDraft.length;
  const dashContractsActive =
    dm?.contracts?.active ??
    contracts.filter((c) => c.status !== "Cancelled").length;
  const dashEstimateRequestsTotal =
    dm?.estimateRequests?.total ?? estimateRequests.length;
  const _dashEstimateRequestsNew =
    dm?.estimateRequests?.newCount ??
    estimateRequests.filter((r) => r.status === "new").length;
  const dashTotalRevenue =
    revenueDashboard?.totalRevenue ?? dm?.jobs?.totalRevenue ?? totalRevenue;
  const dashTotalPayments = revenueDashboard?.totalPayments ?? 0;
  const dashOutstanding = dm?.invoices?.outstanding ?? outstandingAmount;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f5f7",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* --- Page top bar ----------------------------------- */}
      <div
        style={{
          background: "white",
          borderBottom: "1px solid #e5e7eb",
          padding: "0 28px",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          position: "sticky",
          top: 0,
          zIndex: 20,
          boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: "#0f172a",
              letterSpacing: "-0.4px",
            }}
          >
            {activeTab === "dashboard"
              ? `${greeting}, ${ownerFirstName}`
              : uiText.tabs[activeTab] || activeTab}
          </h1>
          {activeTab === "dashboard" && (
            <div
              style={{
                fontSize: 11,
                color: "#94a3b8",
                marginTop: 1,
                fontWeight: 500,
              }}
            >
              {now.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Notification Bell */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => {
                setNotifOpen((o) => !o);
                if (!notifOpen && unreadCount > 0) markAllNotificationsRead();
              }}
              aria-label="Notifications"
              style={{
                position: "relative",
                width: 36,
                height: 36,
                borderRadius: 8,
                border: notifOpen ? "1.5px solid #0f172a" : "1px solid #e5e7eb",
                background: notifOpen ? "#0f172a" : "white",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.1s",
              }}
            >
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width={16}
                height={16}
                fill="none"
                viewBox="0 0 24 24"
                stroke={notifOpen ? "white" : "#374151"}
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    background: "#ef4444",
                    color: "white",
                    fontSize: 10,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 3px",
                    lineHeight: 1,
                    border: "1.5px solid white",
                  }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <div
                style={{
                  position: "absolute",
                  top: 42,
                  right: 0,
                  width: 340,
                  maxHeight: 420,
                  overflowY: "auto",
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  zIndex: 200,
                }}
              >
                <div
                  style={{
                    padding: "12px 16px 10px",
                    borderBottom: "1px solid #f1f5f9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}
                  >
                    Notifications
                  </span>
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={markAllNotificationsRead}
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                {notifications.length === 0
                  ? <div
                      style={{
                        padding: "24px 16px",
                        textAlign: "center",
                        color: "#94a3b8",
                        fontSize: 13,
                      }}
                    >
                      No new notifications
                    </div>
                  : notifications.map((n) => (
                      <button
                        type="button"
                        key={n._id}
                        onClick={() => {
                          setActiveTab("jobs");
                          setNotifOpen(false);
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: "12px 16px",
                          background: "none",
                          border: "none",
                          borderBottom: "1px solid #f1f5f9",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#f8fafc";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "none";
                        }}
                      >
                        <span
                          style={{
                            flexShrink: 0,
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            background:
                              n.type === "changes_requested"
                                ? "#fef3c7"
                                : "#dcfce7",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 14,
                            marginTop: 1,
                          }}
                        >
                          {n.type === "changes_requested" ? "?" : "?"}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 13,
                              color: "#0f172a",
                              lineHeight: 1.3,
                            }}
                          >
                            {n.title}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#6b7280",
                              marginTop: 2,
                              lineHeight: 1.4,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {n.message?.length > 100
                              ? `${n.message.slice(0, 100)}�`
                              : n.message}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#94a3b8",
                              marginTop: 4,
                            }}
                          >
                            {n.createdAt
                              ? new Date(n.createdAt).toLocaleString()
                              : ""}
                          </div>
                        </div>
                      </button>
                    ))}
              </div>
            )}
          </div>
          {/* /Notification Bell */}

          {["dashboard", "branding"].map((tab) => (
            <button
              type="button"
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "6px 14px",
                borderRadius: 7,
                border:
                  activeTab === tab
                    ? "1.5px solid #0f172a"
                    : "1px solid #e5e7eb",
                background: activeTab === tab ? "#0f172a" : "white",
                color: activeTab === tab ? "white" : "#374151",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: activeTab === tab ? 600 : 400,
                fontFamily: "inherit",
                letterSpacing: "-0.01em",
                transition: "background 0.1s",
              }}
            >
              {uiText.tabs[tab]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "32px 28px 48px" }}>
        {error
          ? <div
              style={{
                marginBottom: 20,
                padding: "12px 16px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 8,
                color: "#b91c1c",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          : null}
        {loading
          ? <div style={{ color: "#94a3b8", fontSize: 13 }}>
              {uiText.loading}
            </div>
          : null}

        {activeTab === "dashboard"
          ? <section className="cf-animate-in">
              {/* -- Workflow cards ----------------------------------- */}
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#94a3b8",
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                }}
              >
                {uiText.dashboard.overview}
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                  gap: "18px",
                  marginBottom: "48px",
                }}
              >
                {/* Clients card */}
                <button
                  type="button"
                  onClick={() => setActiveTab("clients")}
                  className="dash-card"
                  style={{
                    textAlign: "left",
                    padding: "28px 26px",
                    border: "1px solid #e2e8f0",
                    borderTop: "3px solid #0ea5e9",
                    borderRadius: "14px",
                    background: "#fff",
                    cursor: "pointer",
                    boxShadow:
                      "0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "18px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#94a3b8",
                        textTransform: "uppercase",
                        letterSpacing: "0.09em",
                      }}
                    >
                      {uiText.sections.clients}
                    </span>
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "#e0f2fe",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <svg
                        aria-hidden="true"
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#0ea5e9"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "48px",
                      fontWeight: 800,
                      color: "#0f172a",
                      lineHeight: 1,
                      letterSpacing: "-2px",
                      fontVariantNumeric: "tabular-nums",
                      marginBottom: "20px",
                    }}
                  >
                    {dashClients}
                  </div>
                  <div
                    style={{
                      height: 1,
                      background: "#f1f5f9",
                      marginBottom: "14px",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "12px",
                        color: "#94a3b8",
                      }}
                    >
                      <span>{uiText.dashboard.newRequests}</span>
                      <span style={{ fontWeight: 700, color: "#0f172a" }}>
                        {estimateRequests.filter((r) => !r.reviewed).length}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "12px",
                        color: "#94a3b8",
                      }}
                    >
                      <span>{uiText.dashboard.totalRequests}</span>
                      <span style={{ fontWeight: 700, color: "#0f172a" }}>
                        {dashEstimateRequestsTotal}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Jobs card */}
                <button
                  type="button"
                  onClick={() => setActiveTab("jobs")}
                  className="dash-card"
                  style={{
                    textAlign: "left",
                    padding: "28px 26px",
                    border: "1px solid #e2e8f0",
                    borderTop: "3px solid #16a34a",
                    borderRadius: "14px",
                    background: "#fff",
                    cursor: "pointer",
                    boxShadow:
                      "0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "18px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#94a3b8",
                        textTransform: "uppercase",
                        letterSpacing: "0.09em",
                      }}
                    >
                      {uiText.sections.jobs}
                    </span>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      {totalJobsValue > 0 && (
                        <span
                          style={{
                            fontSize: "13px",
                            fontWeight: 800,
                            color: "#16a34a",
                            letterSpacing: "-0.3px",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {fmt(totalJobsValue)}
                        </span>
                      )}
                      <span
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: "#dcfce7",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <svg
                          aria-hidden="true"
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#16a34a"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect
                            x="2"
                            y="7"
                            width="20"
                            height="14"
                            rx="2"
                            ry="2"
                          />
                          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                        </svg>
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: "48px",
                      fontWeight: 800,
                      color: "#0f172a",
                      lineHeight: 1,
                      letterSpacing: "-2px",
                      fontVariantNumeric: "tabular-nums",
                      marginBottom: "20px",
                    }}
                  >
                    {dashJobsTotal}
                  </div>
                  <div
                    style={{
                      height: 1,
                      background: "#f1f5f9",
                      marginBottom: "14px",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "12px",
                        color: "#94a3b8",
                      }}
                    >
                      <span>{uiText.dashboard.active}</span>
                      <span style={{ fontWeight: 700, color: "#16a34a" }}>
                        {dashJobsActive}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "12px",
                        color: "#94a3b8",
                      }}
                    >
                      <span>{uiText.dashboard.pendingDraft}</span>
                      <span style={{ fontWeight: 700, color: "#0f172a" }}>
                        {dashJobsDraft}
                      </span>
                    </div>
                    {dashJobsPendingInvoice > 0 && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "12px",
                          color: "#b45309",
                        }}
                      >
                        <span>{uiText.dashboard.needsInvoicing}</span>
                        <span style={{ fontWeight: 700 }}>
                          {dashJobsPendingInvoice}
                        </span>
                      </div>
                    )}
                  </div>
                </button>

                {/* Invoices card */}
                <button
                  type="button"
                  onClick={() => setActiveTab("invoices")}
                  className="dash-card"
                  style={{
                    textAlign: "left",
                    padding: "28px 26px",
                    border: "1px solid #e2e8f0",
                    borderTop: "3px solid #f59e0b",
                    borderRadius: "14px",
                    background: "#fff",
                    cursor: "pointer",
                    boxShadow:
                      "0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "18px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#94a3b8",
                        textTransform: "uppercase",
                        letterSpacing: "0.09em",
                      }}
                    >
                      {uiText.sections.invoices}
                    </span>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      {totalAwaitingValue > 0 && (
                        <span
                          style={{
                            fontSize: "13px",
                            fontWeight: 800,
                            color: "#b45309",
                            letterSpacing: "-0.3px",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {fmt(totalAwaitingValue)}
                        </span>
                      )}
                      <span
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: "#fef3c7",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <svg
                          aria-hidden="true"
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#d97706"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: "48px",
                      fontWeight: 800,
                      color: "#0f172a",
                      lineHeight: 1,
                      letterSpacing: "-2px",
                      fontVariantNumeric: "tabular-nums",
                      marginBottom: "6px",
                    }}
                  >
                    {dashInvoicesUnpaid}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#94a3b8",
                      fontWeight: 500,
                      marginBottom: "20px",
                      letterSpacing: "0",
                    }}
                  >
                    {uiText.dashboard.awaitingPayment}
                  </div>
                  <div
                    style={{
                      height: 1,
                      background: "#f1f5f9",
                      marginBottom: "14px",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {invoicesDraft.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "12px",
                          color: "#94a3b8",
                        }}
                      >
                        <span>{uiText.dashboard.draft}</span>
                        <span style={{ fontWeight: 700, color: "#0f172a" }}>
                          {invoicesDraft.length} &middot;{" "}
                          {fmt(
                            invoicesDraft.reduce(
                              (s, i) => s + Number(i.amount || 0),
                              0,
                            ),
                          )}
                        </span>
                      </div>
                    )}
                    {invoicesPastDue.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "12px",
                          color: "#dc2626",
                        }}
                      >
                        <span>{uiText.dashboard.pastDue}</span>
                        <span style={{ fontWeight: 700 }}>
                          {invoicesPastDue.length} &middot;{" "}
                          {fmt(
                            invoicesPastDue.reduce(
                              (s, i) => s + Number(i.amount || 0),
                              0,
                            ),
                          )}
                        </span>
                      </div>
                    )}
                    {invoicesDraft.length === 0 &&
                      invoicesPastDue.length === 0 && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#16a34a",
                            fontWeight: 700,
                          }}
                        >
                          {uiText.dashboard.allClear}
                        </div>
                      )}
                  </div>
                </button>

                {/* Contracts card */}
                <button
                  type="button"
                  onClick={() => setActiveTab("contracts")}
                  className="dash-card"
                  style={{
                    textAlign: "left",
                    padding: "28px 26px",
                    border: "1px solid #e2e8f0",
                    borderTop: "3px solid #8b5cf6",
                    borderRadius: "14px",
                    background: "#fff",
                    cursor: "pointer",
                    boxShadow:
                      "0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "18px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#94a3b8",
                        textTransform: "uppercase",
                        letterSpacing: "0.09em",
                      }}
                    >
                      {uiText.sections.contracts}
                    </span>
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "#ede9fe",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <svg
                        aria-hidden="true"
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#8b5cf6"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "48px",
                      fontWeight: 800,
                      color: "#0f172a",
                      lineHeight: 1,
                      letterSpacing: "-2px",
                      fontVariantNumeric: "tabular-nums",
                      marginBottom: "20px",
                    }}
                  >
                    {contracts.length}
                  </div>
                  <div
                    style={{
                      height: 1,
                      background: "#f1f5f9",
                      marginBottom: "14px",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "12px",
                        color: "#94a3b8",
                      }}
                    >
                      <span>{uiText.dashboard.draft}</span>
                      <span style={{ fontWeight: 700, color: "#0f172a" }}>
                        {contracts.filter((c) => c.status === "Draft").length}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "12px",
                        color: "#94a3b8",
                      }}
                    >
                      <span>{uiText.dashboard.signed}</span>
                      <span style={{ fontWeight: 700, color: "#16a34a" }}>
                        {
                          contracts.filter(
                            (c) =>
                              c.status === "Signed" || c.status === "Active",
                          ).length
                        }
                      </span>
                    </div>
                  </div>
                </button>
              </div>

              {/* -- Quick actions ------------------------------------ */}
              <p
                style={{
                  margin: "0 0 14px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#94a3b8",
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                }}
              >
                {uiText.dashboard.quickActions}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                  marginBottom: "52px",
                }}
              >
                {[
                  {
                    label: uiText.dashboard.newJobBtn,
                    tab: "jobs",
                    color: "#16a34a",
                    icon: (
                      <svg
                        aria-hidden="true"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="2" y="7" width="20" height="14" rx="2" />
                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                      </svg>
                    ),
                  },
                  {
                    label: uiText.dashboard.newInvoiceBtn,
                    tab: "invoices",
                    color: "#d97706",
                    icon: (
                      <svg
                        aria-hidden="true"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    ),
                  },
                  {
                    label: uiText.dashboard.newClientBtn,
                    tab: "clients",
                    color: "#0ea5e9",
                    icon: (
                      <svg
                        aria-hidden="true"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="8.5" cy="7" r="4" />
                        <line x1="20" y1="8" x2="20" y2="14" />
                        <line x1="23" y1="11" x2="17" y2="11" />
                      </svg>
                    ),
                  },
                  {
                    label: uiText.dashboard.newContractBtn,
                    tab: "contracts",
                    color: "#8b5cf6",
                    icon: (
                      <svg
                        aria-hidden="true"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    ),
                  },
                ].map(({ label, tab, color, icon }) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className="dash-action-btn"
                    style={{
                      padding: "11px 22px",
                      borderRadius: "9px",
                      border: `1.5px solid ${color}`,
                      background: `${color}12`,
                      color: color,
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: 600,
                      fontFamily: "inherit",
                      letterSpacing: "-0.01em",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>

              {/* -- Business summary ---------------------------------- */}
              <p
                style={{
                  margin: "0 0 14px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#94a3b8",
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                }}
              >
                {uiText.dashboard.businessSummary}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: "14px",
                }}
              >
                {/* Revenue � hero tile */}
                <div
                  className="dash-summary-tile"
                  style={{
                    padding: "24px 22px",
                    borderRadius: "14px",
                    background:
                      "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
                    boxShadow:
                      "0 4px 16px rgba(22,163,74,0.28), 0 1px 4px rgba(22,163,74,0.15)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <svg
                      aria-hidden="true"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="rgba(255,255,255,0.7)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="12" y1="1" x2="12" y2="23" />
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "rgba(255,255,255,0.7)",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {uiText.dashboard.totalRevenue}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "36px",
                      fontWeight: 800,
                      color: "white",
                      letterSpacing: "-1.5px",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                    }}
                  >
                    {money(dashTotalRevenue)}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "rgba(255,255,255,0.55)",
                      fontWeight: 500,
                      marginTop: 2,
                    }}
                  >
                    {revenueLoading
                      ? uiText.dashboard.revenueLoading
                      : uiText.dashboard.fromPaidPayments}
                  </div>
                </div>

                <div
                  className="dash-summary-tile"
                  style={{
                    padding: "24px 22px",
                    border: revenueError
                      ? "1px solid #fecaca"
                      : "1px solid #bfdbfe",
                    borderRadius: "14px",
                    background: "white",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: revenueError ? "#fecaca" : "#bfdbfe",
                        border: revenueError
                          ? "1.5px solid #dc2626"
                          : "1.5px solid #2563eb",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "11px",
                        color: "#94a3b8",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {uiText.dashboard.totalPayments}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "36px",
                      fontWeight: 800,
                      color: "#0f172a",
                      letterSpacing: "-1.5px",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                    }}
                  >
                    {revenueLoading ? "..." : dashTotalPayments}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: revenueError ? "#b91c1c" : "#64748b",
                      fontWeight: 500,
                      marginTop: 2,
                    }}
                  >
                    {revenueLoading
                      ? uiText.dashboard.revenueLoading
                      : revenueError
                        ? uiText.dashboard.revenueUnavailable
                        : uiText.dashboard.paidTransactions}
                  </div>
                </div>

                {/* Outstanding */}
                <div
                  className="dash-summary-tile"
                  style={{
                    padding: "24px 22px",
                    border: "1px solid #fde68a",
                    borderRadius: "14px",
                    background: "white",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#fde68a",
                        border: "1.5px solid #f59e0b",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "11px",
                        color: "#94a3b8",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {uiText.dashboard.outstanding}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "36px",
                      fontWeight: 800,
                      color: "#b45309",
                      letterSpacing: "-1.5px",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                    }}
                  >
                    {fmt(dashOutstanding)}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#94a3b8",
                      fontWeight: 500,
                      marginTop: 2,
                    }}
                  >
                    {uiText.dashboard.unpaidInvoices}
                  </div>
                </div>

                {/* Active clients */}
                <div
                  className="dash-summary-tile"
                  style={{
                    padding: "24px 22px",
                    border: "1px solid #bae6fd",
                    borderRadius: "14px",
                    background: "white",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#bae6fd",
                        border: "1.5px solid #0ea5e9",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "11px",
                        color: "#94a3b8",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {uiText.dashboard.activeClients}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "36px",
                      fontWeight: 800,
                      color: "#0ea5e9",
                      letterSpacing: "-1.5px",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                    }}
                  >
                    {dashClients}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#94a3b8",
                      fontWeight: 500,
                      marginTop: 2,
                    }}
                  >
                    {uiText.dashboard.inYourWorkspace}
                  </div>
                </div>

                {/* Open contracts */}
                <div
                  className="dash-summary-tile"
                  style={{
                    padding: "24px 22px",
                    border: "1px solid #ddd6fe",
                    borderRadius: "14px",
                    background: "white",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#ddd6fe",
                        border: "1.5px solid #8b5cf6",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "11px",
                        color: "#94a3b8",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {uiText.dashboard.openContracts}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "36px",
                      fontWeight: 800,
                      color: "#8b5cf6",
                      letterSpacing: "-1.5px",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                    }}
                  >
                    {dashContractsActive}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#94a3b8",
                      fontWeight: 500,
                      marginTop: 2,
                    }}
                  >
                    {uiText.dashboard.activeAgreements}
                  </div>
                </div>
              </div>

              {/* -- Conversion Rate full card -------------------------- */}
              <div
                style={{
                  marginTop: "20px",
                  padding: "22px 24px",
                  border: "1px solid #bbf7d0",
                  borderRadius: "14px",
                  background: "white",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                }}
              >
                {/* Header row */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#bbf7d0",
                        border: "1.5px solid #16a34a",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "11px",
                        color: "#94a3b8",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.09em",
                      }}
                    >
                      {uiText.dashboard.conversionRate}
                    </span>
                  </div>
                  {/* Time filter buttons */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[
                      { key: "week", label: uiText.dashboard.filterThisWeek },
                      { key: "month", label: uiText.dashboard.filterThisMonth },
                      { key: "all", label: uiText.dashboard.filterAll },
                      { key: "custom", label: uiText.dashboard.filterCustom },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setConversionFilter(key)}
                        style={{
                          padding: "5px 12px",
                          borderRadius: "20px",
                          border:
                            conversionFilter === key
                              ? "1.5px solid #16a34a"
                              : "1px solid #e2e8f0",
                          background:
                            conversionFilter === key ? "#f0fdf4" : "white",
                          color:
                            conversionFilter === key ? "#15803d" : "#64748b",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontWeight: 600,
                          fontFamily: "inherit",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Custom date range pickers */}
                {conversionFilter === "custom"
                  ? <div
                      style={{
                        display: "flex",
                        gap: 10,
                        marginBottom: 16,
                        flexWrap: "wrap",
                      }}
                    >
                      <input
                        type="date"
                        value={conversionFrom}
                        onChange={(e) => setConversionFrom(e.target.value)}
                        style={{
                          padding: "7px 10px",
                          borderRadius: "8px",
                          border: "1px solid #e2e8f0",
                          fontSize: "13px",
                          fontFamily: "inherit",
                        }}
                      />
                      <input
                        type="date"
                        value={conversionTo}
                        onChange={(e) => setConversionTo(e.target.value)}
                        style={{
                          padding: "7px 10px",
                          borderRadius: "8px",
                          border: "1px solid #e2e8f0",
                          fontSize: "13px",
                          fontFamily: "inherit",
                        }}
                      />
                    </div>
                  : null}
                {/* Metrics row */}
                {conversionMetrics
                  ? <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(160px, 1fr))",
                        gap: "16px",
                      }}
                    >
                      {/* Big conversion rate */}
                      <div>
                        <div
                          style={{
                            fontSize: "44px",
                            fontWeight: 800,
                            color: "#16a34a",
                            letterSpacing: "-2px",
                            lineHeight: 1,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {conversionMetrics.conversionRate}%
                        </div>
                        <div
                          style={{
                            fontSize: "13px",
                            color: "#64748b",
                            marginTop: 4,
                          }}
                        >
                          {conversionMetrics.wonLeads}{" "}
                          {uiText.dashboard.wonOutOf}{" "}
                          {conversionMetrics.totalLeads}{" "}
                          {uiText.dashboard.leads}
                        </div>
                      </div>
                      {/* Total leads */}
                      <div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#94a3b8",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.07em",
                            marginBottom: 4,
                          }}
                        >
                          {uiText.dashboard.totalLeads}
                        </div>
                        <div
                          style={{
                            fontSize: "26px",
                            fontWeight: 700,
                            color: "#0f172a",
                          }}
                        >
                          {conversionMetrics.totalLeads}
                        </div>
                      </div>
                      {/* Won */}
                      <div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#94a3b8",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.07em",
                            marginBottom: 4,
                          }}
                        >
                          {uiText.dashboard.wonJobs}
                        </div>
                        <div
                          style={{
                            fontSize: "26px",
                            fontWeight: 700,
                            color: "#16a34a",
                          }}
                        >
                          {conversionMetrics.wonLeads}
                        </div>
                      </div>
                      {/* Estimates sent */}
                      <div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#94a3b8",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.07em",
                            marginBottom: 4,
                          }}
                        >
                          {uiText.dashboard.estimatesSent}
                        </div>
                        <div
                          style={{
                            fontSize: "26px",
                            fontWeight: 700,
                            color: "#0ea5e9",
                          }}
                        >
                          {conversionMetrics.estimatesSent}
                        </div>
                      </div>
                      {/* Win rate from estimates */}
                      <div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#94a3b8",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.07em",
                            marginBottom: 4,
                          }}
                        >
                          {uiText.dashboard.winRateEstimates}
                        </div>
                        <div
                          style={{
                            fontSize: "26px",
                            fontWeight: 700,
                            color: "#f59e0b",
                          }}
                        >
                          {conversionMetrics.winRateFromEstimates}%
                        </div>
                      </div>
                    </div>
                  : <div style={{ fontSize: "13px", color: "#94a3b8" }}>
                      {uiText.dashboard.noLeadsYet}
                    </div>}
              </div>
            </section>
          : null}

        {activeTab === "clients"
          ? <section style={{ marginTop: "30px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "20px",
                  flexWrap: "wrap",
                }}
              >
                <h2 style={{ margin: 0 }}>{uiText.sections.clients}</h2>
                <button
                  type="button"
                  onClick={() => setShowClientForm(!showClientForm)}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: "black",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  {showClientForm
                    ? uiText.actions.hideForm
                    : uiText.actions.newClient}
                </button>
              </div>

              {showClientForm
                ? <div
                    style={{
                      marginTop: "20px",
                      padding: "20px",
                      border: "1px solid #ddd",
                      borderRadius: "14px",
                      background: "#fff",
                    }}
                  >
                    <div style={{ display: "grid", gap: "12px" }}>
                      <input
                        placeholder={uiText.forms.client.name}
                        value={clientForm.name}
                        onChange={(e) =>
                          setClientForm({ ...clientForm, name: e.target.value })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                      <input
                        placeholder={uiText.forms.client.email}
                        value={clientForm.email}
                        onChange={(e) =>
                          setClientForm({
                            ...clientForm,
                            email: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                      <input
                        placeholder={uiText.forms.client.phone}
                        value={clientForm.phone}
                        onChange={(e) =>
                          setClientForm({
                            ...clientForm,
                            phone: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                      <PlacesAutocomplete
                        placeholder={uiText.forms.client.addressLine1}
                        value={clientForm.addressLine1}
                        onChange={(v) =>
                          setClientForm({ ...clientForm, addressLine1: v })
                        }
                        onSelect={({ street, city, state, zip }) =>
                          setClientForm({
                            ...clientForm,
                            addressLine1: street,
                            city,
                            state,
                            zip,
                          })
                        }
                        inputStyle={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                          width: "100%",
                        }}
                      />
                      <input
                        placeholder={uiText.forms.client.addressLine2}
                        value={clientForm.addressLine2}
                        onChange={(e) =>
                          setClientForm({
                            ...clientForm,
                            addressLine2: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 80px 100px",
                          gap: 8,
                        }}
                      >
                        <input
                          placeholder={uiText.forms.client.city}
                          value={clientForm.city}
                          onChange={(e) =>
                            setClientForm({
                              ...clientForm,
                              city: e.target.value,
                            })
                          }
                          style={{
                            padding: "10px",
                            borderRadius: "8px",
                            border: "1px solid #ccc",
                          }}
                        />
                        <input
                          placeholder={uiText.forms.client.state}
                          value={clientForm.state}
                          onChange={(e) =>
                            setClientForm({
                              ...clientForm,
                              state: e.target.value,
                            })
                          }
                          style={{
                            padding: "10px",
                            borderRadius: "8px",
                            border: "1px solid #ccc",
                          }}
                        />
                        <input
                          placeholder={uiText.forms.client.zip}
                          value={clientForm.zip}
                          onChange={(e) =>
                            setClientForm({
                              ...clientForm,
                              zip: e.target.value,
                            })
                          }
                          style={{
                            padding: "10px",
                            borderRadius: "8px",
                            border: "1px solid #ccc",
                          }}
                        />
                      </div>
                      <input
                        placeholder={uiText.forms.client.service}
                        value={clientForm.service}
                        onChange={(e) =>
                          setClientForm({
                            ...clientForm,
                            service: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                      <textarea
                        placeholder={uiText.forms.client.notes}
                        value={clientForm.notes}
                        onChange={(e) =>
                          setClientForm({
                            ...clientForm,
                            notes: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                          minHeight: "80px",
                        }}
                      />
                      <input
                        placeholder={uiText.forms.client.price}
                        value={clientForm.price}
                        onChange={(e) =>
                          setClientForm({
                            ...clientForm,
                            price: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                      <select
                        value={clientForm.leadStatus}
                        onChange={(e) =>
                          setClientForm({
                            ...clientForm,
                            leadStatus: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                          background: "white",
                          fontFamily: "inherit",
                          fontSize: "14px",
                        }}
                      >
                        {Object.entries(uiText.forms.leadStatuses).map(
                          ([val, label]) => (
                            <option key={val} value={val}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                      <button
                        type="button"
                        onClick={addClient}
                        style={{
                          padding: "12px 18px",
                          borderRadius: "8px",
                          border: "none",
                          background: "black",
                          color: "white",
                          cursor: "pointer",
                        }}
                      >
                        {uiText.forms.client.save}
                      </button>
                    </div>
                  </div>
                : null}

              {clients.length > 0
                ? <div style={{ marginTop: "30px" }}>
                    <h3 style={{ margin: "0 0 16px 0", fontSize: "18px" }}>
                      {uiText.dashboard.recentClients}
                    </h3>
                    <div
                      style={{
                        display: "grid",
                        gap: "14px",
                      }}
                    >
                      {clients
                        .slice(-5)
                        .reverse()
                        .map((client) => (
                          <div
                            key={client._id}
                            style={{
                              padding: "14px",
                              border: "1px solid #e0e0e0",
                              borderRadius: "12px",
                              background: "#fafafa",
                            }}
                          >
                            <p style={{ margin: 0, fontSize: "14px" }}>
                              <strong>{client.name}</strong> � {client.service}
                            </p>
                            <p
                              style={{
                                margin: "6px 0 0 0",
                                fontSize: "12px",
                                color: "#666",
                              }}
                            >
                              {client.phone}
                              {client.email ? ` � ${client.email}` : ""}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                : null}

              <div style={{ marginTop: "24px", display: "grid", gap: "14px" }}>
                {clients.map((client) => {
                  const statusColors = {
                    new_lead: {
                      bg: "#f0f9ff",
                      border: "#bae6fd",
                      text: "#0369a1",
                    },
                    contacted: {
                      bg: "#fefce8",
                      border: "#fde68a",
                      text: "#854d0e",
                    },
                    estimate_sent: {
                      bg: "#eff6ff",
                      border: "#bfdbfe",
                      text: "#1d4ed8",
                    },
                    waiting_approval: {
                      bg: "#fff7ed",
                      border: "#fed7aa",
                      text: "#c2410c",
                    },
                    won: { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d" },
                    lost: { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c" },
                  };
                  const st =
                    statusColors[client.leadStatus] || statusColors.new_lead;
                  return (
                    <div
                      key={client._id}
                      style={{
                        padding: "18px",
                        border: "1px solid #ddd",
                        borderRadius: "14px",
                        background: "#fff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        <div>
                          <h3 style={{ margin: 0 }}>{client.name}</h3>
                          <p style={{ margin: "8px 0 0 0", color: "#555" }}>
                            {client.phone} � {client.service}
                          </p>
                          {client.email
                            ? <p style={{ margin: "8px 0 0 0", color: "#555" }}>
                                {client.email}
                              </p>
                            : null}
                          <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                            {client.address}
                          </p>
                        </div>
                        {/* Lead status badge + quick-change */}
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              padding: "3px 10px",
                              borderRadius: "20px",
                              fontSize: "11px",
                              fontWeight: 700,
                              background: st.bg,
                              border: `1px solid ${st.border}`,
                              color: st.text,
                              letterSpacing: "0.02em",
                            }}
                          >
                            {uiText.forms.leadStatuses[client.leadStatus] ||
                              client.leadStatus}
                          </span>
                          <select
                            value={client.leadStatus || "new_lead"}
                            onChange={(e) =>
                              updateClientLeadStatus(client._id, e.target.value)
                            }
                            style={{
                              padding: "5px 8px",
                              borderRadius: "6px",
                              border: "1px solid #e2e8f0",
                              fontSize: "12px",
                              fontFamily: "inherit",
                              background: "white",
                              cursor: "pointer",
                            }}
                          >
                            {Object.entries(uiText.forms.leadStatuses).map(
                              ([val, label]) => (
                                <option key={val} value={val}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {clients.length === 0
                  ? <p style={{ color: "#777" }}>{uiText.empty.clients}</p>
                  : null}
              </div>
            </section>
          : null}

        {activeTab === "jobs"
          ? <section style={{ marginTop: "30px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "20px",
                  flexWrap: "wrap",
                }}
              >
                <h2 style={{ margin: 0 }}>{uiText.sections.jobs}</h2>
                <button
                  type="button"
                  onClick={() => {
                    const nextOpen = !showJobForm;
                    setShowJobForm(nextOpen);
                    if (nextOpen) {
                      setJobForm(getDefaultJobForm(companyProfile));
                    }
                  }}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: "black",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  {showJobForm
                    ? uiText.actions.hideForm
                    : uiText.actions.newJob}
                </button>
              </div>

              {showJobForm
                ? <div
                    style={{
                      marginTop: "20px",
                      padding: "20px",
                      border: "1px solid #ddd",
                      borderRadius: "14px",
                      background: "#fff",
                    }}
                  >
                    <div style={{ display: "grid", gap: "12px" }}>
                      <input
                        placeholder={uiText.forms.job.title}
                        value={jobForm.title}
                        onChange={(e) =>
                          setJobForm({ ...jobForm, title: e.target.value })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                      <select
                        value={jobForm.clientId}
                        onChange={(e) => handleJobClientChange(e.target.value)}
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      >
                        <option value="">
                          {uiText.forms.job.selectClient}
                        </option>
                        {clients.map((client) => (
                          <option key={client._id} value={client._id}>
                            {client.name}
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder={uiText.forms.job.client}
                        value={jobForm.clientName}
                        onChange={(e) =>
                          setJobForm({
                            ...jobForm,
                            clientName: e.target.value,
                            clientId: "",
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                      <input
                        placeholder={uiText.forms.job.service}
                        value={jobForm.service}
                        onChange={(e) =>
                          setJobForm({ ...jobForm, service: e.target.value })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                      <details>
                        <summary
                          style={{
                            padding: "10px 12px",
                            borderRadius: "8px",
                            border: "1px dashed #777",
                            background: "white",
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                        >
                          {uiText.forms.job.serviceLibraryButton}
                        </summary>
                        <div
                          style={{
                            marginTop: "10px",
                            display: "grid",
                            gap: "10px",
                            border: "1px solid #e2e2e2",
                            borderRadius: "10px",
                            padding: "12px",
                            background: "#fafafa",
                          }}
                        >
                          <input
                            placeholder={
                              uiText.forms.job.serviceSearchPlaceholder
                            }
                            value={jobServiceSearch}
                            onChange={(e) =>
                              setJobServiceSearch(
                                sanitizeSearchInput(e.target.value, 80),
                              )
                            }
                            maxLength={80}
                            style={{
                              padding: "10px",
                              borderRadius: "8px",
                              border: "1px solid #ccc",
                              background: "white",
                            }}
                          />
                          {favoriteJobServices.length > 0
                            ? <div>
                                <strong>
                                  {uiText.forms.job.favoritesTitle}
                                </strong>
                                <div
                                  style={{
                                    marginTop: "8px",
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "8px",
                                  }}
                                >
                                  {filterServicesBySearch(
                                    favoriteJobServices,
                                  ).map((service) => (
                                    <div
                                      key={`fav-${service}`}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={() =>
                                          applyJobServiceTemplate(service)
                                        }
                                        style={{
                                          padding: "7px 10px",
                                          borderRadius: "999px",
                                          border: "1px solid #d0d0d0",
                                          background: "#fff9db",
                                          cursor: "pointer",
                                          fontSize: "13px",
                                        }}
                                      >
                                        {service}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          toggleFavoriteJobService(service)
                                        }
                                        title={uiText.forms.job.removeFavorite}
                                        style={{
                                          border: "none",
                                          background: "transparent",
                                          cursor: "pointer",
                                          color: "#a16207",
                                          fontSize: "14px",
                                        }}
                                      >
                                        ?
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            : null}
                          <div>
                            <strong>
                              {uiText.forms.job.landscapingCategory}
                            </strong>
                            <p style={{ margin: "8px 0 0 0", color: "#666" }}>
                              {uiText.forms.job.landscapingMaintenance}
                            </p>
                            <div
                              style={{
                                marginTop: "8px",
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "8px",
                              }}
                            >
                              {filterServicesBySearch(
                                JOB_SERVICE_LIBRARY.landscaping.maintenance,
                              ).map((service) => (
                                <button
                                  key={`land-maint-${service}`}
                                  type="button"
                                  onClick={() =>
                                    applyJobServiceTemplate(service)
                                  }
                                  style={{
                                    padding: "7px 10px",
                                    borderRadius: "999px",
                                    border: "1px solid #d0d0d0",
                                    background: "white",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                  }}
                                >
                                  {service}
                                </button>
                              ))}
                            </div>
                            <p style={{ margin: "10px 0 0 0", color: "#666" }}>
                              {uiText.forms.job.landscapingInstallations}
                            </p>
                            <div
                              style={{
                                marginTop: "8px",
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "8px",
                              }}
                            >
                              {filterServicesBySearch(
                                JOB_SERVICE_LIBRARY.landscaping.installations,
                              ).map((service) => (
                                <button
                                  key={`land-install-${service}`}
                                  type="button"
                                  onClick={() =>
                                    applyJobServiceTemplate(service)
                                  }
                                  style={{
                                    padding: "7px 10px",
                                    borderRadius: "999px",
                                    border: "1px solid #d0d0d0",
                                    background: "white",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                  }}
                                >
                                  {service}
                                </button>
                              ))}
                            </div>
                            <p style={{ margin: "10px 0 0 0", color: "#666" }}>
                              {uiText.forms.job.landscapingHardscaping}
                            </p>
                            <div
                              style={{
                                marginTop: "8px",
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "8px",
                              }}
                            >
                              {filterServicesBySearch(
                                JOB_SERVICE_LIBRARY.landscaping.hardscaping,
                              ).map((service) => (
                                <div
                                  key={`land-hard-${service}`}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      applyJobServiceTemplate(service)
                                    }
                                    style={{
                                      padding: "7px 10px",
                                      borderRadius: "999px",
                                      border: "1px solid #d0d0d0",
                                      background: "white",
                                      cursor: "pointer",
                                      fontSize: "13px",
                                    }}
                                  >
                                    {service}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleFavoriteJobService(service)
                                    }
                                    title={
                                      isFavoriteJobService(service)
                                        ? uiText.forms.job.removeFavorite
                                        : uiText.forms.job.addFavorite
                                    }
                                    style={{
                                      border: "none",
                                      background: "transparent",
                                      cursor: "pointer",
                                      color: isFavoriteJobService(service)
                                        ? "#a16207"
                                        : "#666",
                                      fontSize: "14px",
                                    }}
                                  >
                                    {isFavoriteJobService(service) ? "?" : "?"}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <strong>{uiText.forms.job.concreteCategory}</strong>
                            <p style={{ margin: "8px 0 0 0", color: "#666" }}>
                              {uiText.forms.job.concreteDecorative}
                            </p>
                            <div
                              style={{
                                marginTop: "8px",
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "8px",
                              }}
                            >
                              {filterServicesBySearch(
                                JOB_SERVICE_LIBRARY.concrete.decorative,
                              ).map((service) => (
                                <button
                                  key={`con-deco-${service}`}
                                  type="button"
                                  onClick={() =>
                                    applyJobServiceTemplate(service)
                                  }
                                  style={{
                                    padding: "7px 10px",
                                    borderRadius: "999px",
                                    border: "1px solid #d0d0d0",
                                    background: "white",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                  }}
                                >
                                  {service}
                                </button>
                              ))}
                            </div>
                            <p style={{ margin: "10px 0 0 0", color: "#666" }}>
                              {uiText.forms.job.concreteInstallations}
                            </p>
                            <div
                              style={{
                                marginTop: "8px",
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "8px",
                              }}
                            >
                              {filterServicesBySearch(
                                JOB_SERVICE_LIBRARY.concrete.installations,
                              ).map((service) => (
                                <button
                                  key={`con-install-${service}`}
                                  type="button"
                                  onClick={() =>
                                    applyJobServiceTemplate(service)
                                  }
                                  style={{
                                    padding: "7px 10px",
                                    borderRadius: "999px",
                                    border: "1px solid #d0d0d0",
                                    background: "white",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                  }}
                                >
                                  {service}
                                </button>
                              ))}
                            </div>
                            <p style={{ margin: "10px 0 0 0", color: "#666" }}>
                              {uiText.forms.job.concreteRepairAndRemoval}
                            </p>
                            <div
                              style={{
                                marginTop: "8px",
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "8px",
                              }}
                            >
                              {filterServicesBySearch(
                                JOB_SERVICE_LIBRARY.concrete.repairAndRemoval,
                              ).map((service) => (
                                <div
                                  key={`con-repair-${service}`}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      applyJobServiceTemplate(service)
                                    }
                                    style={{
                                      padding: "7px 10px",
                                      borderRadius: "999px",
                                      border: "1px solid #d0d0d0",
                                      background: "white",
                                      cursor: "pointer",
                                      fontSize: "13px",
                                    }}
                                  >
                                    {service}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleFavoriteJobService(service)
                                    }
                                    title={
                                      isFavoriteJobService(service)
                                        ? uiText.forms.job.removeFavorite
                                        : uiText.forms.job.addFavorite
                                    }
                                    style={{
                                      border: "none",
                                      background: "transparent",
                                      cursor: "pointer",
                                      color: isFavoriteJobService(service)
                                        ? "#a16207"
                                        : "#666",
                                      fontSize: "14px",
                                    }}
                                  >
                                    {isFavoriteJobService(service) ? "?" : "?"}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                          {jobServiceSearch.trim() &&
                          filterServicesBySearch(ALL_JOB_SERVICES).length === 0
                            ? <p style={{ margin: 0, color: "#777" }}>
                                {uiText.forms.job.noServiceResults}
                              </p>
                            : null}
                        </div>
                      </details>
                      <div
                        style={{
                          border: "1px solid #e2e2e2",
                          borderRadius: "10px",
                          padding: "12px",
                          background: "#fafafa",
                          display: "grid",
                          gap: "10px",
                        }}
                      >
                        <strong>{uiText.forms.job.smartTableTitle}</strong>
                        <p
                          style={{ margin: 0, color: "#666", fontSize: "13px" }}
                        >
                          {uiText.forms.job.smartTableHint}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            window.open(
                              "/smart-estimator",
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                          style={{
                            width: "fit-content",
                            padding: "10px 14px",
                            borderRadius: "8px",
                            border: "1px solid #ccc",
                            background: "white",
                            cursor: "pointer",
                          }}
                        >
                          {uiText.forms.job.smartTableTitle}
                        </button>
                      </div>
                      <select
                        value={jobForm.status}
                        onChange={(e) =>
                          setJobForm({ ...jobForm, status: e.target.value })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      >
                        <option>Pending</option>
                        <option>In progress</option>
                        <option>Completed</option>
                      </select>
                      <input
                        placeholder={uiText.forms.job.price}
                        value={jobForm.price}
                        onChange={(e) =>
                          setJobForm({ ...jobForm, price: e.target.value })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                      <select
                        value={jobForm.taxState}
                        onChange={(e) =>
                          setJobForm({ ...jobForm, taxState: e.target.value })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      >
                        {US_STATE_OPTIONS.map((state) => (
                          <option key={state.code} value={state.code}>
                            {state.code} - {state.name}
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder={uiText.forms.job.downPayment}
                        value={jobForm.downPaymentPercent}
                        onChange={(e) =>
                          setJobForm({
                            ...jobForm,
                            downPaymentPercent: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                      <input
                        type="date"
                        value={jobForm.dueDate}
                        onChange={(e) =>
                          setJobForm({ ...jobForm, dueDate: e.target.value })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                      <button
                        type="button"
                        onClick={saveJob}
                        style={{
                          padding: "12px 18px",
                          borderRadius: "8px",
                          border: "none",
                          background: "black",
                          color: "white",
                          cursor: "pointer",
                        }}
                      >
                        {uiText.forms.job.save}
                      </button>
                    </div>
                  </div>
                : null}

              {jobs.length > 0
                ? <div style={{ marginTop: "30px" }}>
                    <h3 style={{ margin: "0 0 16px 0", fontSize: "18px" }}>
                      {uiText.dashboard.recentJobs}
                    </h3>
                    <div
                      style={{
                        display: "grid",
                        gap: "14px",
                      }}
                    >
                      {jobs
                        .slice(-5)
                        .reverse()
                        .map((job) => (
                          <div
                            key={job._id}
                            style={{
                              padding: "14px",
                              border: "1px solid #e0e0e0",
                              borderRadius: "12px",
                              background: "#fafafa",
                            }}
                          >
                            <p style={{ margin: 0, fontSize: "14px" }}>
                              <strong>{job.title}</strong> � {job.clientName}
                            </p>
                            <p
                              style={{
                                margin: "6px 0 0 0",
                                fontSize: "12px",
                                color: "#666",
                              }}
                            >
                              {job.service} � Status: {job.status} � Price:{" "}
                              {money(job.price)}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                : null}

              <div style={{ marginTop: "24px", display: "grid", gap: "14px" }}>
                {jobs.map((job) => {
                  const linkedInvoice = getLinkedInvoice(job._id);
                  const jobRequests = estimateRequests.filter(
                    (item) => item.jobId === job._id,
                  );

                  return (
                    <div
                      key={job._id}
                      style={{
                        padding: "18px",
                        border: "1px solid #ddd",
                        borderRadius: "14px",
                        background: "#fff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <h3 style={{ margin: 0 }}>{job.title}</h3>
                          <p style={{ margin: "8px 0 0 0", color: "#555" }}>
                            {job.clientName} � {job.service}
                          </p>
                          <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                            {uiText.labels.status}: {job.status} �{" "}
                            {uiText.labels.price}: {money(job.price)}
                          </p>
                          <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                            {uiText.labels.date}:{" "}
                            {job.dueDate || uiText.labels.noDate}
                          </p>
                          {linkedInvoice
                            ? <p
                                style={{
                                  margin: "8px 0 0 0",
                                  color: "#1d6f42",
                                }}
                              >
                                {uiText.labels.linkedInvoice}:{" "}
                                {linkedInvoice.invoiceNumber ||
                                  uiText.labels.noNumber}
                              </p>
                            : null}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          <details style={{ minWidth: "220px" }}>
                            <summary
                              style={{
                                padding: "10px 16px",
                                borderRadius: "8px",
                                border: "1px solid #ccc",
                                background: "white",
                                color: "black",
                                cursor: "pointer",
                                userSelect: "none",
                              }}
                            >
                              {uiText.buttons.actionsMenu}
                            </summary>
                            <div
                              style={{
                                marginTop: "8px",
                                display: "grid",
                                gap: "8px",
                                padding: "10px",
                                border: "1px solid #d9d9d9",
                                borderRadius: "10px",
                                background: "#fafafa",
                                minWidth: "220px",
                              }}
                            >
                              <select
                                value={
                                  estimateLanguageByJobId[job._id] || "default"
                                }
                                onChange={(e) =>
                                  setEstimateLanguageByJobId({
                                    ...estimateLanguageByJobId,
                                    [job._id]: e.target.value,
                                  })
                                }
                                style={{
                                  padding: "10px 12px",
                                  borderRadius: "8px",
                                  border: "1px solid #ccc",
                                  background: "white",
                                }}
                              >
                                {SEND_LANGUAGE_OPTIONS.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  createOrCopyQuoteLink(job, false)
                                }
                                style={{
                                  padding: "10px 16px",
                                  borderRadius: "8px",
                                  border: "1px solid #111",
                                  background: "#111",
                                  color: "white",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                {copiedQuoteLinkJobId === job._id
                                  ? uiText.buttons.linkCopied
                                  : uiText.buttons.copyClientLink}
                              </button>
                              <button
                                type="button"
                                onClick={() => sendQuoteByEmail(job)}
                                disabled={sendingQuoteEmailJobId === job._id}
                                style={{
                                  padding: "10px 16px",
                                  borderRadius: "8px",
                                  border: "none",
                                  background: "#1d6f42",
                                  color: "white",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                {sendingQuoteEmailJobId === job._id
                                  ? uiText.buttons.sending
                                  : sentQuoteEmailJobId === job._id
                                    ? uiText.buttons.quoteSent
                                    : uiText.buttons.sendQuoteEmail}
                              </button>
                              <button
                                type="button"
                                onClick={() => createOrCopyQuoteLink(job, true)}
                                style={{
                                  padding: "10px 16px",
                                  borderRadius: "8px",
                                  border: "1px solid #777",
                                  background: "white",
                                  color: "#111",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                {uiText.buttons.regenerateLink}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  printEstimate(
                                    job,
                                    estimateLanguageByJobId[job._id] ||
                                      "default",
                                  )
                                }
                                style={{
                                  padding: "10px 16px",
                                  borderRadius: "8px",
                                  border: "1px solid #ccc",
                                  background: "white",
                                  color: "black",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                {uiText.buttons.printEstimate}
                              </button>
                              <button
                                type="button"
                                onClick={() => openInvoiceForJob(job)}
                                style={{
                                  padding: "10px 16px",
                                  borderRadius: "8px",
                                  border: "none",
                                  background: "#0b69ff",
                                  color: "white",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                {linkedInvoice
                                  ? uiText.buttons.editLinkedInvoice
                                  : uiText.buttons.createInvoice}
                              </button>
                            </div>
                          </details>
                        </div>
                      </div>
                      <details
                        style={{
                          marginTop: "14px",
                          borderTop: "1px solid #eceff5",
                          paddingTop: "12px",
                        }}
                      >
                        <summary
                          style={{
                            cursor: "pointer",
                            userSelect: "none",
                            fontWeight: 600,
                          }}
                        >
                          {uiText.labels.requests} ({jobRequests.length})
                        </summary>
                        {jobRequests.length === 0
                          ? <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                              {uiText.labels.noRequests}
                            </p>
                          : <div
                              style={{
                                marginTop: "10px",
                                display: "grid",
                                gap: "10px",
                              }}
                            >
                              {jobRequests.map((request) => (
                                <div
                                  key={request._id}
                                  style={{
                                    border: "1px solid #e2e6ef",
                                    borderRadius: "10px",
                                    padding: "10px",
                                  }}
                                >
                                  <p style={{ margin: 0, color: "#333" }}>
                                    <strong>{request.requestType}</strong> �{" "}
                                    {request.status}
                                  </p>
                                  {request.item
                                    ? <p
                                        style={{
                                          margin: "6px 0 0 0",
                                          color: "#444",
                                        }}
                                      >
                                        <strong>Item:</strong> {request.item}
                                      </p>
                                    : null}
                                  <p
                                    style={{
                                      margin: "6px 0 0 0",
                                      color: "#444",
                                      whiteSpace: "pre-wrap",
                                    }}
                                  >
                                    {request.message}
                                  </p>
                                  <p
                                    style={{
                                      margin: "6px 0 0 0",
                                      color: "#666",
                                      fontSize: "13px",
                                    }}
                                  >
                                    {uiText.labels.contact}:{" "}
                                    {request.contactName ||
                                      uiText.labels.notAvailable}{" "}
                                    {request.contactEmail
                                      ? `� ${request.contactEmail}`
                                      : ""}{" "}
                                    {request.contactPhone
                                      ? `� ${request.contactPhone}`
                                      : ""}
                                  </p>
                                  <div
                                    style={{
                                      marginTop: "8px",
                                      display: "flex",
                                      gap: "8px",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateEstimateRequestStatus(
                                          request._id,
                                          "reviewed",
                                        )
                                      }
                                      style={{
                                        padding: "8px 12px",
                                        borderRadius: "8px",
                                        border: "1px solid #b8c3d6",
                                        background: "#fff",
                                        cursor: "pointer",
                                      }}
                                    >
                                      {uiText.buttons.markReviewed}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateEstimateRequestStatus(
                                          request._id,
                                          "resolved",
                                        )
                                      }
                                      style={{
                                        padding: "8px 12px",
                                        borderRadius: "8px",
                                        border: "none",
                                        background: "#1d6f42",
                                        color: "#fff",
                                        cursor: "pointer",
                                      }}
                                    >
                                      {uiText.buttons.markResolved}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>}
                      </details>
                    </div>
                  );
                })}
                {jobs.length === 0
                  ? <p style={{ color: "#777" }}>{uiText.empty.jobs}</p>
                  : null}
              </div>
            </section>
          : null}

        {activeTab === "invoices"
          ? <section style={{ marginTop: "30px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "20px",
                  flexWrap: "wrap",
                }}
              >
                <h2 style={{ margin: 0 }}>{uiText.sections.invoices}</h2>
                <button
                  type="button"
                  onClick={() => {
                    const nextOpen = !showInvoiceForm;
                    setShowInvoiceForm(nextOpen);
                    if (!nextOpen) {
                      resetInvoiceForm();
                    } else {
                      setInvoiceForm(getDefaultInvoiceForm(companyProfile));
                      setSelectedInvoiceId(null);
                    }
                  }}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: "black",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  {showInvoiceForm
                    ? uiText.actions.hideForm
                    : uiText.actions.newInvoice}
                </button>
              </div>

              {showInvoiceForm
                ? <div
                    style={{
                      marginTop: "20px",
                      padding: "20px",
                      border: "1px solid #ddd",
                      borderRadius: "14px",
                      background: "#fff",
                    }}
                  >
                    <h3 style={{ marginTop: 0 }}>
                      {selectedInvoiceId
                        ? uiText.forms.invoice.editTitle
                        : uiText.forms.invoice.newTitle}
                    </h3>
                    <div style={{ display: "grid", gap: "12px" }}>
                      <select
                        value={invoiceForm.jobId}
                        onChange={(e) => handleInvoiceJobChange(e.target.value)}
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      >
                        <option value="">
                          {uiText.forms.invoice.selectJob}
                        </option>
                        {jobs.map((job) => (
                          <option key={job._id} value={job._id}>
                            {job.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("jobs");
                          setShowJobForm(true);
                          setShowInvoiceForm(false);
                        }}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "8px",
                          border: "1px dashed #777",
                          background: "white",
                          color: "#333",
                          cursor: "pointer",
                          width: "fit-content",
                        }}
                      >
                        {uiText.forms.invoice.orAddJob}
                      </button>
                      <select
                        value={invoiceForm.clientId}
                        onChange={(e) =>
                          handleInvoiceClientChange(e.target.value)
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      >
                        <option value="">
                          {uiText.forms.invoice.selectClient}
                        </option>
                        {clients.map((client) => (
                          <option key={client._id} value={client._id}>
                            {client.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("clients");
                          setShowClientForm(true);
                          setShowInvoiceForm(false);
                        }}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "8px",
                          border: "1px dashed #777",
                          background: "white",
                          color: "#333",
                          cursor: "pointer",
                          width: "fit-content",
                        }}
                      >
                        {uiText.forms.invoice.orAddClient}
                      </button>
                      <input
                        placeholder={uiText.forms.invoice.concept}
                        value={invoiceForm.invoiceTitle}
                        onChange={(e) =>
                          setInvoiceForm({
                            ...invoiceForm,
                            invoiceTitle: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                      <input
                        placeholder={uiText.forms.invoice.number}
                        value={invoiceForm.invoiceNumber}
                        onChange={(e) =>
                          setInvoiceForm({
                            ...invoiceForm,
                            invoiceNumber: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                      <input
                        placeholder={uiText.forms.invoice.amount}
                        value={invoiceForm.amount}
                        onChange={(e) =>
                          setInvoiceForm({
                            ...invoiceForm,
                            amount: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                      <input
                        type="date"
                        value={invoiceForm.dueDate}
                        onChange={(e) =>
                          setInvoiceForm({
                            ...invoiceForm,
                            dueDate: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                      <select
                        value={invoiceForm.preferredPaymentMethod}
                        onChange={(e) =>
                          setInvoiceForm({
                            ...invoiceForm,
                            preferredPaymentMethod: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      >
                        {getPaymentMethodOptions(uiLanguage).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <textarea
                        placeholder={uiText.forms.invoice.lineItems}
                        value={invoiceForm.lineItemsText}
                        onChange={(e) =>
                          setInvoiceForm({
                            ...invoiceForm,
                            lineItemsText: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                          minHeight: "110px",
                        }}
                      />
                      <textarea
                        placeholder={uiText.forms.invoice.internalNotes}
                        value={invoiceForm.notes}
                        onChange={(e) =>
                          setInvoiceForm({
                            ...invoiceForm,
                            notes: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                          minHeight: "90px",
                        }}
                      />
                      <div
                        style={{
                          display: "flex",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          onClick={runInvoiceAI}
                          disabled={invoiceAiLoading}
                          style={{
                            padding: "12px 18px",
                            borderRadius: "8px",
                            border: "1px solid #ccc",
                            background: "white",
                            cursor: invoiceAiLoading ? "wait" : "pointer",
                          }}
                        >
                          {invoiceAiLoading
                            ? uiText.forms.invoice.aiGenerating
                            : uiText.forms.invoice.aiComplete}
                        </button>
                        <button
                          type="button"
                          onClick={saveInvoice}
                          style={{
                            padding: "12px 18px",
                            borderRadius: "8px",
                            border: "none",
                            background: "black",
                            color: "white",
                            cursor: "pointer",
                          }}
                        >
                          {selectedInvoiceId
                            ? uiText.forms.invoice.update
                            : uiText.forms.invoice.save}
                        </button>
                        <button
                          type="button"
                          onClick={resetInvoiceForm}
                          style={{
                            padding: "12px 18px",
                            borderRadius: "8px",
                            border: "1px solid #ccc",
                            background: "white",
                            cursor: "pointer",
                          }}
                        >
                          {uiText.forms.invoice.clear}
                        </button>
                      </div>
                    </div>
                  </div>
                : null}

              {invoices.length > 0
                ? <div style={{ marginTop: "30px" }}>
                    <h3 style={{ margin: "0 0 16px 0", fontSize: "18px" }}>
                      {uiText.dashboard.recentInvoices}
                    </h3>
                    <div
                      style={{
                        display: "grid",
                        gap: "14px",
                      }}
                    >
                      {invoices
                        .slice(-5)
                        .reverse()
                        .map((invoice) => (
                          <div
                            key={invoice._id}
                            style={{
                              padding: "14px",
                              border: "1px solid #e0e0e0",
                              borderRadius: "12px",
                              background: "#fafafa",
                            }}
                          >
                            <p style={{ margin: 0, fontSize: "14px" }}>
                              <strong>
                                {invoice.invoiceNumber ||
                                  uiText.dashboard.invoiceWithoutNumber}
                              </strong>{" "}
                              � {invoice.clientName}
                            </p>
                            <p
                              style={{
                                margin: "6px 0 0 0",
                                fontSize: "12px",
                                color: "#666",
                              }}
                            >
                              {invoice.status} � Amount: {money(invoice.amount)}{" "}
                              � Balance: {money(invoice.balanceDue)}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                : null}

              <div style={{ marginTop: "24px", display: "grid", gap: "14px" }}>
                {invoices.map((invoice) => {
                  const linkedJob = getLinkedJob(invoice);

                  return (
                    <div
                      key={invoice._id}
                      style={{
                        padding: "18px",
                        border: "1px solid #ddd",
                        borderRadius: "14px",
                        background: "#fff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <h3 style={{ margin: 0 }}>
                            {invoice.invoiceNumber ||
                              uiText.dashboard.invoiceWithoutNumber}
                          </h3>
                          <p style={{ margin: "8px 0 0 0", color: "#555" }}>
                            {invoice.clientName} � {invoice.status}
                          </p>
                          {invoice.invoiceTitle
                            ? <p style={{ margin: "8px 0 0 0", color: "#444" }}>
                                {invoice.invoiceTitle}
                              </p>
                            : null}
                          <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                            {uiText.labels.amount}: {money(invoice.amount)}
                          </p>
                          <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                            {uiText.labels.paid}: {money(invoice.paidAmount)} �{" "}
                            {uiText.labels.balance}:{" "}
                            {money(invoice.balanceDue || invoice.amount)}
                          </p>
                          <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                            {uiText.labels.preferredMethod}:{" "}
                            {paymentMethodLabel(
                              invoice.preferredPaymentMethod,
                              uiLanguage,
                            )}
                          </p>
                          <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                            {uiText.labels.due}:{" "}
                            {invoice.dueDate || uiText.labels.noDate}
                          </p>
                          {invoice.lineItems?.length
                            ? <p
                                style={{
                                  margin: "8px 0 0 0",
                                  color: "#777",
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {formatInvoiceLineItems(invoice.lineItems)}
                              </p>
                            : null}
                          {invoice.payments?.length
                            ? <p
                                style={{
                                  margin: "8px 0 0 0",
                                  color: "#4a4a4a",
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {invoice.payments
                                  .map(
                                    (item) =>
                                      `- ${item.date}: ${money(item.amount)} (${paymentMethodLabel(item.method, uiLanguage)})${item.reference ? ` ref ${item.reference}` : ""}`,
                                  )
                                  .join("\n")}
                              </p>
                            : null}
                          {linkedJob
                            ? <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                                {uiText.labels.linkedJob}: {linkedJob.title}
                              </p>
                            : null}
                          {invoice.contractId
                            ? <p
                                style={{
                                  margin: "8px 0 0 0",
                                  color: "#1d6f42",
                                }}
                              >
                                {uiText.labels.contract}:{" "}
                                {invoice.contractStatus || "Draft"}
                              </p>
                            : null}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          <details style={{ minWidth: "220px" }}>
                            <summary
                              style={{
                                padding: "10px 16px",
                                borderRadius: "8px",
                                border: "1px solid #ccc",
                                background: "white",
                                color: "black",
                                cursor: "pointer",
                                userSelect: "none",
                              }}
                            >
                              {uiText.buttons.actionsMenu}
                            </summary>
                            <div
                              style={{
                                marginTop: "8px",
                                display: "grid",
                                gap: "8px",
                                padding: "10px",
                                border: "1px solid #d9d9d9",
                                borderRadius: "10px",
                                background: "#fafafa",
                                minWidth: "220px",
                              }}
                            >
                              <select
                                value={
                                  invoiceLanguageById[invoice._id] ||
                                  companyProfile.documentLanguage ||
                                  "en"
                                }
                                onChange={(e) =>
                                  setInvoiceLanguageById({
                                    ...invoiceLanguageById,
                                    [invoice._id]: e.target.value,
                                  })
                                }
                                style={{
                                  padding: "10px 12px",
                                  borderRadius: "8px",
                                  border: "1px solid #ccc",
                                  background: "white",
                                }}
                              >
                                {SEND_LANGUAGE_OPTIONS.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  printInvoice(
                                    invoice,
                                    invoiceLanguageById[invoice._id] ||
                                      companyProfile.documentLanguage ||
                                      "en",
                                  )
                                }
                                style={{
                                  padding: "10px 16px",
                                  borderRadius: "8px",
                                  border: "1px solid #ccc",
                                  background: "white",
                                  color: "black",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                {uiText.buttons.printInvoice}
                              </button>
                              <button
                                type="button"
                                onClick={() => sendInvoiceByEmail(invoice)}
                                style={{
                                  padding: "10px 16px",
                                  borderRadius: "8px",
                                  border: "none",
                                  background: "#0f766e",
                                  color: "white",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                {uiText.buttons.sendInvoiceEmail}
                              </button>
                              <button
                                type="button"
                                onClick={() => sendInvoiceByText(invoice)}
                                style={{
                                  padding: "10px 16px",
                                  borderRadius: "8px",
                                  border: "none",
                                  background: "#1d4ed8",
                                  color: "white",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                {uiText.buttons.sendInvoiceText}
                              </button>
                              <button
                                type="button"
                                onClick={() => payInvoiceOnline(invoice)}
                                style={{
                                  padding: "10px 16px",
                                  borderRadius: "8px",
                                  border: "none",
                                  background: "#635bff",
                                  color: "white",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                {uiText.buttons.chargeOnline}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  startRegisterInvoicePayment(invoice)
                                }
                                style={{
                                  padding: "10px 16px",
                                  borderRadius: "8px",
                                  border: "none",
                                  background: "#1d6f42",
                                  color: "white",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                {uiText.buttons.registerPayment}
                              </button>
                              <button
                                type="button"
                                onClick={() => editInvoice(invoice)}
                                style={{
                                  padding: "10px 16px",
                                  borderRadius: "8px",
                                  border: "none",
                                  background: "#0b69ff",
                                  color: "white",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                {uiText.buttons.edit}
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteInvoice(invoice._id)}
                                style={{
                                  padding: "10px 16px",
                                  borderRadius: "8px",
                                  border: "none",
                                  background: "#d32f2f",
                                  color: "white",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                {uiText.buttons.delete}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  createContractFromInvoice(invoice)
                                }
                                disabled={!invoice.jobId && !invoice.contractId}
                                style={{
                                  padding: "10px 16px",
                                  borderRadius: "8px",
                                  border: "none",
                                  background:
                                    !invoice.jobId && !invoice.contractId
                                      ? "#c7ccd5"
                                      : "#1d6f42",
                                  color: "white",
                                  cursor:
                                    !invoice.jobId && !invoice.contractId
                                      ? "not-allowed"
                                      : "pointer",
                                  textAlign: "left",
                                }}
                              >
                                {invoice.contractId
                                  ? uiText.buttons.viewContract
                                  : uiText.buttons.createContract}
                              </button>
                            </div>
                          </details>
                        </div>
                      </div>

                      {openPaymentFormInvoiceId === invoice._id
                        ? <div
                            style={{
                              marginTop: "12px",
                              padding: "12px",
                              border: "1px solid #d9e3d9",
                              borderRadius: "10px",
                              background: "#f7fbf7",
                              display: "grid",
                              gap: "10px",
                            }}
                          >
                            <strong>
                              {uiText.forms.invoice.registerPayment}
                            </strong>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(180px, 1fr))",
                                gap: "10px",
                              }}
                            >
                              <input
                                placeholder={uiText.forms.invoice.amount}
                                value={
                                  paymentDraftByInvoiceId[invoice._id]
                                    ?.amount || ""
                                }
                                onChange={(e) =>
                                  setPaymentDraftByInvoiceId((current) => ({
                                    ...current,
                                    [invoice._id]: {
                                      ...(current[invoice._id] ||
                                        initialPaymentDraft(invoice)),
                                      amount: e.target.value,
                                    },
                                  }))
                                }
                                style={{
                                  padding: "10px",
                                  borderRadius: "8px",
                                  border: "1px solid #cfd4dd",
                                }}
                              />
                              <input
                                type="date"
                                value={
                                  paymentDraftByInvoiceId[invoice._id]?.date ||
                                  todayIso()
                                }
                                onChange={(e) =>
                                  setPaymentDraftByInvoiceId((current) => ({
                                    ...current,
                                    [invoice._id]: {
                                      ...(current[invoice._id] ||
                                        initialPaymentDraft(invoice)),
                                      date: e.target.value,
                                    },
                                  }))
                                }
                                style={{
                                  padding: "10px",
                                  borderRadius: "8px",
                                  border: "1px solid #cfd4dd",
                                }}
                              />
                              <select
                                value={
                                  paymentDraftByInvoiceId[invoice._id]
                                    ?.method ||
                                  invoice.preferredPaymentMethod ||
                                  "bank_transfer"
                                }
                                onChange={(e) =>
                                  setPaymentDraftByInvoiceId((current) => ({
                                    ...current,
                                    [invoice._id]: {
                                      ...(current[invoice._id] ||
                                        initialPaymentDraft(invoice)),
                                      method: e.target.value,
                                    },
                                  }))
                                }
                                style={{
                                  padding: "10px",
                                  borderRadius: "8px",
                                  border: "1px solid #cfd4dd",
                                }}
                              >
                                {getPaymentMethodOptions(uiLanguage).map(
                                  (option) => (
                                    <option
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ),
                                )}
                              </select>
                              <input
                                placeholder={uiText.forms.invoice.reference}
                                value={
                                  paymentDraftByInvoiceId[invoice._id]
                                    ?.reference || ""
                                }
                                onChange={(e) =>
                                  setPaymentDraftByInvoiceId((current) => ({
                                    ...current,
                                    [invoice._id]: {
                                      ...(current[invoice._id] ||
                                        initialPaymentDraft(invoice)),
                                      reference: e.target.value,
                                    },
                                  }))
                                }
                                style={{
                                  padding: "10px",
                                  borderRadius: "8px",
                                  border: "1px solid #cfd4dd",
                                }}
                              />
                            </div>
                            <textarea
                              placeholder={uiText.forms.invoice.notes}
                              value={
                                paymentDraftByInvoiceId[invoice._id]?.notes ||
                                ""
                              }
                              onChange={(e) =>
                                setPaymentDraftByInvoiceId((current) => ({
                                  ...current,
                                  [invoice._id]: {
                                    ...(current[invoice._id] ||
                                      initialPaymentDraft(invoice)),
                                    notes: e.target.value,
                                  },
                                }))
                              }
                              style={{
                                padding: "10px",
                                borderRadius: "8px",
                                border: "1px solid #cfd4dd",
                                minHeight: "72px",
                              }}
                            />
                            <div
                              style={{
                                display: "flex",
                                gap: "10px",
                                flexWrap: "wrap",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => registerInvoicePayment(invoice)}
                                disabled={
                                  savingInvoicePaymentId === invoice._id
                                }
                                style={{
                                  padding: "10px 14px",
                                  borderRadius: "8px",
                                  border: "none",
                                  background: "#1d6f42",
                                  color: "#fff",
                                  cursor: "pointer",
                                }}
                              >
                                {savingInvoicePaymentId === invoice._id
                                  ? uiText.forms.invoice.saving
                                  : uiText.forms.invoice.savePayment}
                              </button>
                              <button
                                type="button"
                                onClick={() => setOpenPaymentFormInvoiceId("")}
                                style={{
                                  padding: "10px 14px",
                                  borderRadius: "8px",
                                  border: "1px solid #ccc",
                                  background: "#fff",
                                  cursor: "pointer",
                                }}
                              >
                                {uiText.forms.invoice.cancel}
                              </button>
                            </div>
                          </div>
                        : null}
                    </div>
                  );
                })}
                {invoices.length === 0
                  ? <p style={{ color: "#777" }}>{uiText.empty.invoices}</p>
                  : null}
              </div>
            </section>
          : null}

        {activeTab === "contracts"
          ? <section style={{ marginTop: "30px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "20px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h2 style={{ margin: 0 }}>{uiText.sections.contracts}</h2>
                  <p style={{ margin: "6px 0 0 0", color: "#666" }}>
                    {uiText.forms.contract.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowContractForm(!showContractForm)}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: "black",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  {showContractForm
                    ? uiText.actions.hideForm
                    : uiText.actions.newContract}
                </button>
              </div>

              {showContractForm
                ? <div
                    data-contract-form
                    style={{
                      marginTop: "20px",
                      padding: "20px",
                      border: "1px solid #ddd",
                      borderRadius: "14px",
                      background: "#fff",
                    }}
                  >
                    <h3 style={{ marginTop: 0 }}>
                      {editingContractId
                        ? uiText.forms.contract.editTitle
                        : uiText.forms.contract.newTitle}
                    </h3>
                    <div style={{ display: "grid", gap: "12px" }}>
                      <select
                        value={contractForm.mode}
                        onChange={(e) =>
                          setContractForm({
                            ...contractForm,
                            mode: e.target.value,
                            contractCategory:
                              e.target.value === "custom"
                                ? contractForm.contractCategory
                                : contractForm.contractCategory,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      >
                        <option value="template">
                          {uiText.forms.contract.templateMode}
                        </option>
                        <option value="custom">
                          {uiText.forms.contract.customMode}
                        </option>
                      </select>

                      <select
                        value={contractForm.contractLanguage}
                        onChange={(e) =>
                          setContractForm({
                            ...contractForm,
                            contractLanguage: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      >
                        {DOCUMENT_LANGUAGE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      <select
                        value={contractForm.clientId}
                        onChange={(e) =>
                          handleContractClientChange(e.target.value)
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      >
                        <option value="">
                          {uiText.forms.contract.selectClient}
                        </option>
                        {clients.map((client) => (
                          <option key={client._id} value={client._id}>
                            {client.name}
                          </option>
                        ))}
                      </select>

                      <input
                        placeholder={uiText.forms.contract.client}
                        value={contractForm.clientName}
                        onChange={(e) =>
                          setContractForm({
                            ...contractForm,
                            clientName: e.target.value,
                            clientId: "",
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />

                      <select
                        value={contractForm.jobId}
                        onChange={(e) =>
                          handleContractJobChange(e.target.value)
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      >
                        <option value="">
                          {uiText.forms.contract.selectJob}
                        </option>
                        {jobs.map((job) => (
                          <option key={job._id} value={job._id}>
                            {job.title}
                          </option>
                        ))}
                      </select>

                      <input
                        placeholder={uiText.forms.contract.title}
                        value={contractForm.jobTitle}
                        onChange={(e) =>
                          setContractForm({
                            ...contractForm,
                            jobTitle: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />

                      <input
                        placeholder={uiText.forms.contract.amount}
                        value={contractForm.amount}
                        onChange={(e) =>
                          setContractForm({
                            ...contractForm,
                            amount: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />

                      <select
                        value={contractForm.status}
                        onChange={(e) =>
                          setContractForm({
                            ...contractForm,
                            status: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      >
                        <option>Draft</option>
                        <option>Pending review</option>
                        <option>Ready to sign</option>
                      </select>

                      {contractForm.mode === "template"
                        ? <>
                            <select
                              value={contractForm.contractCategory}
                              onChange={(e) => {
                                const nextCategory = e.target.value;
                                const nextOption =
                                  getTemplateOptions(nextCategory)[0]?.value ||
                                  "";
                                setContractForm({
                                  ...contractForm,
                                  contractCategory: nextCategory,
                                  contractOption: nextOption,
                                });
                              }}
                              style={{
                                padding: "10px",
                                borderRadius: "8px",
                                border: "1px solid #ccc",
                              }}
                            >
                              {Object.entries(CONTRACT_TEMPLATE_LIBRARY).map(
                                ([value, config]) => (
                                  <option key={value} value={value}>
                                    {getLocalizedText(
                                      config.label,
                                      contractForm.contractLanguage,
                                    )}
                                  </option>
                                ),
                              )}
                            </select>

                            <select
                              value={contractForm.contractOption}
                              onChange={(e) =>
                                setContractForm({
                                  ...contractForm,
                                  contractOption: e.target.value,
                                })
                              }
                              style={{
                                padding: "10px",
                                borderRadius: "8px",
                                border: "1px solid #ccc",
                              }}
                            >
                              {getTemplateOptions(
                                contractForm.contractCategory,
                                contractForm.contractLanguage,
                              ).map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>

                            <textarea
                              placeholder={
                                uiText.forms.contract.additionalTerms
                              }
                              value={contractForm.additionalTerms}
                              onChange={(e) =>
                                setContractForm({
                                  ...contractForm,
                                  additionalTerms: e.target.value,
                                })
                              }
                              style={{
                                padding: "10px",
                                borderRadius: "8px",
                                border: "1px solid #ccc",
                                minHeight: "100px",
                              }}
                            />
                          </>
                        : <textarea
                            placeholder={uiText.forms.contract.customBody}
                            value={contractForm.body}
                            onChange={(e) =>
                              setContractForm({
                                ...contractForm,
                                body: e.target.value,
                              })
                            }
                            style={{
                              padding: "10px",
                              borderRadius: "8px",
                              border: "1px solid #ccc",
                              minHeight: "220px",
                            }}
                          />}

                      <div
                        style={{
                          border: "1px solid #e2e6ef",
                          borderRadius: "10px",
                          padding: "14px",
                          background: "#fafbfc",
                        }}
                      >
                        <strong>{uiText.forms.contract.preview}</strong>
                        <pre
                          style={{
                            margin: "10px 0 0 0",
                            whiteSpace: "pre-wrap",
                            fontFamily: "inherit",
                            color: "#333",
                          }}
                        >
                          {buildManualContractBody(contractForm) ||
                            getContractText(contractForm.contractLanguage)
                              .previewFallback}
                        </pre>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          onClick={runContractAI}
                          disabled={contractAiLoading}
                          style={{
                            padding: "12px 18px",
                            borderRadius: "8px",
                            border: "1px solid #ccc",
                            background: "white",
                            cursor: contractAiLoading ? "wait" : "pointer",
                          }}
                        >
                          {contractAiLoading
                            ? uiText.settings.contractAIGenerating
                            : uiText.settings.contractAILabel}
                        </button>
                        <button
                          type="button"
                          onClick={saveManualContract}
                          style={{
                            padding: "12px 18px",
                            borderRadius: "8px",
                            border: "none",
                            background: "black",
                            color: "white",
                            cursor: "pointer",
                          }}
                        >
                          {uiText.settings.contractAISave}
                        </button>
                        <button
                          type="button"
                          onClick={resetContractForm}
                          style={{
                            padding: "12px 18px",
                            borderRadius: "8px",
                            border: "1px solid #ccc",
                            background: "white",
                            cursor: "pointer",
                          }}
                        >
                          {uiText.forms.contract.clear}
                        </button>
                      </div>
                    </div>
                  </div>
                : null}

              <div style={{ marginTop: "24px", display: "grid", gap: "14px" }}>
                {contracts.map((contract) => (
                  <div
                    key={contract._id}
                    style={{
                      padding: "18px",
                      border: "1px solid #ddd",
                      borderRadius: "14px",
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <h3 style={{ margin: 0 }}>
                          {contract.jobTitle || uiText.sections.contracts}
                        </h3>
                        <p style={{ margin: "8px 0 0 0", color: "#555" }}>
                          {contract.clientName || uiText.labels.undefinedClient}{" "}
                          � {contract.status}
                        </p>
                        {contract.contractCategory ||
                        contract.contractOption ||
                        contract.contractLanguage
                          ? <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                              {contract.contractCategory || "custom"}
                              {contract.contractOption
                                ? ` � ${contract.contractOption}`
                                : ""}
                              {contract.contractLanguage
                                ? ` � ${contract.contractLanguage.toUpperCase()}`
                                : ""}
                            </p>
                          : null}
                        <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                          {uiText.labels.invoiceLabel}:{" "}
                          {contract.invoiceNumber || uiText.labels.noInvoice} �
                          {uiText.labels.amount}: {money(contract.amount)}
                        </p>
                      </div>
                      <div>
                        <select
                          value={
                            contractLanguageById[contract._id] || "default"
                          }
                          onChange={(e) =>
                            setContractLanguageById({
                              ...contractLanguageById,
                              [contract._id]: e.target.value,
                            })
                          }
                          style={{
                            padding: "10px 12px",
                            borderRadius: "8px",
                            border: "1px solid #ccc",
                            background: "white",
                            marginRight: "8px",
                          }}
                        >
                          {SEND_LANGUAGE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {contract.status === "Draft"
                          ? <button
                              type="button"
                              onClick={() => loadContractForEdit(contract)}
                              style={{
                                padding: "10px 16px",
                                borderRadius: "8px",
                                border: "1px solid #ccc",
                                background: "white",
                                color: "black",
                                cursor: "pointer",
                                marginRight: "8px",
                              }}
                            >
                              {uiText.buttons.edit}
                            </button>
                          : null}
                        <button
                          type="button"
                          onClick={() =>
                            printContract(
                              contract,
                              contractLanguageById[contract._id] || "default",
                            )
                          }
                          style={{
                            padding: "10px 16px",
                            borderRadius: "8px",
                            border: "1px solid #ccc",
                            background: "white",
                            color: "black",
                            cursor: "pointer",
                          }}
                        >
                          {uiText.buttons.printContract}
                        </button>
                      </div>
                    </div>
                    <pre
                      style={{
                        marginTop: "14px",
                        whiteSpace: "pre-wrap",
                        fontFamily: "inherit",
                        background: "#f7f7f7",
                        padding: "14px",
                        borderRadius: "10px",
                        color: "#333",
                      }}
                    >
                      {contract.body}
                    </pre>
                  </div>
                ))}
                {contracts.length === 0
                  ? <p style={{ color: "#777" }}>{uiText.empty.contracts}</p>
                  : null}
              </div>
            </section>
          : null}

        {activeTab === "branding"
          ? <section style={{ marginTop: "30px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "20px",
                  flexWrap: "wrap",
                }}
              >
                <h2 style={{ margin: 0 }}>{uiText.sections.branding}</h2>
                <p style={{ margin: 0, color: "#666" }}>
                  {uiText.settings.description}
                </p>
              </div>

              <div
                style={{
                  marginTop: "20px",
                  padding: "20px",
                  border: "1px solid #ddd",
                  borderRadius: "14px",
                  background: "#fff",
                }}
              >
                <div style={{ display: "grid", gap: "12px" }}>
                  <div
                    style={{
                      border: "1px solid #e2e6ef",
                      borderRadius: "10px",
                      padding: "14px",
                      background: "#fafbfc",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <strong>{uiText.settings.businessMetricsTitle}</strong>
                    <p style={{ margin: 0, color: "#333" }}>
                      {uiText.settings.totalRevenueLabel}: {money(totalRevenue)}
                    </p>
                    <p style={{ margin: 0, color: "#333" }}>
                      {uiText.settings.pendingInvoicesLabel}:{" "}
                      {invoices.filter((inv) => inv.status !== "Paid").length}
                    </p>
                    <p style={{ margin: 0, color: "#333" }}>
                      {uiText.settings.outstandingLabel}:{" "}
                      {money(outstandingAmount)}
                    </p>
                    <p style={{ margin: 0, color: "#333" }}>
                      {uiText.settings.reviewsLabel}:{" "}
                      {companyForm.googleReviewsUrl ||
                        uiText.settings.reviewsMissing}
                    </p>
                  </div>

                  <input
                    placeholder={uiText.settings.companyNameLabel}
                    value={companyForm.companyName}
                    onChange={(e) =>
                      setCompanyForm({
                        ...companyForm,
                        companyName: e.target.value,
                      })
                    }
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                    }}
                  />

                  <label style={{ display: "grid", gap: "8px", color: "#333" }}>
                    <span>{uiText.settings.documentLanguageLabel}</span>
                    <select
                      value={companyForm.documentLanguage}
                      onChange={(e) =>
                        setCompanyForm({
                          ...companyForm,
                          documentLanguage: e.target.value,
                        })
                      }
                      style={{
                        padding: "10px",
                        borderRadius: "8px",
                        border: "1px solid #ccc",
                      }}
                    >
                      {DOCUMENT_LANGUAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      color: "#333",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={companyForm.forceEnglishTranslation}
                      onChange={(e) =>
                        setCompanyForm({
                          ...companyForm,
                          forceEnglishTranslation: e.target.checked,
                        })
                      }
                    />
                    {uiText.settings.alwaysTranslateCheckbox}
                  </label>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "12px",
                    }}
                  >
                    <label
                      style={{ display: "grid", gap: "8px", color: "#333" }}
                    >
                      <span>{uiText.settings.taxStateLabel}</span>
                      <select
                        value={companyForm.defaultTaxState}
                        onChange={(e) =>
                          setCompanyForm({
                            ...companyForm,
                            defaultTaxState: e.target.value,
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      >
                        {US_STATE_OPTIONS.map((state) => (
                          <option key={state.code} value={state.code}>
                            {state.code} - {state.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label
                      style={{ display: "grid", gap: "8px", color: "#333" }}
                    >
                      <span>{uiText.settings.invoiceDueDaysLabel}</span>
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={companyForm.defaultInvoiceDueDays}
                        onChange={(e) =>
                          setCompanyForm({
                            ...companyForm,
                            defaultInvoiceDueDays: clampInvoiceDueDays(
                              e.target.value,
                            ),
                          })
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                        }}
                      />
                    </label>
                  </div>

                  <label style={{ display: "grid", gap: "8px", color: "#333" }}>
                    <span>{uiText.settings.logoUploadLabel}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                    />
                  </label>

                  {companyForm.logoDataUrl
                    ? <div
                        style={{
                          border: "1px dashed #cfd4dd",
                          borderRadius: "10px",
                          padding: "12px",
                        }}
                      >
                        <Image
                          src={companyForm.logoDataUrl}
                          alt="Logo"
                          width={220}
                          height={70}
                          unoptimized
                          style={{
                            maxHeight: "70px",
                            maxWidth: "220px",
                            objectFit: "contain",
                          }}
                        />
                      </div>
                    : null}

                  <input
                    placeholder={uiText.settings.websiteUrlPlaceholder}
                    value={companyForm.websiteUrl}
                    onChange={(e) =>
                      setCompanyForm({
                        ...companyForm,
                        websiteUrl: e.target.value,
                      })
                    }
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                    }}
                  />

                  <input
                    placeholder={uiText.settings.googleReviewsPlaceholder}
                    value={companyForm.googleReviewsUrl}
                    onChange={(e) =>
                      setCompanyForm({
                        ...companyForm,
                        googleReviewsUrl: e.target.value,
                      })
                    }
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                    }}
                  />

                  <input
                    placeholder={uiText.settings.phoneLabel}
                    value={companyForm.phone}
                    onChange={(e) =>
                      setCompanyForm({ ...companyForm, phone: e.target.value })
                    }
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                    }}
                  />

                  <textarea
                    placeholder={uiText.settings.businessAddressLabel}
                    value={companyForm.businessAddress}
                    onChange={(e) =>
                      setCompanyForm({
                        ...companyForm,
                        businessAddress: e.target.value,
                      })
                    }
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                      minHeight: "80px",
                    }}
                  />

                  <textarea
                    placeholder={uiText.settings.poBoxAddressLabel}
                    value={companyForm.poBoxAddress}
                    onChange={(e) =>
                      setCompanyForm({
                        ...companyForm,
                        poBoxAddress: e.target.value,
                      })
                    }
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                      minHeight: "80px",
                    }}
                  />

                  <textarea
                    placeholder={uiText.settings.legalFooterPlaceholder}
                    value={companyForm.legalFooter}
                    onChange={(e) =>
                      setCompanyForm({
                        ...companyForm,
                        legalFooter: e.target.value,
                      })
                    }
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                      minHeight: "90px",
                    }}
                  />

                  <div style={{ marginTop: "32px" }}>
                    <h2 style={{ margin: "0 0 12px", color: "#111827" }}>
                      Integrations
                    </h2>
                    <GoogleIntegrationSection />
                  </div>

                  <div
                    style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}
                  >
                    <button
                      type="button"
                      onClick={saveCompanyProfile}
                      disabled={savingCompanyProfile}
                      style={{
                        padding: "12px 18px",
                        borderRadius: "8px",
                        border: "none",
                        background: "black",
                        color: "white",
                        cursor: "pointer",
                      }}
                    >
                      {savingCompanyProfile
                        ? uiText.settings.savingSettings
                        : uiText.settings.saveSettings}
                    </button>
                    <button
                      type="button"
                      onClick={resetCompanyForm}
                      disabled={savingCompanyProfile}
                      style={{
                        padding: "12px 18px",
                        borderRadius: "8px",
                        border: "1px solid #ccc",
                        background: "white",
                        cursor: "pointer",
                      }}
                    >
                      {uiText.settings.restoreSettings}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCompanyForm({ ...companyForm, logoDataUrl: "" })
                      }
                      disabled={savingCompanyProfile}
                      style={{
                        padding: "12px 18px",
                        borderRadius: "8px",
                        border: "1px solid #ccc",
                        background: "white",
                        cursor: "pointer",
                      }}
                    >
                      {uiText.settings.removeLogo}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          : null}
      </div>
    </div>
  );
}

export default function Home() {
  return <WorkspaceContent />;
}
