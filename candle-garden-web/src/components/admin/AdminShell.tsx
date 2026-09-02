"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ADMIN_NAV, ADMIN_SECTIONS } from "@/lib/admin/nav";
import { site } from "@/lib/site";

export function AdminShell({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/admin";
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    void fetch("/api/admin/inquiries", { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.unread === "number") setUnread(data.unread);
      })
      .catch(() => undefined);
  }, [pathname]);

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    window.location.assign("/admin");
  }

  return (
    <div className="admin-shell">
      <aside className="admin-aside">
        <Link className="admin-brand" href="/admin">
          <Image src={site.logo} alt="" width={46} height={46} />
          <span>
            <strong>Garden Admin</strong>
            <small>The Candle Garden</small>
          </span>
        </Link>
        <nav>
          {ADMIN_SECTIONS.map((section) => (
            <div className="admin-nav-section" key={section}>
              <p>{section}</p>
              {ADMIN_NAV.filter((item) => item.section === section).map((item) => {
                const active =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} className={active ? "is-active" : undefined}>
                    <span>{item.label}</span>
                    {item.href === "/admin/messages" && unread > 0 ? (
                      <em>{unread}</em>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="admin-aside-foot">
          <p>Signed in as {id}</p>
          <a href="/" target="_blank" rel="noreferrer">
            View public site
          </a>
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <span>Atlantic Beach storefront</span>
          <a href="https://candle-garden-web.vercel.app" target="_blank" rel="noreferrer">
            candle-garden-web.vercel.app
          </a>
        </header>
        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
