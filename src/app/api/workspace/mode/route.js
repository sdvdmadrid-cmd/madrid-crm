import { NextResponse } from "next/server";
import {
  contractorWorkspaceCookieOptions,
  CONTRACTOR_WORKSPACE_COOKIE,
} from "@/lib/workspace-mode";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export async function GET(request) {
  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();

  const role = String(access.role || "").toLowerCase();
  const cookieHeader = request.headers.get("cookie") || "";
  const enabled =
    role === "super_admin" &&
    cookieHeader.includes(`${CONTRACTOR_WORKSPACE_COOKIE}=1`);

  return NextResponse.json({
    success: true,
    data: {
      role,
      contractorWorkspacePreview: enabled,
      canToggle: role === "super_admin",
    },
  });
}

export async function POST(request) {
  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();

  if (String(access.role || "").toLowerCase() !== "super_admin") {
    return NextResponse.json(
      { success: false, error: "Only platform owners can switch workspace preview." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const enable = body.enable === true;

  const res = NextResponse.json({
    success: true,
    data: { contractorWorkspacePreview: enable },
  });

  if (enable) {
    res.cookies.set(contractorWorkspaceCookieOptions());
  } else {
    res.cookies.set({
      name: CONTRACTOR_WORKSPACE_COOKIE,
      value: "",
      path: "/",
      maxAge: 0,
    });
  }

  return res;
}
