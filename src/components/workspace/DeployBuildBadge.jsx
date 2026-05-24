"use client";

const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || "";

export default function DeployBuildBadge({ className = "" }) {
  if (!BUILD_SHA || BUILD_SHA === "local") return null;

  return (
    <p
      className={className}
      style={{
        margin: "24px 0 0",
        fontSize: "0.72rem",
        color: "var(--fb-text-muted, #64748b)",
        letterSpacing: "0.02em",
      }}
      title="Production build — compare with /api/health commitSha"
    >
      Build {BUILD_SHA}
    </p>
  );
}
