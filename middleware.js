import { NextResponse } from "next/server";
import { verifyEdgeSessionToken } from "./src/lib/auth-edge";

// Rutas públicas que no requieren autenticación
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/resend-verification",
  "/api/health",
  "/api/payments/webhooks",
  "/api/email/webhooks",
  "/api/email/inbound",
  "/_next",
  "/favicon.ico",
  "/robots.txt",
  "/public",
  "/api/public",
];

function isApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function unauthenticatedApiResponse() {
  return NextResponse.json(
    { success: false, error: "Unauthenticated" },
    {
      status: 401,
      headers: {
        "Cache-Control":
          "private, no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        Vary: "Cookie, Authorization",
        "X-Auth-Proxy": "enforced",
      },
    },
  );
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  // Permitir rutas públicas
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Leer cookie de sesión
  const cookie =
    request.cookies.get("__Host-madrid_session")?.value ||
    request.cookies.get("madrid_session")?.value;
  if (!cookie) {
    if (isApiPath(pathname)) {
      return unauthenticatedApiResponse();
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Validar token
  const session = await verifyEdgeSessionToken(cookie);
  if (!session) {
    if (isApiPath(pathname)) {
      return unauthenticatedApiResponse();
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Sesión válida, continuar
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|public|api/public).*)"],
};
