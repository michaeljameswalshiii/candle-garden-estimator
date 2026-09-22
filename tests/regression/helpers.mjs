import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

export function origin() {
  return String(process.env.BASE_URL || "https://candle-garden-web.vercel.app").replace(/\/$/, "");
}

export function apiBase() {
  return String(
    process.env.CANDLE_GARDEN_API_BASE ||
      "https://ry95dso7lc.execute-api.us-east-1.amazonaws.com/prod",
  ).replace(/\/$/, "");
}

export function adminCredentials() {
  const id = String(process.env.CANDLE_GARDEN_ADMIN_ID || "").trim();
  const password = String(process.env.CANDLE_GARDEN_ADMIN_PASSWORD || "");
  if (!id || !password) return null;
  return { id, password };
}

export function hasText(haystack, needle) {
  return String(haystack || "").toLowerCase().includes(String(needle || "").toLowerCase());
}

export function collect() {
  const failures = [];
  const notes = [];
  return {
    failures,
    notes,
    check(name, condition, detail) {
      if (condition) return;
      failures.push(detail ? `${name}: ${detail}` : name);
    },
    note(message) {
      notes.push(message);
    },
    result(extra = {}) {
      return {
        ok: failures.length === 0,
        failures,
        notes,
        ...extra,
      };
    },
  };
}
