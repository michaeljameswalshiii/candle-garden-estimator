import { loadRecord, saveRecord } from "./store";

export type AlertSettings = { email: string; phone: string };

export async function getAlerts(): Promise<AlertSettings> {
  return loadRecord("alerts", { email: "", phone: "" });
}

export async function saveAlerts(next: AlertSettings): Promise<AlertSettings> {
  const cleaned = {
    email: String(next.email || "").trim().slice(0, 160),
    phone: String(next.phone || "").trim().slice(0, 40),
  };
  await saveRecord("alerts", cleaned);
  return cleaned;
}
