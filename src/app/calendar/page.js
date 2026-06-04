"use client";

import dynamic from "next/dynamic";

const Calendar = dynamic(() => import("@/components/calendar/Calendar"), {
  ssr: false,
  loading: () => (
    <main style={{ padding: 24, opacity: 0.85 }} aria-busy="true">
      Loading calendar…
    </main>
  ),
});

export default function CalendarPage() {
  return <Calendar />;
}
