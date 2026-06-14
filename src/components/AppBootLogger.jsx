"use client";

import { useEffect } from "react";

/** Root-level boot marker — first client log in the render tree. */
export default function AppBootLogger() {
  useEffect(() => {
    console.log("APP STARTED (root layout)");
  }, []);
  return null;
}
