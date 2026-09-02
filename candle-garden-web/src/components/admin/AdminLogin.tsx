"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { site } from "@/lib/site";

export function AdminLogin() {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: id.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      window.location.assign("/admin");
    } catch {
      setError("Could not reach the garden desk.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={onSubmit}>
        <Image src={site.logo} alt="" width={72} height={72} />
        <p className="eyebrow">Garden desk</p>
        <h1>Admin suite</h1>
        <p>Sign in to manage the Vercel storefront for The Candle Garden.</p>
        <label>
          ID
          <input
            autoComplete="username"
            value={id}
            onChange={(event) => setId(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? <p className="admin-error">{error}</p> : null}
        <button className="button button-dark" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Enter the garden"}
        </button>
        <a href="/">Back to the public site</a>
      </form>
    </div>
  );
}
