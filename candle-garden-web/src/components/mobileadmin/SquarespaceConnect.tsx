"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Status = {
  apiKeyConfigured?: boolean;
  apiKeyMasked?: string;
  oauthConfigured?: boolean;
  webhookSecretConfigured?: boolean;
  webhookSubscriptionId?: string;
  websiteTitle?: string;
  websiteId?: string;
  webhookEndpoint?: string;
  connectedAt?: string | null;
  message?: string;
};

export function SquarespaceConnect() {
  const [status, setStatus] = useState<Status | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [oauthAccessToken, setOauthAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/mobileadmin/squarespace", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load Squarespace credentials.");
    setStatus((await response.json()) as Status);
  }, []);

  useEffect(() => {
    void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load Squarespace credentials."));
  }, [load]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/mobileadmin/squarespace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey, oauthAccessToken }),
      });
      const data = (await response.json()) as Status & { error?: string };
      if (!response.ok) throw new Error(data.error || "Squarespace did not accept those credentials.");
      setStatus(data);
      setApiKey("");
      setOauthAccessToken("");
      setNotice(data.message || "Squarespace connected.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save Squarespace credentials.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="jobs-center squarespace-connect">
      <div className="jobs-section-head">
        <div>
          <p>Commerce credentials</p>
          <h2>Connect Squarespace</h2>
        </div>
      </div>
      <p className="integrations-lede">
        Generate a read-only Developer API key in Squarespace under Settings → Advanced → Developer API Keys.
        Name it <strong>Candle Garden Mobile Catalog</strong> and enable Products, Inventory, and Discounts.
        Paste it here. The key is stored privately and used immediately — no Vercel redeploy required.
      </p>
      <p className="integrations-lede">
        Webhooks still need an OAuth access token (API keys cannot subscribe). If you paste that token, this
        page creates the <code>order.create</code> / <code>order.update</code> subscription and stores the
        webhook secret.
      </p>
      {status?.apiKeyConfigured ? (
        <p className="integrations-lede">
          Connected{status.websiteTitle ? ` to ${status.websiteTitle}` : ""}. API key {status.apiKeyMasked}.
          {status.webhookSecretConfigured
            ? ` Webhook ${status.webhookSubscriptionId || "secret"} is stored.`
            : " Webhook secret is not stored yet."}
        </p>
      ) : null}
      {error ? <div className="jobs-error">{error}</div> : null}
      {notice ? <div className="jobs-notice">{notice}</div> : null}
      <form className="squarespace-form" onSubmit={(event) => void onSubmit(event)}>
        <label>
          Developer API key
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={status?.apiKeyConfigured ? "Replace stored API key" : "sq0atp-…"}
          />
        </label>
        <label>
          OAuth access token (webhooks)
          <input
            type="password"
            autoComplete="off"
            value={oauthAccessToken}
            onChange={(event) => setOauthAccessToken(event.target.value)}
            placeholder={status?.oauthConfigured ? "Replace stored OAuth token" : "Optional — required for webhooks"}
          />
        </label>
        <button type="submit" disabled={busy || (!apiKey && !oauthAccessToken)}>
          {busy ? "Connecting…" : "Save and verify"}
        </button>
      </form>
      {status?.webhookEndpoint ? (
        <p className="integrations-lede">
          Webhook endpoint: <code>{status.webhookEndpoint}</code>
        </p>
      ) : null}
    </section>
  );
}
