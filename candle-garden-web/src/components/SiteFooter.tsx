import Image from "next/image";
import Link from "next/link";
import { getGardenContent } from "@/lib/admin/content";
import { site } from "@/lib/site";

export async function SiteFooter() {
  const content = await getGardenContent();
  return (
    <footer className="site-footer">
      <div className="footer-grid page-shell">
        <div className="footer-brand">
          <Image src={site.logo} width={72} height={72} alt="The Candle Garden flying pig" />
          <h2>Anything is possible.</h2>
          <p>Small-batch candles, leafy joy, and creative afternoons by the beach.</p>
        </div>
        <div>
          <h3>Explore</h3>
          <Link href="/shop">Shop candles</Link>
          <Link href="/classes">Candle classes</Link>
          <Link href="/our-story">Our story</Link>
          <Link href="/contact">Visit the shop</Link>
        </div>
        <div>
          <h3>Visit</h3>
          <a href={content.mapUrl} target="_blank" rel="noreferrer">
            {content.address}<br />{content.city}
          </a>
          {content.hours.map((row) => (
            <p key={row.days}>{row.days}<br /><strong>{row.time}</strong></p>
          ))}
        </div>
        <div>
          <h3>Say hello</h3>
          <a href={`tel:${site.phoneHref}`}>{content.phone}</a>
          <a href={`mailto:${content.email}`}>{content.email}</a>
          <a href={content.instagram} target="_blank" rel="noreferrer">Instagram</a>
          <a href={content.facebook} target="_blank" rel="noreferrer">Facebook</a>
        </div>
      </div>
      <div className="footer-bottom page-shell">
        <span>© {new Date().getFullYear()} The Candle Garden</span>
        <span>Woman-owned · Hand-poured in Atlantic Beach</span>
      </div>
    </footer>
  );
}
