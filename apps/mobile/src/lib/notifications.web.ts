import type { Org, PushData } from "@autumn/shared";
import type { PushRegistration } from "./notifications";

export type { PushRegistration };

// Push notifications are a native feature. Web is a dev surface only.
export const SALES_SOUND = "cha_ching.wav";
export function orgChannelId(orgId: string): string {
  return `org-${orgId}`;
}
export function configureForegroundHandling(): void {}
export async function syncOrgChannels(_orgs: readonly Org[]): Promise<void> {}
export async function registerForPush(_options: { prompt: boolean }): Promise<PushRegistration> {
  return { kind: "unsupported", reason: "Push notifications run on iOS and Android." };
}
export async function unregisterPush(): Promise<void> {}
export function addSaleReceivedListener(_handler: (data: PushData) => void): () => void {
  return () => {};
}
export function addSaleOpenedListener(_handler: (data: PushData) => void): () => void {
  return () => {};
}
