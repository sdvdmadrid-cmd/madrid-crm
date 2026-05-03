"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  formatLocalDate,
  isPastYmd,
  isValidYmd,
  todayLocalYmd,
} from "@/lib/local-date";
import "@/i18n";

const HIGH_WIND_MPH = 25;

const ALERT_STYLES = {
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  danger:  "bg-red-50  border-red-200  text-red-800",
  mist:    "bg-slate-50 border-slate-200 text-slate-700",
  good:    "bg-green-50 border-green-200 text-green-800",
};

function resolveWeatherAlert(weather) {
  if (!weather) return null;
  const { variant, windSpeed = 0 } = weather;
  if (variant === "storm")
    return { key: "alertStorm", style: ALERT_STYLES.danger };
  if (variant === "rain" && windSpeed >= HIGH_WIND_MPH)
    return { key: "alertHighWind", style: ALERT_STYLES.warning };
  if (variant === "rain")
    return { key: "alertRain", style: ALERT_STYLES.warning };
  if (variant === "snow")
    return { key: "alertSnow", style: ALERT_STYLES.warning };
  if (variant === "mist")
    return { key: "alertMist", style: ALERT_STYLES.mist };
  if (windSpeed >= HIGH_WIND_MPH)
    return { key: "alertHighWind", style: ALERT_STYLES.warning };
  if (variant === "clear")
    return { key: "alertClear", style: ALERT_STYLES.good };
  return null;
}

function WeatherPanel({ weather, t }) {
  if (!weather) return null;
  const alert = resolveWeatherAlert(weather);

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-3">
      <p className="text-[11px] uppercase tracking-widest text-blue-500 font-semibold">
        {t("calendar.weather.sectionTitle")}
      </p>

      {/* Main condition row */}
      <div className="flex items-center gap-3">
        <span className="text-3xl leading-none" aria-hidden="true">
          {weather.emoji}
        </span>
        <div>
          <p className="text-xl font-bold text-gray-900">{weather.temp}°F</p>
          <p className="text-sm text-gray-600 capitalize">
            {weather.description || weather.condition}
          </p>
        </div>
      </div>

      {/* Detail chips */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-600">
        <span>🌡️ {t("calendar.weather.feelsLike", { temp: weather.feelsLike })}</span>
        <span>💧 {t("calendar.weather.humidity", { pct: weather.humidity })}</span>
        {weather.windSpeed > 0 && (
          <span>💨 {t("calendar.weather.wind", { speed: weather.windSpeed })}</span>
        )}
      </div>

      {/* Alert / recommendation */}
      {alert && (
        <div
          className={`rounded-md border px-3 py-2 text-xs font-medium leading-snug ${alert.style}`}
        >
          {t(`calendar.weather.${alert.key}`)}
        </div>
      )}
    </div>
  );
}

const buildEmptyForm = (initialDate) => ({
  title: "",
  clientName: "",
  date: initialDate ? formatLocalDate(initialDate) : "",
  time: "",
  location: "",
  notes: "",
  status: "Scheduled",
});

const buildEmptyAddress = () => ({
  street: "",
  city: "",
  state: "",
  zip: "",
});

const parseLocationToAddress = (location) => {
  const raw = String(location || "").trim();
  if (!raw) return buildEmptyAddress();
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  const address = buildEmptyAddress();
  address.street = parts[0] || "";
  address.city = parts[1] || "";
  const stateZip = parts[2] || "";
  const match = stateZip.match(/^([A-Za-z]{2})(?:\s+([A-Za-z0-9-]{3,10}))?$/);
  if (match) {
    address.state = match[1] || "";
    address.zip = match[2] || "";
  } else {
    address.state = stateZip;
  }
  return address;
};

const buildLocationFromAddress = (address) => {
  const stateZip = [address.state, address.zip].filter(Boolean).join(" ");
  return [address.street, address.city, stateZip].filter(Boolean).join(", ");
};

const normalizeAppointmentToForm = (appointment, initialDate) => ({
  title: appointment?.title || "",
  clientName: appointment?.clientName || appointment?.client || "",
  date: appointment?.date || (initialDate ? formatLocalDate(initialDate) : ""),
  time: appointment?.time || "",
  location: appointment?.location || "",
  notes: appointment?.notes || "",
  status: appointment?.status || "Scheduled",
});

export default function AppointmentModal({
  isOpen,
  onClose,
  onSave,
  initialDate,
  existingAppointment,
  isSaving,
  onDelete,
  weather,
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(buildEmptyForm(initialDate));
  const [address, setAddress] = useState(buildEmptyAddress());
  const [isEditMode, setIsEditMode] = useState(!existingAppointment);

  const [errors, setErrors] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const minDate = todayLocalYmd();

  useEffect(() => {
    if (!isOpen) return;
    if (existingAppointment) {
      const nextForm = normalizeAppointmentToForm(existingAppointment, initialDate);
      setForm(nextForm);
      setAddress(parseLocationToAddress(nextForm.location));
      setIsEditMode(false);
    } else {
      setForm(buildEmptyForm(initialDate));
      setAddress(buildEmptyAddress());
      setIsEditMode(true);
    }
    setErrors({});
  }, [isOpen, existingAppointment, initialDate]);

  const validateForm = () => {
    const newErrors = {};
    if (!form.title.trim()) newErrors.title = t("calendar.errors.required");
    if (!form.clientName.trim()) newErrors.clientName = t("calendar.errors.required");
    if (!form.date) {
      newErrors.date = t("calendar.errors.required");
    } else if (!isValidYmd(form.date)) {
      newErrors.date = t("calendar.errors.invalidDate");
    } else if (isPastYmd(form.date, minDate)) {
      newErrors.date = t("calendar.errors.pastDate");
    }
    if (!form.time) newErrors.time = t("calendar.errors.required");
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    await onSave({
      ...form,
      location: buildLocationFromAddress(address),
    });
    if (!existingAppointment) {
      setForm(buildEmptyForm(initialDate));
      setAddress(buildEmptyAddress());
    }
    setErrors({});
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    if (onDelete) {
      await onDelete();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Main Modal */}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">
              {existingAppointment
                ? t("calendar.modal.editAppointment")
                : t("calendar.modal.newAppointment")}
            </h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <span className="text-2xl">✕</span>
            </button>
          </div>

          {/* Details mode for existing appointment */}
          {existingAppointment && !isEditMode ? (
            <div className="p-6 space-y-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">{t("calendar.labels.title")}</p>
                  <p className="text-sm font-semibold text-gray-900">{form.title || "-"}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">{t("calendar.labels.clientName")}</p>
                    <p className="text-sm text-gray-800">{form.clientName || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">{t("calendar.labels.status")}</p>
                    <p className="text-sm text-gray-800">{form.status || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">{t("calendar.labels.date")}</p>
                    <p className="text-sm text-gray-800">{form.date || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">{t("calendar.labels.time")}</p>
                    <p className="text-sm text-gray-800">{form.time || "-"}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">{t("calendar.labels.location")}</p>
                  <p className="text-sm text-gray-800">{form.location || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">{t("calendar.labels.notes")}</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{form.notes || "-"}</p>
                </div>
              </div>

              {/* Weather forecast */}
              <WeatherPanel weather={weather} t={t} />

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditMode(true)}
                  className="px-4 py-2 border border-blue-300 rounded-lg text-blue-700 hover:bg-blue-50 transition-colors font-medium"
                >
                  {t("calendar.buttons.reschedule")}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditMode(true)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                >
                  {t("calendar.buttons.edit")}
                </button>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                >
                  {t("calendar.buttons.cancel")}
                </button>
                {onDelete && (
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? "Deleting..." : t("calendar.buttons.delete")}
                  </button>
                )}
              </div>
            </div>
          ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("calendar.labels.title")}
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={t("calendar.placeholders.title")}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.title ? "border-red-500" : "border-gray-300"
                }`}
              />
              {errors.title && (
                <p className="text-red-600 text-xs mt-1">
                  {errors.title}
                </p>
              )}
            </div>

            {/* Client Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("calendar.labels.clientName")}
              </label>
              <input
                type="text"
                value={form.clientName}
                onChange={(e) =>
                  setForm({ ...form, clientName: e.target.value })
                }
                placeholder={t("calendar.placeholders.clientName")}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.clientName ? "border-red-500" : "border-gray-300"
                }`}
              />
              {errors.clientName && (
                <p className="text-red-600 text-xs mt-1">
                  {errors.clientName}
                </p>
              )}
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("calendar.labels.date")}
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                min={minDate}
                data-testid="appointment-date-input"
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.date ? "border-red-500" : "border-gray-300"
                }`}
              />
              {errors.date && (
                <p className="text-red-600 text-xs mt-1">
                  {errors.date}
                </p>
              )}
            </div>

            {/* Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("calendar.labels.time")}
              </label>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.time ? "border-red-500" : "border-gray-300"
                }`}
              />
              {errors.time && (
                <p className="text-red-600 text-xs mt-1">
                  {errors.time}
                </p>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("calendar.labels.status")}
              </label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Scheduled">
                  {t("calendar.statusOptions.Scheduled")}
                </option>
                <option value="Completed">
                  {t("calendar.statusOptions.Completed")}
                </option>
                <option value="Cancelled">
                  {t("calendar.statusOptions.Cancelled")}
                </option>
              </select>
            </div>

            {/* Location */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("calendar.labels.addressStreet")}
                </label>
                <input
                  type="text"
                  value={address.street}
                  onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  placeholder={t("calendar.placeholders.addressStreet")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("calendar.labels.city")}
                  </label>
                  <input
                    type="text"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    placeholder={t("calendar.placeholders.city")}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("calendar.labels.state")}
                  </label>
                  <input
                    type="text"
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    placeholder={t("calendar.placeholders.state")}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("calendar.labels.zip")}
                </label>
                <input
                  type="text"
                  value={address.zip}
                  onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                  placeholder={t("calendar.placeholders.zip")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              <p className="text-xs text-gray-500">
                {t("calendar.weather.locationHint")}
              </p>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("calendar.labels.notes")}
              </label>
              <textarea
                value={form.notes || ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={t("calendar.placeholders.notes")}
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
              >
                {t("calendar.buttons.cancel")}
              </button>
              {existingAppointment && onDelete && (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  disabled={isSaving}
                  className="px-4 py-2 border border-red-300 rounded-lg text-red-700 hover:bg-red-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("calendar.buttons.delete")}
                </button>
              )}
              <button
                type="submit"
                disabled={isSaving}
                data-testid="appointment-save-button"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving
                  ? "Saving..."
                  : existingAppointment
                    ? t("calendar.buttons.update")
                    : t("calendar.buttons.save")}
              </button>
            </div>
          </form>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {t("calendar.modal.confirmDelete")}
              </h3>
              <p className="text-gray-600 mb-6">
                {t("calendar.modal.confirmDeleteMessage")}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                >
                  {t("calendar.buttons.cancel")}
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? "Deleting..." : t("calendar.buttons.delete")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
