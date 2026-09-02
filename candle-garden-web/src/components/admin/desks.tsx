"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Announcement, GardenContent, HourRow } from "@/lib/admin/content";
import type { PhotoSlots } from "@/lib/admin/photos";

function formatWhen(iso: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso)
  );
}

function Notice({ error, notice }: { error?: string; notice?: string }) {
  if (error) return <p className="admin-error">{error}</p>;
  if (notice) return <p className="admin-notice">{notice}</p>;
  return null;
}

function Bars({ series }: { series: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...series.map((row) => row.value));
  return (
    <div className="admin-bars">
      {series.map((row) => (
        <div key={row.label}>
          <span style={{ height: `${Math.max(8, (row.value / max) * 88)}px` }} />
          <small>{row.label}</small>
        </div>
      ))}
    </div>
  );
}

export function HealthDesk() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const res = await fetch("/api/admin/site-health", { credentials: "include", cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error || "Could not load site health");
    else setData(json);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const visitors = (data?.visitors || {}) as {
    uniqueVisitors?: number;
    items?: unknown[];
    series?: Array<{ label: string; value: number }>;
    topPages?: Array<{ path: string; views: number }>;
  };
  const catalog = (data?.catalog || {}) as { candles?: number; classes?: number };
  const inquiries = (data?.inquiries || {}) as { unread?: number; recent?: number };
  return (
    <>
      <p className="eyebrow">Overview</p>
      <h1>Site health</h1>
      <p className="admin-lede">
        {(data?.headline as string) || "Visitors, messages, and catalog counts for the Vercel storefront."}
      </p>
      <Notice error={error} />
      <div className="admin-stats">
        <article>
          <span>Visitors (7d)</span>
          <strong>{visitors.uniqueVisitors ?? 0}</strong>
        </article>
        <article>
          <span>Page views</span>
          <strong>{visitors.items?.length ?? 0}</strong>
        </article>
        <article>
          <span>Unread notes</span>
          <strong>{inquiries.unread ?? 0}</strong>
        </article>
        <article>
          <span>Candles</span>
          <strong>{catalog.candles ?? 0}</strong>
        </article>
      </div>
      {visitors.series ? <Bars series={visitors.series} /> : null}
      <div className="admin-grid">
        <section className="admin-card">
          <p className="eyebrow">Top pages</p>
          {(visitors.topPages || []).length ? (
            (visitors.topPages || []).map((row) => (
              <p key={row.path}>
                {row.path} <strong>{row.views}</strong>
              </p>
            ))
          ) : (
            <p>No public visits recorded yet.</p>
          )}
          <Link className="text-link" href="/admin/visitors">
            Visitor log →
          </Link>
        </section>
        <section className="admin-card">
          <p className="eyebrow">Inbox</p>
          <h2>{inquiries.recent ?? 0} notes</h2>
          <p>{inquiries.unread ? `${inquiries.unread} unread from the contact form.` : "Inbox is caught up."}</p>
          <Link className="text-link" href="/admin/messages">
            Open messages →
          </Link>
        </section>
        <section className="admin-card">
          <p className="eyebrow">Catalog</p>
          <p>
            {catalog.candles} candles · {catalog.classes} class dates
          </p>
          <Link className="text-link" href="/admin/shop">
            Shop desk →
          </Link>
        </section>
      </div>
    </>
  );
}

export function ReportsDesk() {
  const [days, setDays] = useState(7);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async (windowDays: number) => {
    const res = await fetch(`/api/admin/reports?days=${windowDays}`, { credentials: "include" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error || "Could not load report");
    else setReport(json);
  }, []);
  useEffect(() => {
    void load(days);
  }, [days, load]);
  return (
    <>
      <p className="eyebrow">Overview</p>
      <h1>Reports</h1>
      <p className="admin-lede">Weekly numbers from the public storefront. Print this page if you want a paper copy.</p>
      <div className="admin-toolbar">
        <button className={days === 7 ? "button button-dark" : "button button-outline"} type="button" onClick={() => setDays(7)}>
          7 days
        </button>
        <button className={days === 30 ? "button button-dark" : "button button-outline"} type="button" onClick={() => setDays(30)}>
          30 days
        </button>
      </div>
      <Notice error={error} />
      <div className="admin-stats">
        <article>
          <span>Views</span>
          <strong>{Number(report?.views || 0)}</strong>
        </article>
        <article>
          <span>Visitors</span>
          <strong>{Number(report?.uniqueVisitors || 0)}</strong>
        </article>
        <article>
          <span>Messages</span>
          <strong>{Number(report?.inquiries || 0)}</strong>
        </article>
        <article>
          <span>Cities</span>
          <strong>{Number(report?.uniqueLocations || 0)}</strong>
        </article>
      </div>
      {Array.isArray(report?.series) ? (
        <Bars series={report.series as Array<{ label: string; value: number }>} />
      ) : null}
    </>
  );
}

export function VisitorsDesk() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<{ items?: Array<Record<string, string>>; uniqueVisitors?: number } | null>(null);
  const [query, setQuery] = useState("");
  const load = useCallback(async (windowDays: number) => {
    const res = await fetch(`/api/admin/visitors?days=${windowDays}`, { credentials: "include" });
    setData(await res.json());
  }, []);
  useEffect(() => {
    void load(days);
  }, [days, load]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.items || []).filter((item) =>
      !q || [item.ip, item.city, item.path, item.country].join(" ").toLowerCase().includes(q)
    );
  }, [data, query]);
  return (
    <>
      <p className="eyebrow">People</p>
      <h1>Visitors</h1>
      <p className="admin-lede">
        {data?.uniqueVisitors || 0} unique visitors. Public pages do not set cookies; this log is staff-only.
      </p>
      <div className="admin-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search city, IP, or page…" />
        <button className={days === 7 ? "button button-dark" : "button button-outline"} type="button" onClick={() => setDays(7)}>
          7 days
        </button>
        <button className={days === 30 ? "button button-dark" : "button button-outline"} type="button" onClick={() => setDays(30)}>
          30 days
        </button>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Page</th>
              <th>City</th>
              <th>IP</th>
              <th>Device</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 80).map((item) => (
              <tr key={item.id}>
                <td>{formatWhen(item.createdAt)}</td>
                <td>{item.path}</td>
                <td>{[item.city, item.region, item.country].filter(Boolean).join(", ") || "Unknown"}</td>
                <td>{item.ip}</td>
                <td>
                  {item.device} · {item.browser}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function MessagesDesk() {
  const [items, setItems] = useState<Array<{
    id: string;
    createdAt: string;
    name: string;
    email?: string;
    phone?: string;
    message: string;
    status: string;
  }>>([]);
  const [query, setQuery] = useState("");
  const load = useCallback(async () => {
    const res = await fetch("/api/admin/inquiries", { credentials: "include" });
    const data = await res.json();
    setItems(data.items || []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const filtered = items.filter((item) =>
    `${item.name} ${item.email} ${item.phone} ${item.message}`.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <>
      <p className="eyebrow">People</p>
      <h1>Messages</h1>
      <p className="admin-lede">Notes from the public Visit page. Mark them read as you work through the day.</p>
      <input className="admin-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, or message…" />
      <div className="admin-list">
        {filtered.length === 0 ? <p>No messages yet.</p> : null}
        {filtered.map((item) => (
          <article className="admin-card" key={item.id}>
            <p className="eyebrow">{item.status === "new" ? "New" : "Read"} · {formatWhen(item.createdAt)}</p>
            <h2>{item.name}</h2>
            <p>
              {item.email} {item.phone}
            </p>
            <p>{item.message}</p>
            {item.status === "new" ? (
              <button
                className="button button-outline"
                type="button"
                onClick={() => {
                  void fetch("/api/admin/inquiries", {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ id: item.id }),
                  }).then(() => load());
                }}
              >
                Mark read
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}

export function PracticeDesk() {
  const [content, setContent] = useState<GardenContent | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch("/api/admin/content", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setContent(data.content));
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!content) return;
    setBusy(true);
    setError("");
    setNotice("");
    const res = await fetch("/api/admin/content", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(content),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(data.error || "Could not save.");
    else {
      setContent(data.content);
      setNotice("Saved. The public site will use this on the next load.");
    }
  }
  if (!content) return <p>Loading business info…</p>;
  function patch(partial: Partial<GardenContent>) {
    setContent((current) => (current ? { ...current, ...partial } : current));
  }
  function patchHour(index: number, partial: Partial<HourRow>) {
    setContent((current) => {
      if (!current) return current;
      const hours = current.hours.map((row, i) => (i === index ? { ...row, ...partial } : row));
      return { ...current, hours };
    });
  }
  return (
    <form onSubmit={(event) => void save(event)}>
      <p className="eyebrow">Website</p>
      <h1>Business info</h1>
      <p className="admin-lede">Hours, phone, and story copy — no AI needed. Shop checkout still lives on Squarespace.</p>
      <Notice error={error} notice={notice} />
      <div className="admin-form-grid">
        <label>
          Phone
          <input value={content.phone} onChange={(event) => patch({ phone: event.target.value })} />
        </label>
        <label>
          Email
          <input value={content.email} onChange={(event) => patch({ email: event.target.value })} />
        </label>
        <label>
          Address
          <input value={content.address} onChange={(event) => patch({ address: event.target.value })} />
        </label>
        <label>
          City
          <input value={content.city} onChange={(event) => patch({ city: event.target.value })} />
        </label>
        <label>
          Instagram
          <input value={content.instagram} onChange={(event) => patch({ instagram: event.target.value })} />
        </label>
        <label>
          Facebook
          <input value={content.facebook} onChange={(event) => patch({ facebook: event.target.value })} />
        </label>
      </div>
      <h2 className="admin-subhead">Hours</h2>
      {content.hours.map((row, index) => (
        <div className="admin-form-grid" key={index}>
          <label>
            Days
            <input value={row.days} onChange={(event) => patchHour(index, { days: event.target.value })} />
          </label>
          <label>
            Time
            <input value={row.time} onChange={(event) => patchHour(index, { time: event.target.value })} />
          </label>
        </div>
      ))}
      <h2 className="admin-subhead">Story</h2>
      <label className="admin-full">
        Quote
        <textarea rows={2} value={content.aboutQuote} onChange={(event) => patch({ aboutQuote: event.target.value })} />
      </label>
      <div className="admin-form-grid">
        <label>
          Left column
          <textarea rows={5} value={content.aboutLeft} onChange={(event) => patch({ aboutLeft: event.target.value })} />
        </label>
        <label>
          Right column
          <textarea rows={5} value={content.aboutRight} onChange={(event) => patch({ aboutRight: event.target.value })} />
        </label>
      </div>
      <button className="button button-dark" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save business info"}
      </button>
    </form>
  );
}

export function PhotosDesk() {
  const [slots, setSlots] = useState<PhotoSlots | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    void fetch("/api/admin/photos", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setSlots(data.slots));
  }, []);
  async function save() {
    if (!slots) return;
    const res = await fetch("/api/admin/photos", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(slots),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || "Could not save.");
    else {
      setSlots(data.slots);
      setNotice("Photos updated.");
    }
  }
  if (!slots) return <p>Loading photos…</p>;
  return (
    <>
      <p className="eyebrow">Website</p>
      <h1>Photos</h1>
      <p className="admin-lede">Paste image URLs for the home hero and story mark. File upload needs a Vercel Blob token.</p>
      <Notice error={error} notice={notice} />
      <label className="admin-full">
        Hero image URL
        <input value={slots.hero} onChange={(event) => setSlots({ ...slots, hero: event.target.value })} />
      </label>
      <label className="admin-full">
        Hero alt text
        <input value={slots.heroAlt} onChange={(event) => setSlots({ ...slots, heroAlt: event.target.value })} />
      </label>
      <label className="admin-full">
        Story image URL
        <input value={slots.about} onChange={(event) => setSlots({ ...slots, about: event.target.value })} />
      </label>
      <label className="admin-full">
        Story alt text
        <input value={slots.aboutAlt} onChange={(event) => setSlots({ ...slots, aboutAlt: event.target.value })} />
      </label>
      <button className="button button-dark" type="button" onClick={() => void save()}>
        Save photos
      </button>
    </>
  );
}

export function AnnouncementsDesk() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [closedToday, setClosedToday] = useState(false);
  const [closedMessage, setClosedMessage] = useState("");
  const [banner, setBanner] = useState("");
  const [draft, setDraft] = useState({ title: "", body: "" });
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const [posts, content] = await Promise.all([
      fetch("/api/admin/announcements", { credentials: "include" }).then((res) => res.json()),
      fetch("/api/admin/content", { credentials: "include" }).then((res) => res.json()),
    ]);
    setItems(posts.items || []);
    setClosedToday(Boolean(content.content?.closedToday));
    setClosedMessage(content.content?.closedMessage || "");
    setBanner(content.content?.banner || "");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function saveBanner() {
    const current = await fetch("/api/admin/content", { credentials: "include" }).then((res) => res.json());
    await fetch("/api/admin/content", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...current.content, banner, closedToday, closedMessage }),
    });
    setNotice("Banner saved.");
  }
  async function addPost() {
    if (!draft.title.trim()) return;
    const next = [
      {
        id: `post-${Date.now()}`,
        title: draft.title,
        body: draft.body,
        date: new Date().toISOString(),
        published: true,
      },
      ...items,
    ];
    await fetch("/api/admin/announcements", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: next }),
    });
    setDraft({ title: "", body: "" });
    await load();
  }
  async function removePost(id: string) {
    const next = items.filter((item) => item.id !== id);
    await fetch("/api/admin/announcements", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: next }),
    });
    await load();
  }
  return (
    <>
      <p className="eyebrow">Website</p>
      <h1>Announcements</h1>
      <p className="admin-lede">The top bar on the public site, plus news notes and a closed-today switch.</p>
      <Notice notice={notice} />
      <label className="admin-full">
        Top bar
        <input value={banner} onChange={(event) => setBanner(event.target.value)} />
      </label>
      <label className="admin-check">
        <input type="checkbox" checked={closedToday} onChange={(event) => setClosedToday(event.target.checked)} />
        Closed today
      </label>
      <label className="admin-full">
        Closed message
        <input value={closedMessage} onChange={(event) => setClosedMessage(event.target.value)} />
      </label>
      <button className="button button-dark" type="button" onClick={() => void saveBanner()}>
        Save banner
      </button>
      <h2 className="admin-subhead">New note</h2>
      <label className="admin-full">
        Title
        <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      </label>
      <label className="admin-full">
        Body
        <textarea rows={4} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
      </label>
      <button className="button button-outline" type="button" onClick={() => void addPost()}>
        Publish note
      </button>
      <div className="admin-list">
        {items.map((item) => (
          <article className="admin-card" key={item.id}>
            <p className="eyebrow">{formatWhen(item.date)}</p>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
            <button className="button button-outline" type="button" onClick={() => void removePost(item.id)}>
              Remove
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

export function AiDesk() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    const next = [...messages, { role: "user" as const, content: input.trim() }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/chat", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: next }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(data.error || "Grok could not reply.");
    else setMessages([...next, { role: "assistant", content: data.reply || "" }]);
  }
  return (
    <>
      <p className="eyebrow">Website</p>
      <h1>Content AI</h1>
      <p className="admin-lede">Rewrite banner copy, class blurbs, or story lines. Paste the result into Business info or Announcements.</p>
      <Notice error={error} />
      <div className="admin-chat">
        {messages.map((item, index) => (
          <article key={index} className={item.role === "assistant" ? "admin-card" : "admin-card user"}>
            <p className="eyebrow">{item.role === "assistant" ? "Grok" : "You"}</p>
            <p>{item.content}</p>
          </article>
        ))}
      </div>
      <form className="admin-chat-form" onSubmit={(event) => void send(event)}>
        <textarea rows={3} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask for a warmer banner, a class description, or a closed-today note…" />
        <button className="button button-dark" type="submit" disabled={busy}>
          {busy ? "Writing…" : "Ask Grok"}
        </button>
      </form>
    </>
  );
}

export function SocialDesk() {
  const [body, setBody] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["instagram"]);
  const [items, setItems] = useState<Array<{ id: string; body: string; platforms: string[]; createdAt: string; status: string }>>([]);
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const data = await fetch("/api/admin/social", { credentials: "include" }).then((res) => res.json());
    setItems(data.items || []);
    setConnected(data.connected || {});
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  function toggle(platform: string) {
    setPlatforms((current) =>
      current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]
    );
  }
  async function save() {
    await fetch("/api/admin/social", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body, platforms }),
    });
    setBody("");
    setNotice("Draft saved. Connect Instagram/Facebook tokens in Settings to post live.");
    await load();
  }
  return (
    <>
      <p className="eyebrow">Website</p>
      <h1>Social Media</h1>
      <p className="admin-lede">
        Instagram {connected.instagram ? "connected" : "needs setup"} · Facebook {connected.facebook ? "connected" : "needs setup"}.
      </p>
      <Notice notice={notice} />
      <label className="admin-full">
        Post
        <textarea rows={5} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <div className="admin-toolbar">
        <label className="admin-check">
          <input type="checkbox" checked={platforms.includes("instagram")} onChange={() => toggle("instagram")} />
          Instagram
        </label>
        <label className="admin-check">
          <input type="checkbox" checked={platforms.includes("facebook")} onChange={() => toggle("facebook")} />
          Facebook
        </label>
      </div>
      <button className="button button-dark" type="button" onClick={() => void save()}>
        Save draft
      </button>
      <div className="admin-list">
        {items.map((item) => (
          <article className="admin-card" key={item.id}>
            <p className="eyebrow">{item.status} · {formatWhen(item.createdAt)}</p>
            <p>{item.body}</p>
            <p>{item.platforms.join(", ")}</p>
          </article>
        ))}
      </div>
    </>
  );
}

export function StaffDesk({ currentId }: { currentId?: string }) {
  const [users, setUsers] = useState<Array<{ id: string; source: string; createdAt: string }>>([]);
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const data = await fetch("/api/admin/staff", { credentials: "include" }).then((res) => res.json());
    setUsers(data.users || []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function onAdd(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || "Could not add that login.");
    else {
      setId("");
      setPassword("");
      setNotice(`Added ${data.user.id}. They can sign in now.`);
      await load();
    }
  }
  return (
    <>
      <p className="eyebrow">Account</p>
      <h1>Staff logins</h1>
      <p className="admin-lede">Owner accounts stay. Extra IDs can be added and removed here.</p>
      <Notice error={error} notice={notice} />
      <form className="admin-form-grid" onSubmit={(event) => void onAdd(event)}>
        <label>
          New ID
          <input value={id} onChange={(event) => setId(event.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
        </label>
        <button className="button button-dark" type="submit">
          Add login
        </button>
      </form>
      <ul className="admin-staff">
        {users.map((user) => (
          <li key={user.id}>
            <div>
              <strong>{user.id}</strong>
              <span>
                {user.source === "env" ? "Owner account" : "Staff"}
                {user.id === currentId ? " · you" : ""}
              </span>
            </div>
            {user.source === "staff" ? (
              <button
                className="button button-outline"
                type="button"
                onClick={() => {
                  if (!window.confirm(`Remove ${user.id}?`)) return;
                  void fetch("/api/admin/staff", {
                    method: "DELETE",
                    credentials: "include",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ id: user.id }),
                  }).then(() => load());
                }}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

export function SettingsDesk() {
  const [session, setSession] = useState<Record<string, unknown> | null>(null);
  const [alerts, setAlerts] = useState({ email: "", phone: "" });
  const [notice, setNotice] = useState("");
  useEffect(() => {
    void fetch("/api/admin/session", { credentials: "include" })
      .then((res) => res.json())
      .then(setSession);
    void fetch("/api/admin/alerts", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.alerts) setAlerts(data.alerts);
      });
  }, []);
  const social = (session?.social || { connected: {} }) as { connected?: Record<string, boolean> };
  return (
    <>
      <p className="eyebrow">Account</p>
      <h1>Settings</h1>
      <p className="admin-lede">Connections that power health numbers, Content AI, and message alerts.</p>
      <section className="admin-card">
        <p className="eyebrow">Signed in</p>
        <h2>{String(session?.id || "Staff")}</h2>
        <p>Sessions last 12 hours.</p>
      </section>
      <section className="admin-card">
        <p className="eyebrow">Connections</p>
        <p>Content AI {session?.grokConfigured ? "ready" : "needs XAI_API_KEY"}</p>
        <p>Saved records {session?.blobConfigured ? "on Vercel Blob" : "local / temporary until Blob is set"}</p>
        <p>Instagram {social.connected?.instagram ? "connected" : "needs INSTAGRAM_ACCESS_TOKEN"}</p>
        <p>Facebook {social.connected?.facebook ? "connected" : "needs FACEBOOK_PAGE_TOKEN"}</p>
      </section>
      <form
        className="admin-form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void fetch("/api/admin/alerts", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(alerts),
          }).then(() => setNotice("Alert contacts saved."));
        }}
      >
        <label>
          Ping email
          <input value={alerts.email} onChange={(event) => setAlerts({ ...alerts, email: event.target.value })} />
        </label>
        <label>
          Ping phone
          <input value={alerts.phone} onChange={(event) => setAlerts({ ...alerts, phone: event.target.value })} />
        </label>
        <button className="button button-dark" type="submit">
          Save alerts
        </button>
      </form>
      <Notice notice={notice} />
    </>
  );
}
