import type { PushData } from "@autumn/shared";

export type Toast =
  | { readonly kind: "sale"; readonly id: number; readonly data: PushData }
  | {
      readonly kind: "message";
      readonly id: number;
      readonly text: string;
      readonly tone: "info" | "error";
    };

type Listener = (toast: Toast) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function subscribeToToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function showSaleToast(data: PushData): void {
  const toast: Toast = { kind: "sale", id: nextId++, data };
  for (const listener of listeners) listener(toast);
}

export function showMessageToast(text: string, tone: "info" | "error" = "info"): void {
  const toast: Toast = { kind: "message", id: nextId++, text, tone };
  for (const listener of listeners) listener(toast);
}
