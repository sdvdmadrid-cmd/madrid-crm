"use client";

import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n";
import CalendarHeader from "./CalendarHeader";
import DayCell from "./DayCell";
import AppointmentModal from "./AppointmentModal";
import { useAppointments } from "@/hooks/useAppointments";
import { useWeather } from "@/hooks/useWeather";

export default function Calendar() {
  const { t } = useTranslation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const {
    appointments,
    loading,
    error: appointmentError,
    create,
    update,
    remove,
  } = useAppointments();

  const [defaultWeatherLocation, setDefaultWeatherLocation] = useState("");

  useEffect(() => {
    import("@/lib/client-auth").then(({ apiFetch }) => {
      apiFetch("/api/company-profile")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          const addr = data?.businessAddress || "";
          if (addr) setDefaultWeatherLocation(addr);
        })
        .catch(() => {});
    });
  }, []);

  // Get user's timezone for better date handling
  const getUserTimezone = () => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  };

  const userTimezone = getUserTimezone();

  // Generate calendar grid
  const { daysInMonth, firstDayOfMonth, daysOfWeek } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();

    return {
      daysInMonth: lastDay,
      firstDayOfMonth: firstDay,
      daysOfWeek: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    };
  }, [currentDate]);

  const calendarDays = useMemo(() => {
    const days = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Previous month days (grayed out)
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthLastDay - i);
      days.push({
        date,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      days.push({
        date,
        isCurrentMonth: true,
      });
    }

    // Next month days (grayed out)
    const remainingDays = 42 - days.length; // 6 rows × 7 days
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, month + 1, i);
      days.push({
        date,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentDate, daysInMonth, firstDayOfMonth]);

  const { getWeather, getDayWeather } = useWeather(appointments, {
    calendarDays,
    defaultLocation: defaultWeatherLocation,
  });

  const isToday = (date) => {
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  const handlePrevMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)
    );
  };

  const handleNextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)
    );
  };

  const handleDayClick = (date) => {
    setSelectedDate(date);
    setEditingAppointment(null);
    setIsModalOpen(true);
  };

  const handleEventClick = (appointment) => {
    setSelectedDate(new Date(appointment.date));
    setEditingAppointment(appointment);
    setIsModalOpen(true);
  };

  const handleSaveAppointment = async (formData) => {
    setIsSaving(true);
    try {
      if (editingAppointment) {
        await update(editingAppointment._id, formData);
      } else {
        await create(formData);
      }
      setIsModalOpen(false);
      setEditingAppointment(null);
      setSelectedDate(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAppointment = async () => {
    if (!editingAppointment) return;

    setIsSaving(true);
    try {
      await remove(editingAppointment._id);
      setIsModalOpen(false);
      setEditingAppointment(null);
      setSelectedDate(null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-100/70">
      {/* Header */}
      <CalendarHeader
        currentDate={currentDate}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onTodayClick={() => setCurrentDate(new Date())}
      />

      {/* Error state */}
      {appointmentError && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-200">
          <p className="text-sm text-red-700">{appointmentError}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">{t("calendar.loading")}</p>
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      {!loading && (
        <div className="flex-1 overflow-auto">
          <div className="p-3 sm:p-5 md:p-8">
            {/* Day of week headers */}
            <div className="overflow-x-auto pb-1">
              <div className="min-w-[820px]">
                <div className="grid grid-cols-7 gap-2 sm:gap-3 mb-3 px-1">
              {daysOfWeek.map((day, i) => (
                <div
                  key={day}
                  className={`text-center text-[10px] sm:text-[11px] font-semibold py-1.5 sm:py-2 uppercase tracking-[0.08em] ${
                    i === 0 || i === 6 ? "text-rose-500" : "text-slate-500"
                  }`}
                >
                  {day}
                </div>
              ))}
                </div>

            {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-2 sm:gap-3 bg-transparent">
              {calendarDays.map((dayObj, index) => (
                <DayCell
                  key={index}
                  day={dayObj.date.getDate()}
                  date={dayObj.date}
                  isCurrentMonth={dayObj.isCurrentMonth}
                  isToday={isToday(dayObj.date)}
                  appointments={appointments}
                  onClick={handleDayClick}
                  onEventClick={handleEventClick}
                  getWeather={getWeather}
                  getDayWeather={getDayWeather}
                />
              ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      <AppointmentModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingAppointment(null);
        }}
        onSave={handleSaveAppointment}
        initialDate={selectedDate}
        existingAppointment={editingAppointment}
        isSaving={isSaving}
        onDelete={editingAppointment ? handleDeleteAppointment : null}
      />
    </div>
  );
}
