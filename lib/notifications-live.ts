"use client";

const EVENT = "mti:notifications-changed";
const STORAGE_KEY = "mti:notifications-ping";

export function pingNotificationsLive(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore quota / private mode */
  }
}

export function subscribeNotificationsLive(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onVis = () => {
    if (document.visibilityState === "visible") onChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("storage", onStorage);
  };
}
