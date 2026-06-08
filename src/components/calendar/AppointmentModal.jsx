"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import PlacesAutocomplete from "@/components/PlacesAutocomplete";
import {
  buildEmptyAppointmentAddress,
  buildLocationFromAddressParts,
  getAppointmentAddressValidationError,
  parseLocationToAddressParts,
} from "@/lib/appointment-address";
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

  // Animación SVG para el ícono del clima
  const AnimatedWeatherIcon = () => (
    <span
      className="text-3xl leading-none animate-weather-bounce drop-shadow-md transition-transform duration-700"
      aria-hidden="true"
      style={{ display: 'inline-block' }}
    >
      {weather.emoji}
    </span>
  );

  return (
    <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 via-white to-blue-100 p-5 space-y-4 shadow-xl transition-all duration-500 animate-fade-in">
      <p className="text-[12px] uppercase tracking-widest text-blue-600 font-extrabold mb-1 animate-fade-in">
        {t("calendar.weather.sectionTitle")}
      </p>

      {/* Main condition row con animación */}
      <div className="flex items-center gap-4">
        <AnimatedWeatherIcon />
        <div className="transition-all duration-500">
          <p className="text-2xl font-extrabold text-blue-900 animate-fade-in-slow">{weather.temp}°F</p>
          <p className="text-sm text-blue-700 capitalize animate-fade-in-slow">
            {weather.description || weather.condition}
          </p>
        </div>
      </div>

      {/* Detail chips con animación */}
      <div className="flex flex-wrap gap-3 text-xs text-blue-700 animate-fade-in">
        <span className="bg-blue-100 rounded px-2 py-1 shadow-sm">🌡️ {t("calendar.weather.feelsLike", { temp: weather.feelsLike })}</span>
        <span className="bg-blue-100 rounded px-2 py-1 shadow-sm">💧 {t("calendar.weather.humidity", { pct: weather.humidity })}</span>
        {weather.windSpeed > 0 && (
          <span className="bg-blue-100 rounded px-2 py-1 shadow-sm">💨 {t("calendar.weather.wind", { speed: weather.windSpeed })}</span>
        )}
      </div>

      {/* Alert / recommendation con animación */}
      {alert && (
        <div
          className={`rounded-md border px-3 py-2 text-xs font-semibold leading-snug ${alert.style} animate-alert-pop`}
        >
          {t(`calendar.weather.${alert.key}`)}
        </div>
      )}
    </div>
  );
// Animaciones CSS para weather panel
// Puedes mover esto a un archivo CSS global si prefieres
const style = document.createElement('style');
style.innerHTML = `
@keyframes weather-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px) scale(1.08); }
}
.animate-weather-bounce { animation: weather-bounce 1.6s infinite cubic-bezier(.68,-0.55,.27,1.55); }
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.animate-fade-in { animation: fade-in 1s ease-in; }
.animate-fade-in-slow { animation: fade-in 1.8s ease-in; }
@keyframes alert-pop {
  0% { transform: scale(0.8); opacity: 0; }
  60% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
.animate-alert-pop { animation: alert-pop 0.7s cubic-bezier(.68,-0.55,.27,1.55); }
`;
if (typeof window !== 'undefined' && !window.__weather_anim_injected) {
  document.head.appendChild(style);
  window.__weather_anim_injected = true;
}
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
  const [address, setAddress] = useState(buildEmptyAppointmentAddress());
  const [isEditMode, setIsEditMode] = useState(!existingAppointment);

  const [errors, setErrors] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const minDate = todayLocalYmd();

  useEffect(() => {
    if (!isOpen) return;
    if (existingAppointment) {
      const nextForm = normalizeAppointmentToForm(existingAppointment, initialDate);
      setForm(nextForm);
      const parsed = parseLocationToAddressParts(nextForm.location);
      const hasGeo =
        typeof existingAppointment?.latitude === "number" &&
        typeof existingAppointment?.longitude === "number";
      setAddress({
        ...parsed,
        latitude: hasGeo ? existingAppointment.latitude : null,
        longitude: hasGeo ? existingAppointment.longitude : null,
        placeId: existingAppointment?.addressPlaceId || "",
        verified: Boolean(hasGeo && existingAppointment?.addressPlaceId),
      });
      setIsEditMode(false);
    } else {
      setForm(buildEmptyForm(initialDate));
      setAddress(buildEmptyAppointmentAddress());
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

    const addressError = getAppointmentAddressValidationError(address, t);
    if (addressError) newErrors.addressStreet = addressError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const clearAddressVerification = (patch) =>
    setAddress((current) => ({
      ...current,
      ...patch,
      placeId: "",
      latitude: null,
      longitude: null,
      verified: false,
    }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    const formatted =
      address.formattedAddress || buildLocationFromAddressParts(address);
    await onSave({
      ...form,
      location: formatted,
      latitude: address.latitude,
      longitude: address.longitude,
      addressPlaceId: address.placeId,
    });
    if (!existingAppointment) {
      setForm(buildEmptyForm(initialDate));
      setAddress(buildEmptyAppointmentAddress());
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
                  data-testid="appointment-edit-button"
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
                data-testid="appointment-title-input"
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
                <PlacesAutocomplete
                  id="appointment-address-street"
                  value={address.street}
                  selectedValueKey="street"
                  onChange={(value) =>
                    clearAddressVerification({ street: value, formattedAddress: "" })
                  }
                  onSelect={({
                    street,
                    city,
                    state,
                    zip,
                    formattedAddress,
                    latitude,
                    longitude,
                    placeId,
                  }) => {
                    setAddress({
                      street: street || "",
                      city: city || "",
                      state: state || "",
                      zip: zip || "",
                      formattedAddress: formattedAddress || "",
                      latitude:
                        typeof latitude === "number" ? latitude : null,
                      longitude:
                        typeof longitude === "number" ? longitude : null,
                      placeId: placeId || "",
                      verified: Boolean(placeId),
                    });
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.addressStreet;
                      return next;
                    });
                  }}
                  placeholder={t("calendar.placeholders.addressStreet")}
                  inputClass={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                    errors.addressStreet ? "border-red-500" : "border-gray-300"
                  }`}
                  disabled={isSaving}
                />
                {errors.addressStreet ? (
                  <p className="text-red-600 text-xs mt-1">{errors.addressStreet}</p>
                ) : null}
                <p className="text-xs text-gray-500 mt-1">
                  {t("calendar.address.autocompleteHint")}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("calendar.labels.city")}
                  </label>
                  <input
                    type="text"
                    value={address.city}
                    onChange={(e) => clearAddressVerification({ city: e.target.value })}
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
                    onChange={(e) => clearAddressVerification({ state: e.target.value })}
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
                  onChange={(e) => clearAddressVerification({ zip: e.target.value })}
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
