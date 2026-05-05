"use client";

import PlacesAutocomplete from "@/components/PlacesAutocomplete";

export const EMPTY_CLIENT_FORM = {
  id: "",
  name: "",
  company: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  latitude: null,
  longitude: null,
  addressPlaceId: "",
  billingAddress: "",
  billingCity: "",
  billingState: "",
  billingZip: "",
  billingSameAsService: true,
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
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginTop: 4 }}>
          {t("clients.labels.serviceAddress")}
        </div>
        <PlacesAutocomplete
          id="client-address"
          value={form.address || ""}
          selectedValueKey="formattedAddress"
          onChange={(value) =>
            onChange({
              ...form,
              address: value,
              city: "",
              state: "",
              zip: "",
              latitude: null,
              longitude: null,
              addressPlaceId: "",
            })
          }
          onSelect={({
            city,
            state,
            zip,
            formattedAddress,
            latitude,
            longitude,
            placeId,
          }) => {
            onChange({
              ...form,
              address: formattedAddress || form.address || "",
              city: city || "",
              state: state || "",
              zip: zip || "",
              latitude:
                typeof latitude === "number" ? latitude : null,
              longitude:
                typeof longitude === "number" ? longitude : null,
              addressPlaceId: placeId || "",
            });
          }}
          placeholder={t("clients.placeholders.address")}
          inputClass="cf-input"
          disabled={saving}
        />

        {/* City / State / Zip */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 90px", gap: 8 }}>
          <input
            className="cf-input"
            placeholder={t("clients.placeholders.city")}
            value={form.city || ""}
            onChange={(e) => onChange({ ...form, city: e.target.value, addressPlaceId: "" })}
          />
          <input
            className="cf-input"
            placeholder={t("clients.placeholders.state")}
            value={form.state || ""}
            onChange={(e) => onChange({ ...form, state: e.target.value, addressPlaceId: "" })}
          />
          <input
            className="cf-input"
            placeholder={t("clients.placeholders.zip")}
            value={form.zip || ""}
            onChange={(e) => onChange({ ...form, zip: e.target.value, addressPlaceId: "" })}
          />
        </div>

        {/* Billing address */}
        <div style={{ marginTop: 4, padding: "12px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f9fafb" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 8 }}>
            {t("clients.labels.billingAddress")}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: form.billingSameAsService !== false ? 0 : 10 }}>
            <input
              type="checkbox"
              checked={form.billingSameAsService !== false}
              onChange={(e) =>
                onChange({
                  ...form,
                  billingSameAsService: e.target.checked,
                  billingAddress: e.target.checked ? "" : form.billingAddress || "",
                  billingCity: e.target.checked ? "" : form.billingCity || "",
                  billingState: e.target.checked ? "" : form.billingState || "",
                  billingZip: e.target.checked ? "" : form.billingZip || "",
                })
              }
            />
            <span style={{ fontSize: 13, color: "#374151" }}>{t("clients.labels.billingSameAsService")}</span>
          </label>

          {form.billingSameAsService === false && (
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <PlacesAutocomplete
                id="client-billing-address"
                value={form.billingAddress || ""}
                selectedValueKey="formattedAddress"
                onChange={(value) =>
                  onChange({ ...form, billingAddress: value, billingCity: "", billingState: "", billingZip: "" })
                }
                onSelect={({ city, state, zip, formattedAddress }) => {
                  onChange({
                    ...form,
                    billingAddress: formattedAddress || form.billingAddress || "",
                    billingCity: city || "",
                    billingState: state || "",
                    billingZip: zip || "",
                  });
                }}
                placeholder={t("clients.placeholders.billingAddress")}
                inputClass="cf-input"
                disabled={saving}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 90px", gap: 8 }}>
                <input
                  className="cf-input"
                  placeholder={t("clients.placeholders.billingCity")}
                  value={form.billingCity || ""}
                  onChange={(e) => onChange({ ...form, billingCity: e.target.value })}
                />
                <input
                  className="cf-input"
                  placeholder={t("clients.placeholders.billingState")}
                  value={form.billingState || ""}
                  onChange={(e) => onChange({ ...form, billingState: e.target.value })}
                />
                <input
                  className="cf-input"
                  placeholder={t("clients.placeholders.billingZip")}
                  value={form.billingZip || ""}
                  onChange={(e) => onChange({ ...form, billingZip: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>

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
