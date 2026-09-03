import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE = "cg_admin_session";
const MAX_AGE_SEC = 60 * 60 * 12;
const HASH_PEPPER = "candle-garden-admin-v1";
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || HASH_PEPPER;

export type AdminUser = {
  id: string;
  passwordHash: string;
};

export function hashPassword(password: string): string {
  return createHmac("sha256", HASH_PEPPER).update(password).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    try {
      timingSafeEqual(Buffer.from(a.padEnd(64, "0")), Buffer.from(b.padEnd(64, "0")));
    } catch {
      /* ignore */
    }
    return false;
  }
  try {
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function sign(payload: string): string {
  return createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function normalizeId(value: string): string {
  return String(value || "").trim();
}

/**
 * Built-in staff IDs. Override with ADMIN_USERS_LINES=id|password;id|password
 */
const BUILTIN_USERS: AdminUser[] = [
  {
    id: "Thepotentpig",
    passwordHash: "a04fa208e6e63a7d949650012f501224407d5f9e8e0424a650478cf1d40c247a",
  },
  {
    id: "GardenAdmin",
    passwordHash: "827e7f910e39e80453ae47a7b21f6a55dc820b466c27645f1b3cb64ecfe55688",
  },
];

function envPlaintextAccounts() {
  const accounts: Array<{ id: string; password: string }> = [];
  const pairs = [
    [process.env.OFFICE_USERNAME, process.env.OFFICE_PASSWORD],
    [process.env.OFFICE_ADMIN_USERNAME, process.env.OFFICE_ADMIN_PASSWORD],
  ];
  for (const [id, password] of pairs) {
    if (id?.trim() && password) accounts.push({ id: id.trim(), password });
  }
  return accounts;
}

export function loadAdminUsers(): Array<{ id: string; passwordHash: string }> {
  const lines = process.env.ADMIN_USERS_LINES || "";
  if (lines.trim()) {
    const fromEnv = lines
      .split(/[;\n]+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const i = line.indexOf("|");
        if (i < 1) return null;
        const id = normalizeId(line.slice(0, i));
        const password = line.slice(i + 1);
        if (!id || password.length < 8) return null;
        return { id, passwordHash: hashPassword(password) };
      })
      .filter(Boolean) as AdminUser[];
    if (fromEnv.length) return fromEnv;
  }
  return BUILTIN_USERS;
}

export function isAdminConfigured(): boolean {
  return loadAdminUsers().length > 0;
}

export async function verifyCredentials(
  id: string,
  password: string
): Promise<{ ok: true; id: string } | { ok: false }> {
  if (!password) return { ok: false };
  const users = loadAdminUsers();
  const incoming = normalizeId(id);
  const envMatch = envPlaintextAccounts().find(
    (account) => account.id.toLowerCase() === incoming.toLowerCase(),
  );
  if (envMatch) {
    if (!safeEqual(envMatch.password, password)) return { ok: false };
    return { ok: true, id: envMatch.id };
  }
  const match = users.find((user) => user.id.toLowerCase() === incoming.toLowerCase());
  if (match) {
    if (!safeEqual(match.passwordHash, hashPassword(password))) return { ok: false };
    return { ok: true, id: match.id };
  }
  const { verifyStaff } = await import("./staff");
  const staff = await verifyStaff(incoming, password);
  if (staff.ok) return staff;
  safeEqual(hashPassword(password), "x".repeat(64));
  return { ok: false };
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session.ok || !session.id) return { ok: false as const };
  return { ok: true as const, id: session.id };
}

export function createSessionToken(id: string): string {
  const exp = Date.now() + MAX_AGE_SEC * 1000;
  const safeId = normalizeId(id).replace(/\|/g, "");
  const body = `admin|${safeId}|${exp}`;
  return `${body}|${sign(body)}`;
}

export function validateSessionToken(token: string | undefined | null): {
  ok: boolean;
  id?: string;
} {
  if (!token) return { ok: false };
  const parts = token.split("|");
  if (parts.length !== 4) return { ok: false };
  const [kind, id, exp, signature] = parts;
  if (kind !== "admin" || !id || !exp || !signature) return { ok: false };
  if (Number(exp) < Date.now()) return { ok: false };
  const body = `${kind}|${id}|${exp}`;
  if (!safeEqual(signature, sign(body))) return { ok: false };
  return { ok: true, id };
}

export async function getAdminSession(): Promise<{ ok: boolean; id?: string }> {
  const jar = await cookies();
  return validateSessionToken(jar.get(COOKIE)?.value);
}

export function sessionCookieOptions(token: string) {
  return {
    name: COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}

export function clearSessionCookieOptions() {
  return {
    name: COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}
