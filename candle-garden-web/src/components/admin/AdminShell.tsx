"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { site } from "@/lib/site";

const nav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/shop", label: "Shop" },
  { href: "/admin/classes", label: "Classes" },
  { href: "/admin/visit", label: "Visit" },
];

export function AdminShell({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/admin";

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
          {nav.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "is-active" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
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
