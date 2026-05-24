/**
 * Legacy route — password updates must use POST /api/auth/reset-password
 * (OTP verification or recovery session). This endpoint is disabled to prevent
 * unauthenticated admin password changes via arbitrary user IDs.
 */
export async function POST() {
  return Response.json(
    {
      success: false,
      error: "This endpoint is deprecated. Use POST /api/auth/reset-password instead.",
    },
    { status: 410 },
  );
}
