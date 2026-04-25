"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n";

const UNIT_OPTIONS = ["sqft", "yd", "flat", "per_item"];

const createBlankItem = () => ({
  id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  name: "",
  qty: "",
  rate: "",
  unit: "per_item",
});

const parseNum = (value) => {
  const n = Number.parseFloat(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export default function SmartEstimatorPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [rows, setRows] = useState([createBlankItem()]);

  const total = useMemo(
    () =>
      rows.reduce(
        (sum, row) => sum + parseNum(row.qty) * parseNum(row.rate),
        0,
      ),
    [rows],
  );

  const updateRow = (id, field, value) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  const addItem = () => {
    setRows((current) => [...current, createBlankItem()]);
  };

  const removeItem = (id) => {
    setRows((current) => current.filter((row) => row.id !== id));
  };

  const reset = () => setRows([createBlankItem()]);

  const goBackToEstimate = () => {
    if (typeof window === "undefined") return;

    try {
      if (window.opener && !window.opener.closed) {
        window.opener.focus();
        window.close();
        return;
      }
    } catch {
      // Ignore cross-window access issues and use standard fallback below.
    }

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    router.push("/estimates");
  };

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <h1 style={{ margin: 0 }}>{t("smartEstimator.title")}</h1>
      <p style={{ color: "#555" }}>{t("smartEstimator.description")}</p>
      <button
        type="button"
        onClick={goBackToEstimate}
        style={{
          marginTop: 4,
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #ccc",
          background: "white",
          cursor: "pointer",
        }}
      >
        {t("smartEstimator.backToEstimate")}
      </button>

      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table
          style={{ width: "100%", minWidth: 620, borderCollapse: "collapse" }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 8 }}>
                {t("smartEstimator.columns.item")}
              </th>
              <th style={{ textAlign: "left", padding: 8 }}>
                {t("smartEstimator.columns.quantity")}
              </th>
              <th style={{ textAlign: "left", padding: 8 }}>
                {t("smartEstimator.columns.rate")}
              </th>
              <th style={{ textAlign: "right", padding: 8 }}>
                {t("smartEstimator.columns.total")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowTotal = parseNum(row.qty) * parseNum(row.rate);
              return (
                <tr key={row.id}>
                  <td style={{ padding: 8 }}>
                    <input
                      value={row.name || ""}
                      onChange={(e) =>
                        updateRow(row.id, "name", e.target.value)
                      }
                      placeholder={t("smartEstimator.itemPlaceholder")}
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid #ccc",
                      }}
                    />
                  </td>
                  <td style={{ padding: 8 }}>
                    <input
                      value={row.qty}
                      onChange={(e) => updateRow(row.id, "qty", e.target.value)}
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid #ccc",
                      }}
                    />
                    <select
                      value={row.unit}
                      onChange={(e) =>
                        updateRow(row.id, "unit", e.target.value)
                      }
                      style={{
                        width: "100%",
                        marginTop: 6,
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid #ccc",
                      }}
                    >
                      {UNIT_OPTIONS.map((unit) => (
                        <option key={`${row.id}-${unit}`} value={unit}>
                          {t(`smartEstimator.units.${unit}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: 8 }}>
                    <input
                      value={row.rate}
                      onChange={(e) =>
                        updateRow(row.id, "rate", e.target.value)
                      }
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid #ccc",
                      }}
                    />
                  </td>
                  <td style={{ padding: 8, textAlign: "right" }}>
                    ${rowTotal.toFixed(2)}
                    <button
                      type="button"
                      onClick={() => removeItem(row.id)}
                      style={{
                        marginLeft: 8,
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid #ccc",
                        background: "white",
                        cursor: "pointer",
                      }}
                    >
                      {t("smartEstimator.removeItem")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <strong>
          {t("smartEstimator.estimatedTotal")}: ${total.toFixed(2)}
        </strong>
        <button
          type="button"
          onClick={addItem}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "white",
            cursor: "pointer",
          }}
        >
          {t("smartEstimator.addItem")}
        </button>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "white",
            cursor: "pointer",
          }}
        >
          {t("smartEstimator.clear")}
        </button>
      </div>
    </main>
  );
}
