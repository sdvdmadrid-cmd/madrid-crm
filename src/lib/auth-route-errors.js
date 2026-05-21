export function createVerificationOriginUnavailableResponse() {
  return new Response(
    JSON.stringify({
      success: false,
      error:
        "We could not generate a verification link for this request. Open the app using its public URL or configure APP_URL or APP_BASE_URL, then try again.",
      code: "VERIFICATION_LINK_ORIGIN_UNAVAILABLE",
    }),
    {
      status: 503,
      headers: { "Content-Type": "application/json" },
    },
  );
}
