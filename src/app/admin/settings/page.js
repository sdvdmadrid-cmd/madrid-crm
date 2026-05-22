import { redirect } from "next/navigation";

/** @deprecated Use /owner/settings */
export default function AdminSettingsRedirectPage() {
  redirect("/owner/settings");
}
