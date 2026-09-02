import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { getGardenContent } from "@/lib/admin/content";

export const metadata: Metadata = {
  title: "Visit the Shop",
  description: "Visit The Candle Garden in Atlantic Beach or get in touch about candles and classes.",
};

export default async function ContactPage() {
  const content = await getGardenContent();
  const phoneHref = `+${content.phone.replace(/\D/g, "")}`;
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
          <h2>{content.address}<br />{content.city}</h2>
          <a className="button button-light" href={content.mapUrl} target="_blank" rel="noreferrer">Get directions</a>
        </div>
        <div className="contact-card">
          <p className="eyebrow">Hours</p>
          {content.hours.map((row) => <p className="hours-row" key={row.days}><span>{row.days}</span><strong>{row.time}</strong></p>)}
        </div>
        <div className="contact-card">
          <p className="eyebrow">Talk to us</p>
          <a className="contact-link" href={`tel:${phoneHref}`}>{content.phone}</a>
          <a className="contact-link" href={`mailto:${content.email}`}>{content.email}</a>
          <p>Questions about a custom candle, private class, or wholesale order? Jordan is happy to help.</p>
        </div>
        <div className="contact-card lavender-card">
          <p className="eyebrow">Follow the garden</p>
          <h2>New pours, plant drops, and class dates.</h2>
          <div className="button-row"><a className="button button-dark" href={content.instagram} target="_blank" rel="noreferrer">Instagram</a><a className="button button-outline" href={content.facebook} target="_blank" rel="noreferrer">Facebook</a></div>
        </div>
        <div className="contact-card">
          <ContactForm />
        </div>
      </section>
    </>
  );
}
