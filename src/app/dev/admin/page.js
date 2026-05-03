import { redirect } from "next/navigation";

export default function DevAdminRedirect() {
  redirect("/admin");
}
