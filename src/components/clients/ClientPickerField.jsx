"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ClientSearchAutocomplete from "@/components/clients/ClientSearchAutocomplete";
import {
  formatClientPickerLabel,
  formatClientSearchOption,
} from "@/lib/client-search";
import pickerCss from "./client-picker.module.css";

/**
 * Client search for new estimate / new invoice forms.
 * Typing name or phone shows existing clients; picking one sets clientId.
 */
export default function ClientPickerField({
  clientId = "",
  displayValue = "",
  onChange,
  placeholder,
  label,
  htmlFor,
  disabled = false,
  showHint = false,
  variant = "light",
  className = "",
  children = null,
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(displayValue);

  useEffect(() => {
    setText(displayValue);
  }, [displayValue]);

  const emitChange = useCallback(
    (next) => {
      onChange?.(next);
    },
    [onChange],
  );

  const handleSelect = useCallback(
    (client) => {
      const id = String(client?.id || client?._id || "").trim();
      const labelText = formatClientPickerLabel(client);
      setText(labelText);
      emitChange({
        clientId: id,
        client,
        displayValue: labelText,
        clientName: String(client?.name || "").trim(),
      });
    },
    [emitChange],
  );

  const handleValueChange = useCallback(
    (value) => {
      setText(value);
      emitChange({
        clientId: "",
        client: null,
        displayValue: value,
        clientName: value,
      });
    },
    [emitChange],
  );

  const handleClear = useCallback(() => {
    setText("");
    emitChange({
      clientId: "",
      client: null,
      displayValue: "",
      clientName: "",
    });
  }, [emitChange]);

  const linked = Boolean(clientId);

  return (
    <div className={`${pickerCss.field} ${className}`.trim()}>
      {label ? (
        <label htmlFor={htmlFor} className={pickerCss.label}>
          {label}
        </label>
      ) : null}
      <div className={pickerCss.row}>
        <ClientSearchAutocomplete
          value={text}
          onValueChange={handleValueChange}
          onSelect={handleSelect}
          onClear={handleClear}
          clearOnSelect={false}
          variant={variant}
          showHint={showHint}
          disabled={disabled}
          placeholder={
            placeholder || t("clients.search.placeholderForm", { defaultValue: t("clients.search.placeholder") })
          }
          className={pickerCss.search}
        />
        {children}
      </div>
      {linked ? (
        <p className={pickerCss.linked} role="status">
          {t("clients.search.linkedClient", { defaultValue: "Linked to saved client" })}
        </p>
      ) : null}
    </div>
  );
}

export { formatClientPickerLabel, formatClientSearchOption };
