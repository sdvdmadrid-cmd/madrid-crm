"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

const PREFETCH_TTL_MS = 5 * 60 * 1000;
const PREFETCH_CACHE = new Map();
const CRITICAL_ROUTES = [
  "/",
  "/dashboard",
  "/clients",
  "/jobs",
  "/invoices",
  "/estimates",
  "/services-catalog",
  "/calendar",
];

function requestIdleWork(callback) {
  if (typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback(callback, { timeout: 1200 });
  }

  return window.setTimeout(() => {
    callback({ didTimeout: false, timeRemaining: () => 0 });
  }, 1);
}

function cancelIdleWork(id) {
  if (typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(id);
    return;
  }

  window.clearTimeout(id);
}

function isModifiedClick(event) {
  return Boolean(
    event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0,
  );
}

function isInternalNavigableAnchor(anchor) {
  if (!anchor) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  if (anchor.dataset.disableInstantNav === "true") return false;
  if (anchor.getAttribute("rel")?.includes("external")) return false;

  const href = anchor.getAttribute("href") || "";
  if (!href) return false;
  if (href.startsWith("#")) return false;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;

  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    if (url.pathname === window.location.pathname && url.search === window.location.search) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function toAppHref(anchor, { includeHash = true } = {}) {
  const url = new URL(anchor.href, window.location.href);
  return `${url.pathname}${url.search}${includeHash ? url.hash : ""}`;
}

function isFreshPrefetch(route) {
  const expiresAt = PREFETCH_CACHE.get(route);
  return typeof expiresAt === "number" && expiresAt > Date.now();
}

function markPrefetch(route) {
  PREFETCH_CACHE.set(route, Date.now() + PREFETCH_TTL_MS);
}

function collectInternalRoutesFromAnchors() {
  const routes = new Set();
  const anchors = document.querySelectorAll("a[href]");
  for (const anchor of anchors) {
    if (!isInternalNavigableAnchor(anchor)) continue;
    routes.add(toAppHref(anchor, { includeHash: false }));
  }
  return routes;
}

export default function InstantNavigation() {
  const router = useRouter();

  useEffect(() => {
    const prefetchedInSession = new Set();

    const prefetchRoute = (route) => {
      if (!route) return;
      if (isFreshPrefetch(route) || prefetchedInSession.has(route)) return;

      prefetchedInSession.add(route);
      router.prefetch(route);
      markPrefetch(route);
    };

    const warmKnownAndVisibleRoutes = () => {
      for (const route of CRITICAL_ROUTES) {
        prefetchRoute(route);
      }

      const dynamicRoutes = collectInternalRoutesFromAnchors();
      for (const route of dynamicRoutes) {
        prefetchRoute(route);
      }
    };

    const idleTaskId = requestIdleWork(() => {
      warmKnownAndVisibleRoutes();
    });

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const anchor = entry.target;
          if (!(anchor instanceof HTMLAnchorElement)) continue;
          if (!isInternalNavigableAnchor(anchor)) continue;
          prefetchRoute(toAppHref(anchor, { includeHash: false }));
        }
      },
      {
        rootMargin: "240px 0px",
        threshold: 0,
      },
    );

    const observeInternalAnchors = (root) => {
      const nodes = root.querySelectorAll?.("a[href]") || [];
      for (const anchor of nodes) {
        if (!isInternalNavigableAnchor(anchor)) continue;
        intersectionObserver.observe(anchor);
      }
    };

    observeInternalAnchors(document);

    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const addedNode of mutation.addedNodes) {
          if (!(addedNode instanceof Element)) continue;

          if (
            addedNode instanceof HTMLAnchorElement &&
            isInternalNavigableAnchor(addedNode)
          ) {
            intersectionObserver.observe(addedNode);
          }

          observeInternalAnchors(addedNode);
        }
      }

      requestIdleWork(() => {
        warmKnownAndVisibleRoutes();
      });
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    const onPointerOver = (event) => {
      const anchor = event.target?.closest?.("a[href]");
      if (!isInternalNavigableAnchor(anchor)) return;
      prefetchRoute(toAppHref(anchor, { includeHash: false }));
    };

    const onFocusIn = (event) => {
      const anchor = event.target?.closest?.("a[href]");
      if (!isInternalNavigableAnchor(anchor)) return;
      prefetchRoute(toAppHref(anchor, { includeHash: false }));
    };

    const onTouchStart = (event) => {
      const anchor = event.target?.closest?.("a[href]");
      if (!isInternalNavigableAnchor(anchor)) return;
      prefetchRoute(toAppHref(anchor, { includeHash: false }));
    };

    const onMouseDown = (event) => {
      const anchor = event.target?.closest?.("a[href]");
      if (!isInternalNavigableAnchor(anchor)) return;
      prefetchRoute(toAppHref(anchor, { includeHash: false }));
    };

    const onClick = (event) => {
      if (event.defaultPrevented || isModifiedClick(event)) return;
      const anchor = event.target?.closest?.("a[href]");
      if (!isInternalNavigableAnchor(anchor)) return;

      const routeForPrefetch = toAppHref(anchor, { includeHash: false });
      const routeForNavigation = toAppHref(anchor, { includeHash: true });
      event.preventDefault();
      prefetchRoute(routeForPrefetch);
      startTransition(() => {
        router.push(routeForNavigation);
      });
    };

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("touchstart", onTouchStart, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("click", onClick, true);

    return () => {
      cancelIdleWork(idleTaskId);
      mutationObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [router]);

  return null;
}
