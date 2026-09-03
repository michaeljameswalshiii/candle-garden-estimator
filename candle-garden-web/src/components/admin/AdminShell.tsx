"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ADMIN_NAV, ADMIN_SECTIONS } from "@/lib/admin/nav";
import { site } from "@/lib/site";
import { Activity, BarChart3, BookOpen, CalendarDays, Camera, Inbox, MapPin, Megaphone, Menu, Settings, Share2, ShoppingBag, Sparkles, Users, X } from "lucide-react";

const ICONS: Record<string, typeof Activity> = {
  "/admin": Activity,
  "/admin/reports": BarChart3,
  "/admin/visitors": MapPin,
  "/admin/messages": Inbox,
  "/admin/shop": ShoppingBag,
  "/admin/classes": CalendarDays,
  "/admin/practice": BookOpen,
  "/admin/photos": Camera,
  "/admin/announcements": Megaphone,
  "/admin/ai": Sparkles,
  "/admin/social": Share2,
  "/admin/staff": Users,
  "/admin/settings": Settings,
};

export function AdminShell({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/admin";
  const [open, setOpen] = useState(false);
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
      <aside className={`admin-aside${open ? " is-open" : ""}`}>
        <Link className="admin-brand" href="/admin">
          <Image src={site.logo} alt="" width={46} height={46} />
          <span>
            <small>Storefront admin</small>
            <strong>The Candle Garden</strong>
            <i>Visitors, orders, classes, and website updates in one place.</i>
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
                const Icon = ICONS[item.href] || BookOpen;
                return (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={active ? "is-active" : undefined}>
                    <Icon size={17} aria-hidden="true" />
                    <span><strong>{item.label}</strong><small>{item.detail}</small></span>
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
      {open ? <button className="admin-nav-scrim" type="button" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <div className="admin-main">
        <header className="admin-topbar">
          <button className="admin-menu-toggle" type="button" onClick={() => setOpen(true)}><Menu size={18} /> Menu</button>
          <span>{ADMIN_NAV.find((item) => item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href))?.label || "Garden admin"}</span>
          <a href="https://candle-garden-web.vercel.app" target="_blank" rel="noreferrer">
            candle-garden-web.vercel.app
          </a>
          <button className="admin-menu-close" type="button" aria-label="Close menu" onClick={() => setOpen(false)}><X size={18} /></button>
        </header>
        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
