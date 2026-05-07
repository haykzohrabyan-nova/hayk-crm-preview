import { Bell } from "lucide-react";
import {
  SpecPreviewPage,
  SpecSection,
  SpecCard,
  SpecNote,
} from "@/components/ui/spec-preview";

export default function NotificationsPage() {
  return (
    <SpecPreviewPage
      icon={Bell}
      title="Notifications"
      subtitle="Real-time in-app alerts for lead routing, follow-ups, hold expiry, and system broadcasts."
    >
      {/* Overview */}
      <SpecSection title="What this will do">
        <SpecNote>
          Notifications alert each user to events that need their attention — a lead routed to Sales,
          a follow-up due today, a hold period that expired. They appear as a bell icon in the sidebar
          with an unread count, and open a dropdown feed. This page shows the full notification history.
        </SpecNote>
      </SpecSection>

      {/* Sidebar bell */}
      <SpecSection title="Sidebar bell (always visible)">
        <SpecCard
          items={[
            { label: "Position", value: "Bottom cluster of the sidebar, above Settings" },
            { label: "Unread badge", value: "Red pill with count, capped at 99+" },
            { label: "Click", value: "Opens a popover/dropdown anchored to the bell icon" },
            { label: "Real-time", value: "Unread count updates live via Supabase Realtime — no polling needed. Requires Realtime enabled on the notifications table in Supabase dashboard." },
          ]}
        />
      </SpecSection>

      {/* Feed */}
      <SpecSection title="Notification feed (popover)">
        <SpecCard
          title="Each row shows"
          items={[
            { label: "Icon", value: "Based on notification.type" },
            { label: "Title", value: "notification.title" },
            { label: "Body", value: "notification.body — truncated at 2 lines" },
            { label: "Time", value: 'Relative time — e.g. "5 minutes ago"' },
            { label: "Unread indicator", value: "Subtle colored left border on unread rows" },
          ]}
        />
        <SpecCard
          title="Interactions"
          items={[
            { label: "Click row", value: "Marks as read (PATCH /api/notifications/[id]/read) + navigates to relevant page via notification.payload.href" },
            { label: "Mark all read", value: "POST /api/notifications/read-all — button visible only when unread notifications exist" },
            { label: "Load more", value: "Initial load: 20 most recent. 'Load more' fetches next 20 (offset pagination)" },
            { label: "Never deleted", value: "Notifications are only marked read, never removed from feed" },
          ]}
        />
      </SpecSection>

      {/* Notification types */}
      <SpecSection title="Notification types">
        <SpecCard
          title="lead_routed — immediate"
          items={[
            { label: "Trigger", value: "SDR routes a lead to Sales" },
            { label: "Recipients", value: "All active Sales users" },
            { label: "Title", value: '"New lead routed to Sales"' },
            { label: "Body", value: '"[First Last] from [Company] — [Channel], $[quote_total]"' },
            { label: "Link", value: "/sales" },
          ]}
        />
        <SpecCard
          title="lead_held_reminder — lazy check"
          items={[
            { label: "Trigger", value: "leads.hold_until <= now() and lead is still On Hold" },
            { label: "Recipients", value: "leads.sdr_id (SDR) or leads.sales_owner_id (Sales)" },
            { label: "Title", value: '"Hold period ended"' },
            { label: "Body", value: '"[Contact name] — hold has expired"' },
            { label: "Link", value: "/leads or /sales" },
          ]}
        />
        <SpecCard
          title="follow_up_due — lazy check"
          items={[
            { label: "Trigger", value: "job_tickets.follow_up_at <= now() and follow_up_completed = false" },
            { label: "Recipients", value: "job_tickets.created_by_id" },
            { label: "Title", value: '"Follow-up due"' },
            { label: "Body", value: '"[Contact name] — Quote #[id]"' },
            { label: "Link", value: "/tickets" },
          ]}
        />
        <SpecCard
          title="system — Admin broadcast"
          items={[
            { label: "Trigger", value: "Admin sends from /admin/settings/notifications" },
            { label: "Recipients", value: "All active users, or filtered by role" },
            { label: "Title / Body", value: "Admin-defined" },
            { label: "Link", value: "Optional — admin can set a target page" },
          ]}
        />
        <SpecCard
          title="lead_assigned — v2 / future"
          items={[
            { label: "Trigger", value: "Admin assigns a lead directly to an SDR" },
            { label: "Recipients", value: "The assigned SDR" },
            { label: "Title", value: '"Lead assigned to you"' },
            { label: "Link", value: "/leads" },
          ]}
        />
      </SpecSection>

      {/* Technical */}
      <SpecSection title="Technical implementation">
        <SpecCard
          items={[
            { label: "Realtime setup", value: "Subscribe to notifications table filtered by user_id=eq.[userId] in app/(app)/layout.tsx via supabase.channel().on('postgres_changes', { event: 'INSERT', ... })" },
            { label: "Server creation", value: "All notifications inserted via admin Supabase client from Route Handlers only — never from client components" },
            { label: "Service function", value: "lib/services/notifications.ts → createNotification({ user_id, type, title, body?, payload? })" },
            { label: "v1 lazy check", value: "On page load, backend checks for overdue hold_until and follow_up_at and creates notifications lazily. Proper scheduled cron job is a v2 concern." },
          ]}
        />
      </SpecSection>
    </SpecPreviewPage>
  );
}
