import { loadRecord, saveRecord } from "./store";
import { hashPassword, safeEqual } from "./auth";

export type StoredStaff = {
  id: string;
  passwordHash: string;
  createdAt: string;
  createdBy?: string;
};

const EMPTY: { users: StoredStaff[] } = { users: [] };

export async function listStaff(): Promise<StoredStaff[]> {
  const data = await loadRecord("staff", EMPTY);
  return Array.isArray(data.users) ? data.users : [];
}

export async function addStaff(input: {
  id: string;
  password: string;
  createdBy?: string;
}): Promise<StoredStaff> {
  const id = String(input.id || "").trim();
  if (id.length < 3) throw new Error("ID must be at least 3 characters.");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters.");
  const users = await listStaff();
  if (users.some((user) => user.id.toLowerCase() === id.toLowerCase())) {
    throw new Error("That ID is already in use.");
  }
  const next: StoredStaff = {
    id,
    passwordHash: hashPassword(input.password),
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
  await saveRecord("staff", { users: [...users, next] });
  return next;
}

export async function removeStaff(id: string): Promise<void> {
  const users = await listStaff();
  const next = users.filter((user) => user.id.toLowerCase() !== id.toLowerCase());
  if (next.length === users.length) throw new Error("Could not find that login.");
  await saveRecord("staff", { users: next });
}

export async function setStaffPassword(id: string, password: string): Promise<void> {
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  const users = await listStaff();
  const index = users.findIndex((user) => user.id.toLowerCase() === id.toLowerCase());
  if (index < 0) throw new Error("Could not find that login.");
  users[index] = { ...users[index], passwordHash: hashPassword(password) };
  await saveRecord("staff", { users });
}

export async function verifyStaff(
  id: string,
  password: string
): Promise<{ ok: true; id: string } | { ok: false }> {
  const users = await listStaff();
  const match = users.find((user) => user.id.toLowerCase() === id.toLowerCase());
  if (!match) return { ok: false };
  if (!safeEqual(match.passwordHash, hashPassword(password))) return { ok: false };
  return { ok: true, id: match.id };
}
