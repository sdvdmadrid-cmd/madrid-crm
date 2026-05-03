"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PlacesAutocomplete from "@/components/PlacesAutocomplete";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

const CLIENT_PREFIXES = ["", "Mr.", "Mrs.", "Ms.", "Dr."];

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

    apiFetch(`/api/estimates/${editId}/public`)
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
      })
      .catch(() => {});
  }, [editId]);

  async function save(nextStatus) {
    if (!clientFirstName.trim() || !streetName.trim() || basePriceNumber <= 0) {
      setStatusMessage("Fill in client name, service address, and a base price greater than 0.");
      return;
    }

    if (discountType === "percent" && discountNumber > 100) {
      setStatusMessage("Discount percent cannot be greater than 100.");
      return;
    }

    if (discountType === "amount" && discountNumber > basePriceNumber) {
      setStatusMessage("Discount cannot be greater than base price.");
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
      if (editId) {
        const res = await apiFetch(`/api/estimates/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await getJsonOrThrow(res, "Unable to update estimate.");
      } else {
        const res = await apiFetch("/api/estimates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await getJsonOrThrow(res, "Unable to create estimate.");
      }
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
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Save Estimate
          </button>
          <button
            type="button"
            onClick={() => save("sent")}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving ? "Saving..." : editId && editingStatus === "changes_requested" ? "Save & Resend" : "Save & Send"}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8">
        {statusMessage ? (
          <div className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
            {statusMessage}
          </div>
        ) : null}

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Client</h2>
          <div className="flex flex-wrap gap-2">
            <select
              value={clientPrefix}
              onChange={(e) => setClientPrefix(e.target.value)}
              className="h-12 rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-slate-500"
            >
              {CLIENT_PREFIXES.map((p) => (
                <option key={p} value={p}>{p || "-"}</option>
              ))}
            </select>
            <input
              value={clientFirstName}
              onChange={(e) => setClientFirstName(e.target.value)}
              placeholder="First name"
              className="h-12 flex-1 min-w-[120px] rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-slate-500"
            />
            <input
              value={clientLastName}
              onChange={(e) => setClientLastName(e.target.value)}
              placeholder="Last name"
              className="h-12 flex-1 min-w-[120px] rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-slate-500"
            />
          </div>
          <input
            type="email"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            placeholder="Client email - to send the estimate link"
            className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-slate-500"
          />
          <input
            type="tel"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            placeholder="Client phone number"
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
            inputClass="h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-slate-500"
          />
          <div className="mt-2 grid grid-cols-[1fr_72px_90px] gap-2">
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="h-12 rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-slate-500" />
            <input value={stateField} onChange={(e) => setStateField(e.target.value)} placeholder="State" className="h-12 rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-slate-500" />
            <input value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="ZIP" className="h-12 rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-slate-500" />
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
                  <input value={billingCity} onChange={(e) => setBillingCity(e.target.value)} placeholder="City" className="h-12 rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-slate-500" />
                  <input value={billingState} onChange={(e) => setBillingState(e.target.value)} placeholder="State" className="h-12 rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-slate-500" />
                  <input value={billingZip} onChange={(e) => setBillingZip(e.target.value)} placeholder="ZIP" className="h-12 rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-slate-500" />
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
                  if (json?.data) setJobDescription(json.data);
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
                placeholder="0"
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-slate-500"
              />
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
                placeholder="0"
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-slate-500"
              />
            </label>

            <label className="text-sm text-slate-700">
              Tax %
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                placeholder="0"
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-slate-500"
              />
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
