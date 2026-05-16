"use client";

export default function PublicBillPaymentsHelp() {
  return (
    <section style={{ background: "#fff", borderRadius: 16, padding: 32, boxShadow: "0 2px 12px #e0e7ef33" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>Help & FAQ</h1>
      <ul style={{ color: "#475569", fontSize: 16, marginBottom: 18 }}>
        <li><b>¿Necesito suscribirme al plan completo?</b> No, solo $5/mes para Bill Payments.</li>
        <li><b>¿Puedo guardar métodos de pago?</b> Sí, puedes guardar tarjetas y cuentas bancarias.</li>
        <li><b>¿Recibo recordatorios?</b> Sí, puedes activar recordatorios de pago.</li>
        <li><b>¿Puedo cancelar cuando quiera?</b> Sí, puedes cancelar en cualquier momento.</li>
        <li><b>¿Qué soporte tengo?</b> Soporte por email y chat incluido.</li>
      </ul>
      <p style={{ color: "#64748b" }}>¿Tienes otra pregunta? Escribe a <a href="mailto:soporte@fieldbaseapp.net" style={{ color: "#0ea5e9" }}>soporte@fieldbaseapp.net</a></p>
    </section>
  );
}
