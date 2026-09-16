"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, BarChart3, Menu, PackageSearch, Settings, Smartphone, Users, X } from "lucide-react";

const NAV = [
  { href: "/mobileadmin", label: "Overview", detail: "What needs attention", Icon: Activity },
  { href: "/mobileadmin/orders", label: "Orders", detail: "Search every order", Icon: PackageSearch },
  { href: "/mobileadmin/customers", label: "Customers", detail: "People using the app", Icon: Users },
  { href: "/mobileadmin/engagement", label: "Engagement", detail: "Downloads and usage", Icon: BarChart3 },
  { href: "/mobileadmin/operations", label: "App health", detail: "Services and tracking", Icon: Settings },
];

export function MobileAdminShell({ id, children }: { id?: string; children: React.ReactNode }) {
  const pathname = usePathname() || "/mobileadmin";
  const [open, setOpen] = useState(false);
  const active = NAV.find((item) => item.href === "/mobileadmin" ? pathname === item.href : pathname.startsWith(item.href));

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    window.location.assign("/mobileadmin");
  }

  return <div className="mobileadmin-shell">
    <aside className={`mobileadmin-aside${open ? " is-open" : ""}`}>
      <Link href="/mobileadmin" className="mobileadmin-brand" onClick={() => setOpen(false)}>
        <span><Smartphone size={20} /></span>
        <div><small>Owner console</small><strong>Candle Garden Mobile</strong></div>
      </Link>
      <nav>{NAV.map(({ href, label, detail, Icon }) => {
        const selected = href === "/mobileadmin" ? pathname === href : pathname.startsWith(href);
        return <Link key={href} href={href} className={selected ? "is-active" : undefined} onClick={() => setOpen(false)}>
          <Icon size={18} /><span><strong>{label}</strong><small>{detail}</small></span>
        </Link>;
      })}</nav>
      <div className="mobileadmin-foot"><small>Signed in as {id}</small><Link href="/admin">Website admin</Link><button onClick={() => void signOut()}>Sign out</button></div>
    </aside>
    {open ? <button className="mobileadmin-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} /> : null}
    <main className="mobileadmin-main">
      <header><button onClick={() => setOpen(true)}><Menu size={18} /> Menu</button><strong>{active?.label || "Mobile admin"}</strong><span>Live operations</span><button className="mobileadmin-close" onClick={() => setOpen(false)}><X size={18} /></button></header>
      <div className="mobileadmin-content">{children}</div>
    </main>
  </div>;
}
