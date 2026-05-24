/**
 * Server-rendered deploy marker — visible in View Source even before JS hydrates.
 */
export default function BuildVersionBar() {
  const sha = String(
    process.env.NEXT_PUBLIC_BUILD_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      "",
  ).slice(0, 12);

  if (!sha || sha === "local" || process.env.NODE_ENV !== "production") {
    return null;
  }

  return (
    <div
      data-fieldbase-build={sha}
      style={{
        position: "fixed",
        bottom: 0,
        right: 0,
        zIndex: 99999,
        padding: "4px 10px",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.04em",
        fontFamily: "ui-monospace, monospace",
        color: "rgba(148, 163, 184, 0.9)",
        background: "rgba(15, 23, 42, 0.85)",
        borderTopLeftRadius: 6,
        pointerEvents: "none",
      }}
      aria-label={`FieldBase production build ${sha}`}
    >
      prod · {sha}
    </div>
  );
}
