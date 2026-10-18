"use client";

import { get, set } from "idb-keyval";
import { isCloudActive, getSyncSecret } from "./cloud-mode";

/** Header that authenticates the client to the /api/state proxy. */
function syncHeaders(extra?: Record<string, string>): Record<string, string> {
  return { "x-sync-secret": getSyncSecret(), ...extra };
}

/**
 * Storage abstraction for the geo-aeo-tracker app.
 *
 * Two modes, chosen per-call:
 * - Local (default): IndexedDB is source of truth, localStorage is a fast-path
 *   cache that may be incomplete (quota limited).
 * - Cloud (when Supabase env is configured AND user hasn't opted out):
 *   The /api/state route (Supabase) is source of truth; IDB is a read cache.
 *
 * The key/value contract is identical in both modes so consumers don't care.
 */

async function cloudGet<T>(key: string): Promise<T | null> {
  const res = await fetch(`/api/state?key=${encodeURIComponent(key)}`, {
    method: "GET",
    cache: "no-store",
    headers: syncHeaders(),
  });
  if (!res.ok) throw new Error(`cloud GET failed: ${res.status}`);
  const data = (await res.json()) as { value: T | null };
  return data.value;
}

async function cloudPut<T>(key: string, value: T): Promise<void> {
  const res = await fetch(`/api/state`, {
    method: "PUT",
    headers: syncHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error(`cloud PUT failed: ${res.status}`);
}

async function cloudDelete(key: string): Promise<void> {
  const res = await fetch(`/api/state?key=${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: syncHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`cloud DELETE failed: ${res.status}`);
  }
}

/**
 * Load state.
 *
 * Cloud mode: read from /api/state. On failure, fall back to IDB so the app
 *   keeps working offline / during Supabase free-tier cold-starts.
 * Local mode: IDB first, localStorage second, fallback third.
 */
export async function loadSovereignValue<T>(
  key: string,
  fallback: T,
): Promise<T> {
  if (isCloudActive()) {
    try {
      const cloudValue = await cloudGet<T>(key);
      if (cloudValue !== null && cloudValue !== undefined) {
        // Warm IDB cache so subsequent reads stay snappy
        set(key, cloudValue).catch(() => {});
        return cloudValue;
      }
    } catch (err) {
      // Network / server error — fall through to local cache
      if (typeof console !== "undefined") {
        console.warn(
          "[sovereign-store] cloud load failed, using local cache:",
          err,
        );
      }
    }
    // Cloud returned no value OR failed — try IDB as cache
    try {
      const cached = await get<T>(key);
      if (cached !== undefined) return cached;
    } catch {
      /* ignore */
    }
    return fallback;
  }

  // Local mode (original behavior)
  try {
    const indexed = await get<T>(key);
    if (indexed !== undefined) return indexed;

    const localRaw = window.localStorage.getItem(key);
    if (localRaw) {
      const parsed = JSON.parse(localRaw) as T;
      await set(key, parsed).catch(() => {});
      return parsed;
    }
  } catch {
    try {
      const localRaw = window.localStorage.getItem(key);
      if (localRaw) return JSON.parse(localRaw) as T;
    } catch {
      /* give up */
    }
  }

  return fallback;
}

/** Thrown by saveSovereignValue when the data is saved locally but the cloud write failed. */
export class CloudSyncError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CloudSyncError";
  }
}

async function writeLocal<T>(key: string, value: T): Promise<void> {
  await set(key, value);

  try {
    const serialized = JSON.stringify(value);
    window.localStorage.setItem(key, serialized);
  } catch {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Save state.
 *
 * Always writes the local copy first (IDB primary, localStorage best-effort).
 * Cloud mode then pushes to /api/state. If that fails the data is still saved
 * locally and a CloudSyncError is thrown so the caller can show a notice.
 */
export async function saveSovereignValue<T>(
  key: string,
  value: T,
): Promise<void> {
  if (isCloudActive()) {
    // Local first: a missing secret or a Supabase outage must not lose the save.
    await writeLocal(key, value).catch(() => {});
    try {
      await cloudPut(key, value);
    } catch (err) {
      throw new CloudSyncError(
        err instanceof Error ? err.message : "cloud save failed",
        { cause: err },
      );
    }
    return;
  }

  // Local mode (original behavior)
  await writeLocal(key, value);
}

export async function clearSovereignStore(key: string): Promise<void> {
  // Always clear local caches
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  const { del } = await import("idb-keyval");
  await del(key).catch(() => {});

  // Also clear cloud copy when active
  if (isCloudActive()) {
    try {
      await cloudDelete(key);
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn("[sovereign-store] cloud delete failed:", err);
      }
    }
  }
}
