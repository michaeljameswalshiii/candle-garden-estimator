import Image from "next/image";
import Link from "next/link";
import { getGardenContent } from "@/lib/admin/content";
import { site } from "@/lib/site";

const nav = [
  { href: "/shop", label: "Shop" },
  { href: "/classes", label: "Classes" },
  { href: "/our-story", label: "Our story" },
  { href: "/contact", label: "Visit" },
];

export async function SiteHeader() {
  const content = await getGardenContent();
  const banner = content.closedToday ? content.closedMessage : content.banner;
  return (
    <>
      <div className="announcement">{banner}</div>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="The Candle Garden home">
          <Image src={site.logo} alt="" width={54} height={54} className="brand-mark" />
          <span>
            <strong>The Candle Garden</strong>
            <small>Atlantic Beach, Florida</small>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {nav.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
          <a className="nav-cta" href={`${site.legacyStoreUrl}/cart`}>
            Cart
          </a>
        </nav>
        <details className="mobile-menu">
          <summary aria-label="Open navigation">Menu</summary>
          <nav aria-label="Mobile navigation">
            {nav.map((item) => (
              <Link href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
            <a href={`${site.legacyStoreUrl}/cart`}>Cart</a>
          </nav>
        </details>
      </header>
    </>
  );
}
