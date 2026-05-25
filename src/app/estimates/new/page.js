"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PlacesAutocomplete from "@/components/PlacesAutocomplete";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { getUsStateTaxRate } from "@/lib/estimate-pricing";

const CLIENT_PREFIXES = ["", "Mr.", "Mrs.", "Ms.", "Dr."];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value) {
  return EMAIL_REGEX.test(String(value || "").trim());
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount || 0);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inferBaseAndDiscount(services = [], fallbackSubtotal = 0) {
  if (!Array.isArray(services) || services.length === 0) {
    return {
      basePrice: Math.max(0, toNumber(fallbackSubtotal, 0)),
      discountType: "amount",
      discount: 0,
    };
  }

  const discountItem = services.find((item) => String(item?.id || "").toLowerCase() === "discount");
  if (discountItem) {
    const parsedType = String(discountItem.discountType || "").toLowerCase();
    const discountType = parsedType === "percent" ? "percent" : "amount";
    const rawDiscountValue = toNumber(discountItem.discountValue, NaN);

    if (Number.isFinite(rawDiscountValue)) {
      const positive = services
        .filter((item) => String(item?.id || "").toLowerCase() !== "discount")
        .reduce((sum, item) => {
          const qty = toNumber(item?.qty, 1);
          const unitPrice = toNumber(item?.unitPrice, 0);
          const linePrice = toNumber(item?.price, qty * unitPrice);
          return sum + Math.max(0, linePrice);
        }, 0);
      return {
        basePrice: Number(Math.max(0, positive).toFixed(2)),
        discountType,
        discount: Number(Math.max(0, rawDiscountValue).toFixed(2)),
      };
    }
  }

  let positive = 0;
  let negative = 0;
  for (const item of services) {
    const qty = toNumber(item?.qty, 1);
    const unitPrice = toNumber(item?.unitPrice, 0);
    const linePrice = toNumber(item?.price, qty * unitPrice);
    if (linePrice >= 0) positive += linePrice;
    else negative += Math.abs(linePrice);
  }

  if (positive === 0 && negative === 0) {
    return {
      basePrice: Math.max(0, toNumber(fallbackSubtotal, 0)),
      discountType: "amount",
      discount: 0,
    };
  }

  return {
    basePrice: Number(positive.toFixed(2)),
    discountType: "amount",
    discount: Number(negative.toFixed(2)),
  };
}

export default function NewEstimatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="text-sm text-slate-500">Loading…</div>
        </div>
      }
    >
      <NewEstimatePageInner />
    </Suspense>
  );
}

function NewEstimatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit") || "";

  const [clientPrefix, setClientPrefix] = useState("");
  const [clientFirstName, setClientFirstName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  const [streetName, setStreetName] = useState("");
  const [city, setCity] = useState("");
  const [stateField, setStateField] = useState("");
  const [zipCode, setZipCode] = useState("");

  const [billingStreetName, setBillingStreetName] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingState, setBillingState] = useState("");
  const [billingZip, setBillingZip] = useState("");
  const [sameAsBilling, setSameAsBilling] = useState(true);

  const [jobDescription, setJobDescription] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [discountType, setDiscountType] = useState("amount");
  const [discount, setDiscount] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [sendViaEmail, setSendViaEmail] = useState(true);
  const [sendViaText, setSendViaText] = useState(false);

  const [statusMessage, setStatusMessage] = useState("");
  const [aiDescLoading, setAiDescLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingStatus, setEditingStatus] = useState("");
  const [deliveryNotice, setDeliveryNotice] = useState("");

  // Per-field validation. Empty string = no error.
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Track unsaved changes for the beforeunload guard. The initial mount
  // and the editId backfill set this back to false so users only see the
  // warning after they actually edit something.
  const [isDirty, setIsDirty] = useState(false);
  const hydratingRef = useRef(false);

  // The user typed a tax rate manually — stop auto-filling from state.
  const taxRateManualRef = useRef(false);

  const basePriceNumber = useMemo(() => Math.max(0, toNumber(basePrice, 0)), [basePrice]);
  const discountNumber = useMemo(() => Math.max(0, toNumber(discount, 0)), [discount]);
  const discountAmount = useMemo(() => {
    if (discountType === "percent") {
      const percent = Math.min(100, Math.max(0, discountNumber));
      return Number(((basePriceNumber * percent) / 100).toFixed(2));
    }
    return Number(Math.min(basePriceNumber, discountNumber).toFixed(2));
  }, [basePriceNumber, discountNumber, discountType]);
  const subtotal = useMemo(
    () => Math.max(0, Number((basePriceNumber - discountAmount).toFixed(2))),
    [basePriceNumber, discountAmount],
  );
  const taxAmount = useMemo(() => {
    const rate = Math.max(0, toNumber(taxRate, 0));
    return Number(((subtotal * rate) / 100).toFixed(2));
  }, [subtotal, taxRate]);
  const estimateTotal = useMemo(() => Number((subtotal + taxAmount).toFixed(2)), [subtotal, taxAmount]);

  useEffect(() => {
    if (!editId) return;

    hydratingRef.current = true;
    apiFetch(`/api/estimates/${editId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) return;

        const e = json.data;
        setEditingStatus(e.status || "");

        const nameParts = (e.clientName || "").trim().split(/\s+/);
        setClientFirstName(nameParts[0] || "");
        setClientLastName(nameParts.slice(1).join(" ") || "");
        setClientEmail(e.clientEmail || "");
        setClientPhone(e.clientPhone || "");

        setStreetName(e.address || "");
        setJobDescription(e.notes || "");

        const inferred = inferBaseAndDiscount(e.services, e.subtotal);
        setBasePrice(String(inferred.basePrice || ""));
        setDiscountType(inferred.discountType || "amount");
        setDiscount(String(inferred.discount || ""));

        const safeSubtotal = Math.max(0, toNumber(e.subtotal, 0));
        const safeTax = Math.max(0, toNumber(e.tax, 0));
        const inferredTaxRate = safeSubtotal > 0 ? Number(((safeTax / safeSubtotal) * 100).toFixed(2)) : 0;
        setTaxRate(String(inferredTaxRate || ""));
        if (inferredTaxRate > 0) {
          // The persisted rate counts as "manually set" so we don't clobber it
          // when the state field is reapplied on autofill.
          taxRateManualRef.current = true;
        }
      })
      .catch(() => {})
      .finally(() => {
        // Reset dirty flag on the next tick once all state writes have flushed.
        setTimeout(() => {
          hydratingRef.current = false;
          setIsDirty(false);
        }, 0);
      });
  }, [editId]);

  // Auto-fill US state sales tax when the user picks a state and hasn't
  // overridden the rate manually. Reuses the existing rate table from
  // estimate-pricing instead of asking the contractor to memorize rates.
  useEffect(() => {
    if (taxRateManualRef.current) return;
    if (!stateField) return;
    const rate = getUsStateTaxRate(stateField);
    if (rate > 0) {
      setTaxRate(String(rate));
    }
  }, [stateField]);

  // Warn before unload when there are unsaved edits.
  useEffect(() => {
    if (!isDirty) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Mark form dirty whenever any user-editable field changes (skip during the
  // initial editId backfill).
  useEffect(() => {
    if (hydratingRef.current) return;
    setIsDirty(true);
  }, [
    clientPrefix,
    clientFirstName,
    clientLastName,
    clientEmail,
    clientPhone,
    streetName,
    city,
    stateField,
    zipCode,
    billingStreetName,
    billingCity,
    billingState,
    billingZip,
    sameAsBilling,
    jobDescription,
    basePrice,
    discountType,
    discount,
    taxRate,
    sendViaEmail,
    sendViaText,
  ]);

  // Compute live field errors. Surfaced visually only after the first submit
  // attempt or when the field has been touched.
  const liveErrors = useMemo(() => {
    const errors = {};
    if (!clientFirstName.trim()) errors.clientFirstName = "First name is required.";
    if (clientEmail.trim() && !isValidEmail(clientEmail)) {
      errors.clientEmail = "Enter a valid email address.";
    }
    if (!streetName.trim()) errors.streetName = "Service address is required.";
    if (basePriceNumber <= 0) errors.basePrice = "Enter a base price greater than $0.";
    if (discountType === "percent" && discountNumber > 100) {
      errors.discount = "Discount % cannot be greater than 100.";
    }
    if (discountType === "amount" && discountNumber > basePriceNumber) {
      errors.discount = "Discount cannot exceed base price.";
    }
    return errors;
  }, [
    clientFirstName,
    clientEmail,
    streetName,
    basePriceNumber,
    discountType,
    discountNumber,
  ]);

  const showError = (key) =>
    (submitAttempted || fieldErrors[key] === "touched") && liveErrors[key]
      ? liveErrors[key]
      : "";

  const touchField = (key) =>
    setFieldErrors((prev) => ({ ...prev, [key]: "touched" }));

  async function save(nextStatus) {
    setSubmitAttempted(true);
    setDeliveryNotice("");

    if (Object.keys(liveErrors).length > 0) {
      setStatusMessage("Please fix the highlighted fields before saving.");
      return;
    }

    if (nextStatus === "sent" && !sendViaEmail && !sendViaText) {
      setStatusMessage("Select at least one send channel: email or text.");
      return;
    }
    if (nextStatus === "sent" && sendViaEmail && !clientEmail.trim()) {
      setStatusMessage("Client email is required to send by email.");
      return;
    }
    if (nextStatus === "sent" && sendViaText && !clientPhone.trim()) {
      setStatusMessage("Client phone is required to send by text.");
      return;
    }

    const fullClientName = [clientPrefix, clientFirstName.trim(), clientLastName.trim()]
      .filter(Boolean)
      .join(" ");

    const fullAddress = [
      streetName.trim(),
      city.trim(),
      [stateField.trim(), zipCode.trim()].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(", ");

    const billingAddress = sameAsBilling
      ? fullAddress
      : [
          billingStreetName.trim(),
          billingCity.trim(),
          [billingState.trim(), billingZip.trim()].filter(Boolean).join(" "),
        ]
          .filter(Boolean)
          .join(", ");

    const services = [
      {
        id: "base_price",
        name: "Base Price",
        qty: 1,
        unitPrice: basePriceNumber,
        price: basePriceNumber,
      },
    ];

    if (discountAmount > 0) {
      services.push({
        id: "discount",
        name: "Discount",
        qty: 1,
        unitPrice: -discountAmount,
        price: -discountAmount,
        discountType,
        discountValue: discountNumber,
      });
    }

    const payload = {
      clientName: fullClientName,
      clientEmail: clientEmail.trim().toLowerCase(),
      clientPhone: clientPhone.trim(),
      address: fullAddress,
      billingAddress,
      services,
      subtotal,
      tax: taxAmount,
      total: estimateTotal,
      sendChannels: {
        email: sendViaEmail,
        text: sendViaText,
      },
      status: nextStatus,
      notes: jobDescription.trim(),
    };

    setSaving(true);
    try {
      const res = editId
        ? await apiFetch(`/api/estimates/${editId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch("/api/estimates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const json = await getJsonOrThrow(
        res,
        editId ? "Unable to update estimate." : "Unable to create estimate.",
      );

      // If the server tried to deliver the estimate but the email or SMS
      // failed, surface a soft warning so the contractor can resend instead
      // of silently believing the customer received it.
      const delivery = json?.data?.delivery;
      if (nextStatus === "sent" && delivery) {
        const failures = [];
        if (sendViaEmail && delivery.email && delivery.email.attempted && !delivery.email.sent) {
          failures.push(`email${delivery.email.error ? `: ${delivery.email.error}` : ""}`);
        }
        if (sendViaText && delivery.sms && delivery.sms.attempted && !delivery.sms.sent) {
          failures.push(`text${delivery.sms.error ? `: ${delivery.sms.error}` : ""}`);
        }
        if (failures.length > 0) {
          setDeliveryNotice(
            `Estimate saved, but delivery failed for: ${failures.join(", ")}. Please retry from the estimate list.`,
          );
          setIsDirty(false);
          setSaving(false);
          return;
        }
      }

      setIsDirty(false);
      router.push("/estimates");
    } catch (err) {
      setStatusMessage(err.message || "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/estimates")}
            aria-label="Back to estimates list"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-900">
              {editId ? "Edit Estimate" : "New Estimate"}
            </h1>
            {editId && editingStatus === "changes_requested" ? (
              <span className="text-xs font-semibold text-amber-600">Changes requested by client</span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => save("draft")}
            disabled={saving}
            aria-label="Save as draft"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Save Estimate
          </button>
          <button
            type="button"
            onClick={() => save("sent")}
            disabled={saving}
            aria-label={editId && editingStatus === "changes_requested" ? "Save and resend to client" : "Save and send to client"}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving ? "Saving..." : editId && editingStatus === "changes_requested" ? "Save & Resend" : "Save & Send"}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8">
        {deliveryNotice ? (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"
          >
            {deliveryNotice}
          </div>
        ) : null}
        {statusMessage ? (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700"
          >
            {statusMessage}
          </div>
        ) : null}

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Client</h2>
          <div className="flex flex-wrap gap-2">
            <select
              value={clientPrefix}
              onChange={(e) => setClientPrefix(e.target.value)}
              aria-label="Client prefix"
              className="h-12 rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-slate-500"
            >
              {CLIENT_PREFIXES.map((p) => (
                <option key={p} value={p}>{p || "-"}</option>
              ))}
            </select>
            <input
              value={clientFirstName}
              onChange={(e) => setClientFirstName(e.target.value)}
              onBlur={() => touchField("clientFirstName")}
              placeholder="First name"
              aria-label="Client first name"
              aria-invalid={showError("clientFirstName") ? "true" : "false"}
              className={`h-12 flex-1 min-w-[120px] rounded-xl border px-4 text-base outline-none focus:border-slate-500 ${showError("clientFirstName") ? "border-rose-400" : "border-slate-300"}`}
            />
            <input
              value={clientLastName}
              onChange={(e) => setClientLastName(e.target.value)}
              placeholder="Last name"
              aria-label="Client last name"
              className="h-12 flex-1 min-w-[120px] rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-slate-500"
            />
          </div>
          {showError("clientFirstName") ? (
            <p className="mt-1 text-xs font-medium text-rose-600">{showError("clientFirstName")}</p>
          ) : null}
          <input
            type="email"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            onBlur={() => touchField("clientEmail")}
            placeholder="Client email - to send the estimate link"
            aria-label="Client email"
            aria-invalid={showError("clientEmail") ? "true" : "false"}
            className={`mt-2 h-12 w-full rounded-xl border px-4 text-base outline-none focus:border-slate-500 ${showError("clientEmail") ? "border-rose-400" : "border-slate-300"}`}
          />
          {showError("clientEmail") ? (
            <p className="mt-1 text-xs font-medium text-rose-600">{showError("clientEmail")}</p>
          ) : null}
          <input
            type="tel"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            placeholder="Client phone number"
            aria-label="Client phone"
            className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-slate-500"
          />
        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Service Address</h2>
          <PlacesAutocomplete
            id="service-address"
            value={streetName}
            onChange={setStreetName}
            onSelect={(place) => {
              setStreetName(place.street || "");
              if (place.city) setCity(place.city);
              if (place.state) setStateField(place.state);
              if (place.zip) setZipCode(place.zip);
            }}
            placeholder="Start typing address..."
            inputClass={`h-12 w-full rounded-xl border px-4 text-base outline-none focus:border-slate-500 ${showError("streetName") ? "border-rose-400" : "border-slate-300"}`}
          />
          {showError("streetName") ? (
            <p className="mt-1 text-xs font-medium text-rose-600">{showError("streetName")}</p>
          ) : null}
          <div className="mt-2 grid grid-cols-[1fr_72px_90px] gap-2">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              aria-label="City"
              className="h-12 rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-slate-500"
            />
            <input
              value={stateField}
              onChange={(e) => setStateField(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="State"
              maxLength={2}
              aria-label="State (2-letter code, e.g. TX). Auto-fills sales tax."
              className="h-12 rounded-xl border border-slate-300 px-3 text-base uppercase outline-none focus:border-slate-500"
            />
            <input
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              placeholder="ZIP"
              aria-label="ZIP code"
              className="h-12 rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-slate-500"
            />
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">Billing Address</div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={sameAsBilling}
                  onChange={(e) => setSameAsBilling(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                />
                Same as service address
              </label>
            </div>
            {!sameAsBilling ? (
              <>
                <PlacesAutocomplete
                  id="billing-address"
                  value={billingStreetName}
                  onChange={setBillingStreetName}
                  onSelect={(place) => {
                    setBillingStreetName(place.street || "");
                    if (place.city) setBillingCity(place.city);
                    if (place.state) setBillingState(place.state);
                    if (place.zip) setBillingZip(place.zip);
                  }}
                  placeholder="Start typing billing address..."
                  inputClass="h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-slate-500"
                />
                <div className="mt-2 grid grid-cols-[1fr_72px_90px] gap-2">
                  <input
                    value={billingCity}
                    onChange={(e) => setBillingCity(e.target.value)}
                    placeholder="City"
                    aria-label="Billing city"
                    className="h-12 rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-slate-500"
                  />
                  <input
                    value={billingState}
                    onChange={(e) => setBillingState(e.target.value.toUpperCase().slice(0, 2))}
                    placeholder="State"
                    maxLength={2}
                    aria-label="Billing state"
                    className="h-12 rounded-xl border border-slate-300 px-3 text-base uppercase outline-none focus:border-slate-500"
                  />
                  <input
                    value={billingZip}
                    onChange={(e) => setBillingZip(e.target.value)}
                    placeholder="ZIP"
                    aria-label="Billing ZIP"
                    className="h-12 rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-slate-500"
                  />
                </div>
              </>
            ) : (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">Using service address as billing address.</p>
            )}
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Job Description <span className="normal-case font-normal text-slate-400">(optional)</span>
            </h2>
            <button
              type="button"
              disabled={aiDescLoading}
              onClick={async () => {
                const raw = jobDescription.trim();
                if (!raw) {
                  setStatusMessage("Write a few words first, then AI will polish it.");
                  return;
                }
                setAiDescLoading(true);
                try {
                  const res = await apiFetch("/api/ai/description", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ input: raw }),
                  });
                  const json = await getJsonOrThrow(res, "AI unavailable.");
                  const nextDescription = String(json?.data?.description || "").trim();
                  if (nextDescription) setJobDescription(nextDescription);
                } catch (err) {
                  setStatusMessage(err.message || "AI unavailable.");
                } finally {
                  setAiDescLoading(false);
                }
              }}
              className="flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60"
            >
              {aiDescLoading ? "Polishing..." : "Optimize with AI"}
            </button>
          </div>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Describe the work to be done - scope, materials, special instructions..."
            rows={5}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-slate-500"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Pricing</h2>

          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Send Channels</div>
            <div className="flex flex-wrap gap-4 text-sm text-slate-700">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sendViaEmail}
                  onChange={(e) => setSendViaEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                />
                Email
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sendViaText}
                  onChange={(e) => setSendViaText(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                />
                Text Message
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <label className="text-sm text-slate-700">
              Base Price
              <input
                type="number"
                min="0"
                step="0.01"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                onBlur={() => touchField("basePrice")}
                placeholder="0"
                aria-invalid={showError("basePrice") ? "true" : "false"}
                className={`mt-1 h-11 w-full rounded-lg border px-3 outline-none focus:border-slate-500 ${showError("basePrice") ? "border-rose-400" : "border-slate-300"}`}
              />
              {showError("basePrice") ? (
                <span className="mt-1 block text-xs font-medium text-rose-600">{showError("basePrice")}</span>
              ) : null}
            </label>

            <label className="text-sm text-slate-700">
              Discount Type
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value === "percent" ? "percent" : "amount")}
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 outline-none focus:border-slate-500"
              >
                <option value="amount">Fixed ($)</option>
                <option value="percent">Percent (%)</option>
              </select>
            </label>

            <label className="text-sm text-slate-700">
              Discount {discountType === "percent" ? "%" : "$"}
              <input
                type="number"
                min="0"
                max={discountType === "percent" ? "100" : undefined}
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                onBlur={() => touchField("discount")}
                placeholder="0"
                aria-invalid={showError("discount") ? "true" : "false"}
                className={`mt-1 h-11 w-full rounded-lg border px-3 outline-none focus:border-slate-500 ${showError("discount") ? "border-rose-400" : "border-slate-300"}`}
              />
              {showError("discount") ? (
                <span className="mt-1 block text-xs font-medium text-rose-600">{showError("discount")}</span>
              ) : null}
            </label>

            <label className="text-sm text-slate-700">
              Tax %
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={taxRate}
                onChange={(e) => {
                  taxRateManualRef.current = true;
                  setTaxRate(e.target.value);
                }}
                placeholder="0"
                aria-label={`Tax percent${stateField ? ` (${stateField} default ${getUsStateTaxRate(stateField)}%)` : ""}`}
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-slate-500"
              />
              {stateField && !taxRateManualRef.current ? (
                <span className="mt-1 block text-[11px] text-slate-400">Auto-filled from {stateField}</span>
              ) : null}
            </label>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Subtotal</div>
              <div className="text-lg font-bold text-slate-900">{formatMoney(subtotal)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Discount Applied</div>
              <div className="text-lg font-bold text-slate-900">-{formatMoney(discountAmount)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Tax</div>
              <div className="text-lg font-bold text-slate-900">{formatMoney(taxAmount)}</div>
            </div>
            <div className="rounded-lg bg-emerald-50 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-emerald-700">Total</div>
              <div className="text-xl font-bold text-emerald-700">{formatMoney(estimateTotal)}</div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => save("draft")}
              disabled={saving}
              className="h-12 rounded-xl border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Save Estimate
            </button>
            <button
              type="button"
              onClick={() => save("sent")}
              disabled={saving}
              className="h-12 rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {saving ? "Saving..." : editId && editingStatus === "changes_requested" ? "Save & Resend" : "Save & Send"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/estimates")}
              className="h-12 rounded-xl border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
