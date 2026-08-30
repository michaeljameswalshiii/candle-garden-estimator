import type { Metadata } from "next";
import { hours, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Visit the Shop",
  description: "Visit The Candle Garden in Atlantic Beach or get in touch about candles and classes.",
};

export default function ContactPage() {
  return (
    <>
      <section className="page-hero contact-hero">
        <div className="page-shell narrow">
          <p className="eyebrow light">Come wander in</p>
          <h1>We saved you a spot<br /><em>in the garden.</em></h1>
          <p>Smell every candle, find a new plant friend, and ask us anything. We’d love to see you.</p>
        </div>
      </section>
      <section className="contact-grid page-shell section-pad">
        <div className="contact-card primary-contact-card">
          <p className="eyebrow light">The shop</p>
          <h2>{site.address}<br />{site.city}</h2>
          <a className="button button-light" href={site.mapUrl} target="_blank" rel="noreferrer">Get directions</a>
        </div>
        <div className="contact-card">
          <p className="eyebrow">Hours</p>
          {hours.map((row) => <p className="hours-row" key={row.days}><span>{row.days}</span><strong>{row.time}</strong></p>)}
        </div>
        <div className="contact-card">
          <p className="eyebrow">Talk to us</p>
          <a className="contact-link" href={`tel:${site.phoneHref}`}>{site.phone}</a>
          <a className="contact-link" href={`mailto:${site.email}`}>{site.email}</a>
          <p>Questions about a custom candle, private class, or wholesale order? Jordan is happy to help.</p>
        </div>
        <div className="contact-card lavender-card">
          <p className="eyebrow">Follow the garden</p>
          <h2>New pours, plant drops, and class dates.</h2>
          <div className="button-row"><a className="button button-dark" href={site.instagram} target="_blank" rel="noreferrer">Instagram</a><a className="button button-outline" href={site.facebook} target="_blank" rel="noreferrer">Facebook</a></div>
        </div>
      </section>
    </>
  );
}
