import GoogleConnectButton from "@/components/GoogleConnectButton";
import { useCurrentUserAccess } from "@/lib/current-user-client";

export default function GoogleIntegrationSection() {
  const { authUser } = useCurrentUserAccess();
  if (!authUser) return null;

  return (
    <div style={{ margin: "32px 0" }}>
      <h3>Google Calendar</h3>
      <p>
        Conecta tu cuenta para sincronizar automaticamente los trabajos con tu
        calendario de Google.
      </p>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
        Signed in as {authUser.email || authUser.userId}
      </div>
      <GoogleConnectButton />
    </div>
  );
}
