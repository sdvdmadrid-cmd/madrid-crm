"use client";

import PlacesAutocomplete from "@/components/PlacesAutocomplete";

export const EMPTY_CLIENT_FORM = {
  id: "",
  name: "",
  company: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

export default function ClientForm({
  t,
  form,
  isEditing,
  saving,
  onChange,
  onSubmit,
  onCancel,
}) {
  return (
    <section className="cf-card" style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 20 }}>
        {isEditing ? t("clients.formTitleEdit") : t("clients.formTitleNew")}
      </h2>

      <div style={{ display: "grid", gap: 10 }}>
        <input
          className="cf-input"
          placeholder={t("clients.placeholders.name")}
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
        />
        <input
          className="cf-input"
          placeholder={t("clients.placeholders.company")}
          value={form.company}
          onChange={(e) => onChange({ ...form, company: e.target.value })}
        />
        <input
          className="cf-input"
          placeholder={t("clients.placeholders.phone")}
          value={form.phone}
          onChange={(e) => onChange({ ...form, phone: e.target.value })}
        />
        <input
          className="cf-input"
          placeholder={t("clients.placeholders.email")}
          value={form.email}
          onChange={(e) => onChange({ ...form, email: e.target.value })}
        />
        <PlacesAutocomplete
          id="client-address"
          value={form.address || ""}
          onChange={(value) => onChange({ ...form, address: value })}
          onSelect={({ street, city, state, zip }) => {
            const parts = [street, city, state, zip].filter(Boolean);
            onChange({ ...form, address: parts.join(", ") });
          }}
          placeholder={t("clients.placeholders.address")}
          inputClass="cf-input"
          disabled={saving}
        />
        <textarea
          className="cf-input"
          placeholder={t("clients.placeholders.notes")}
          value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })}
          rows={4}
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button
          type="button"
          className="cf-btn cf-btn-primary"
          onClick={onSubmit}
          disabled={saving}
        >
          {saving
            ? t("clients.buttons.saving")
            : isEditing
              ? t("clients.buttons.update")
              : t("clients.buttons.save")}
        </button>
        <button type="button" className="cf-btn" onClick={onCancel}>
          {t("clients.buttons.clear")}
        </button>
      </div>
    </section>
  );
}
