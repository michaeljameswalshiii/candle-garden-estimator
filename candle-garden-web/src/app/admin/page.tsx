import Link from "next/link";
import { classes, products, upcomingClasses } from "@/lib/catalog";
import { hours, site } from "@/lib/site";

export default function AdminHomePage() {
  const upcoming = upcomingClasses();
  return (
    <>
      <p className="eyebrow">Overview</p>
      <h1>Garden desk</h1>
      <p className="admin-lede">
        This suite sits on the Vercel storefront. Shop and class checkout still
        live on Squarespace until the shared commerce API is ready.
      </p>
      <div className="admin-stats">
        <article>
          <span>Candles</span>
          <strong>{products.length}</strong>
        </article>
        <article>
          <span>Class dates</span>
          <strong>{classes.length}</strong>
        </article>
        <article>
          <span>Upcoming classes</span>
          <strong>{upcoming.length}</strong>
        </article>
        <article>
          <span>Staff IDs</span>
          <strong>2</strong>
        </article>
      </div>
      <div className="admin-grid">
        <section className="admin-card">
          <p className="eyebrow">Next class</p>
          {upcoming[0] ? (
            <>
              <h2>{upcoming[0].title}</h2>
              <p>{upcoming[0].scheduleLabel}</p>
              <Link className="text-link" href="/admin/classes">
                All classes →
              </Link>
            </>
          ) : (
            <p>No upcoming classes in the catalog.</p>
          )}
        </section>
        <section className="admin-card">
          <p className="eyebrow">Shop hours</p>
          {hours.map((row) => (
            <p key={row.days}>
              {row.days}
              <br />
              <strong>{row.time}</strong>
            </p>
          ))}
          <Link className="text-link" href="/admin/visit">
            Visit details →
          </Link>
        </section>
        <section className="admin-card">
          <p className="eyebrow">Public site</p>
          <h2>{site.name}</h2>
          <p>{site.address}<br />{site.city}</p>
          <a className="text-link" href="/" target="_blank" rel="noreferrer">
            Open storefront →
          </a>
        </section>
      </div>
    </>
  );
}
