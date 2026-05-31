/**
 * In-page anchor navigation for public contractor websites.
 * IDs here must match section markup on /sites/[slug] and builder preview.
 */

export const PUBLIC_SITE_SECTIONS = {
  home: "home",
  services: "services",
  about: "about",
  gallery: "gallery",
  reviews: "reviews",
  requestService: "request-service",
  contact: "contact",
};

/** Nav links rendered in PublicSiteNav — keep in sync with tests. */
export const PUBLIC_SITE_NAV_LINKS = [
  { key: "services", hash: `#${PUBLIC_SITE_SECTIONS.services}` },
  { key: "gallery", hash: `#${PUBLIC_SITE_SECTIONS.gallery}` },
  { key: "reviews", hash: `#${PUBLIC_SITE_SECTIONS.reviews}` },
  { key: "about", hash: `#${PUBLIC_SITE_SECTIONS.about}` },
  { key: "contact", hash: `#${PUBLIC_SITE_SECTIONS.requestService}` },
];

export const LEAD_FORM_SECTION_IDS = new Set([
  PUBLIC_SITE_SECTIONS.requestService,
  PUBLIC_SITE_SECTIONS.contact,
]);

const DEFAULT_SCROLL_OFFSET = 88;

export function parseInPageHash(href) {
  const raw = String(href || "").trim();
  if (!raw) return "";
  if (raw.startsWith("#")) return raw.slice(1).split("?")[0];
  try {
    const url = new URL(raw, "https://fieldbase.local");
    const hash = url.hash.replace(/^#/, "").split("?")[0];
    return hash;
  } catch {
    return "";
  }
}

export function isSameDocumentHashLink(href) {
  const raw = String(href || "").trim();
  if (!raw.startsWith("#")) return false;
  return Boolean(parseInPageHash(raw));
}

export function revealSectionElement(element) {
  if (!element || typeof element.classList?.add !== "function") return;
  element.classList.add("ps-visible");
  element.querySelectorAll?.(".ps-reveal").forEach((node) => {
    node.classList.add("ps-visible");
  });
}

export function isScrollableContainer(element) {
  if (typeof document === "undefined" || !element) return false;
  if (element === document.documentElement || element === document.body) {
    return false;
  }
  const style = getComputedStyle(element);
  const overflowY = style.overflowY;
  if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") {
    return false;
  }
  return element.scrollHeight > element.clientHeight + 2;
}

export function resolveSectionScrollRoot(explicitRoot, anchor) {
  const candidate =
    explicitRoot || anchor?.closest?.("[data-preview-scroll]") || null;
  return isScrollableContainer(candidate) ? candidate : null;
}

export function findScrollableAncestor(element) {
  if (typeof document === "undefined" || !element) return null;
  let node = element.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    if (isScrollableContainer(node)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Scroll to a section by id. Works for window scroll and nested preview panes.
 * @returns {boolean} true if the target element exists and scroll was attempted
 */
export function scrollToPublicSiteSection(sectionId, options = {}) {
  if (typeof document === "undefined") return false;

  const id = String(sectionId || "")
    .replace(/^#/, "")
    .trim();
  if (!id) return false;

  const target = document.getElementById(id);
  if (!target) return false;

  const {
    behavior = "smooth",
    offset = DEFAULT_SCROLL_OFFSET,
    scrollRoot = null,
  } = options;

  revealSectionElement(target);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const scrollBehavior = behavior === "smooth" && !prefersReduced ? "smooth" : "auto";

  const scroller =
    scrollRoot || findScrollableAncestor(target) || null;

  if (scroller && scroller !== document.documentElement && scroller !== document.body) {
    const rootRect = scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = scroller.scrollTop + (targetRect.top - rootRect.top) - offset;
    scroller.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior });
    return true;
  }

  const top = target.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior });
  return true;
}

/**
 * Handle click on in-page anchor links. Returns true when handled.
 */
export function handlePublicSiteNavClick(event, options = {}) {
  const anchor = event?.target?.closest?.("a[href]");
  if (!anchor) return false;

  const href = anchor.getAttribute("href") || "";
  const hash = parseInPageHash(href);
  if (!hash) return false;

  if (!document.getElementById(hash)) return false;

  event.preventDefault();
  event.stopPropagation();

  const scrollRoot = resolveSectionScrollRoot(options.scrollRoot, anchor);

  scrollToPublicSiteSection(hash, {
    behavior: options.behavior,
    offset: options.offset,
    scrollRoot,
  });

  if (LEAD_FORM_SECTION_IDS.has(hash) && typeof options.onLeadForm === "function") {
    options.onLeadForm({ skipScroll: true });
  }

  if (typeof window !== "undefined" && window.history?.replaceState) {
    const nextUrl = `${window.location.pathname}${window.location.search}#${hash}`;
    window.history.replaceState(null, "", nextUrl);
  }

  return true;
}

/** All section ids that must exist on a complete public site page. */
export function getRequiredPublicSiteSectionIds({ hasAbout = true, hasReviews = true } = {}) {
  const ids = [
    PUBLIC_SITE_SECTIONS.services,
    PUBLIC_SITE_SECTIONS.gallery,
    PUBLIC_SITE_SECTIONS.requestService,
  ];
  if (hasAbout) ids.push(PUBLIC_SITE_SECTIONS.about);
  if (hasReviews) ids.push(PUBLIC_SITE_SECTIONS.reviews);
  return ids;
}
