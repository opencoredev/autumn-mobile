import { z } from "zod";
import type { PushData } from "@autumn/shared";

export const SALE_SOUND = "cha_ching.wav";
const EXPO_BATCH_LIMIT = 100;

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: PushData;
  sound: string;
  priority: "high";
  /** Android: the app creates one channel per org with the cha-ching sound. */
  channelId: string;
  /** iOS: groups an org's notifications together. */
  threadId: string;
  interruptionLevel: "active";
};

export function orgThreadId(orgId: string): string {
  return `org-${orgId}`;
}

export function buildMessages(args: {
  tokens: readonly string[];
  notifications: readonly PushData[];
}): ExpoMessage[] {
  return args.tokens.flatMap((to) =>
    args.notifications.map((data) => ({
      to,
      title: data.title,
      body: data.body,
      data,
      sound: SALE_SOUND,
      priority: "high",
      channelId: orgThreadId(data.orgId),
      threadId: orgThreadId(data.orgId),
      interruptionLevel: "active",
    })),
  );
}

const TicketResponse = z.object({
  data: z.array(
    z.union([
      z.object({ status: z.literal("ok"), id: z.string().optional() }),
      z.object({
        status: z.literal("error"),
        message: z.string().optional(),
        details: z.object({ error: z.string().optional() }).optional(),
      }),
    ]),
  ),
});

/**
 * Sends in batches of 100 (Expo's limit). Returns tokens Expo says are no
 * longer registered so the caller can delete them.
 */
export async function sendExpoPush(args: {
  messages: readonly ExpoMessage[];
  url: string;
  accessToken: string | undefined;
  fetch: typeof fetch;
}): Promise<{ sent: number; unregistered: string[] }> {
  const unregistered: string[] = [];
  let sent = 0;
  for (let start = 0; start < args.messages.length; start += EXPO_BATCH_LIMIT) {
    const batch = args.messages.slice(start, start + EXPO_BATCH_LIMIT);
    const response = await args
      .fetch(args.url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          ...(args.accessToken ? { authorization: `Bearer ${args.accessToken}` } : {}),
        },
        body: JSON.stringify(batch),
      })
      .catch(() => null);
    if (!response?.ok) continue;
    const tickets = TicketResponse.safeParse(await response.json().catch(() => null));
    if (!tickets.success) continue;
    tickets.data.data.forEach((ticket, index) => {
      if (ticket.status === "ok") sent += 1;
      else if (ticket.details?.error === "DeviceNotRegistered") {
        const token = batch[index]?.to;
        if (token) unregistered.push(token);
      }
    });
  }
  return { sent, unregistered };
}
