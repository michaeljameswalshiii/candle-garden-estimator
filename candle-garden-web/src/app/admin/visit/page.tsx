import { hours, site } from "@/lib/site";

export default function AdminVisitPage() {
  return (
    <>
      <p className="eyebrow">Visit</p>
      <h1>Shop details</h1>
      <p className="admin-lede">
        Contact, hours, and socials used on the public Vercel site.
      </p>
      <div className="admin-grid">
        <section className="admin-card">
          <p className="eyebrow">Address</p>
          <h2>{site.address}</h2>
          <p>{site.city}</p>
          <a className="text-link" href={site.mapUrl} target="_blank" rel="noreferrer">
            Open map →
          </a>
        </section>
        <section className="admin-card">
          <p className="eyebrow">Hours</p>
          {hours.map((row) => (
            <div className="hours-row" key={row.days}>
              <span>{row.days}</span>
              <strong>{row.time}</strong>
            </div>
          ))}
        </section>
        <section className="admin-card">
          <p className="eyebrow">Say hello</p>
          <p>
            <a href={`tel:${site.phoneHref}`}>{site.phone}</a>
            <br />
            <a href={`mailto:${site.email}`}>{site.email}</a>
          </p>
          <p>
            <a href={site.instagram} target="_blank" rel="noreferrer">
              Instagram
            </a>
            <br />
            <a href={site.facebook} target="_blank" rel="noreferrer">
              Facebook
            </a>
          </p>
        </section>
      </div>
    </>
  );
}
