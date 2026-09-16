"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Integration } from "@/lib/mobileadmin/integrations";

function statusClass(status: Integration["status"]) {
  return status === "Connected" || status === "Live" ? "is-connected" : "";
}

export function IntegrationsCenter() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/mobileadmin/integrations", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load API connections.");
      const data = (await response.json()) as { integrations?: Integration[]; checkedAt?: string };
      setIntegrations(data.integrations || []);
      setCheckedAt(data.checkedAt || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load API connections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, Integration[]>();
    for (const item of integrations) {
      if (!byGroup.has(item.group)) {
        order.push(item.group);
        byGroup.set(item.group, []);
      }
      byGroup.get(item.group)!.push(item);
    }
    return order.map((group) => ({ group, items: byGroup.get(group) || [] }));
  }, [integrations]);

  const liveCount = integrations.filter((item) => item.status === "Connected" || item.status === "Live").length;

  return (
    <section className="jobs-center integrations-center">
      <div className="jobs-section-head">
        <div>
          <p>Connected APIs</p>
          <h2>Integrations</h2>
        </div>
        <button onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} className={loading ? "is-spinning" : undefined} /> Refresh
        </button>
      </div>
      <p className="integrations-lede">
        {loading
          ? "Checking live shop, class, catalog, and credential status…"
          : `${liveCount} of ${integrations.length} connections are live. New APIs added for the mobile shop appear here automatically.`}
        {checkedAt ? ` Checked ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(checkedAt))}.` : ""}
      </p>
      {error ? <div className="jobs-error">{error}</div> : null}
      {groups.map(({ group, items }) => (
        <div key={group} className="integrations-group">
          <h3>{group}</h3>
          <div className="mobileadmin-checks">
            {items.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                  {item.note ? <small>{item.note}</small> : null}
                  {item.endpoint ? (
                    <a href={item.endpoint} target="_blank" rel="noreferrer">
                      {item.endpoint}
                    </a>
                  ) : null}
                </div>
                <em className={statusClass(item.status)}>{item.status}</em>
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
