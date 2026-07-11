/**
 * Notification abstraction for sightings.
 *
 * Today: records the sighting via Supabase (done by the caller) and returns
 * a WhatsApp deep-link so a human tutor can be reached immediately.
 *
 * Tomorrow: wire real channels (email via Resend, WhatsApp via Twilio/Meta,
 * Web Push) — each channel below has a dedicated hook so we don't have to
 * refactor the call site once the integrations exist.
 */

export type SightingPayload = {
  petId: string;
  petName: string;
  ownerPhone?: string | null;
  reporterName?: string | null;
  reporterContact?: string | null;
  location?: string | null;
  message?: string | null;
};

export type NotificationResult = {
  channel: "email" | "whatsapp" | "push";
  status: "sent" | "skipped" | "failed";
  detail?: string;
};

export async function notifySightingEmail(_: SightingPayload): Promise<NotificationResult> {
  // TODO: call a server function that sends email through Resend/Sendgrid.
  return { channel: "email", status: "skipped", detail: "Not configured" };
}

export async function notifySightingWhatsApp(p: SightingPayload): Promise<NotificationResult> {
  // TODO: replace with Twilio / Meta Cloud API server function.
  if (!p.ownerPhone) return { channel: "whatsapp", status: "skipped", detail: "No owner phone" };
  return { channel: "whatsapp", status: "skipped", detail: "Deep-link only" };
}

export async function notifySightingPush(_: SightingPayload): Promise<NotificationResult> {
  // TODO: register service worker + push subscriptions.
  return { channel: "push", status: "skipped", detail: "Not configured" };
}

export async function dispatchSightingNotifications(p: SightingPayload) {
  return Promise.all([
    notifySightingEmail(p),
    notifySightingWhatsApp(p),
    notifySightingPush(p),
  ]);
}