import { redirect } from "next/navigation";

/** Legacy route — activity log moved to /activity-log; /notifications reserved for future bell. */
export default function NotificationsLegacyRedirect() {
  redirect("/activity-log");
}
