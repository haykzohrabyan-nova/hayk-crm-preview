import { redirect } from "next/navigation";

/** Admin-only app settings — personal account lives at /profile for all roles. */
export default function SettingsPage() {
  redirect("/admin/settings/users");
}
