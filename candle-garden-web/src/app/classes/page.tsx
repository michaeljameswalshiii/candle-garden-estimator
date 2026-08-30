import type { Metadata } from "next";
import Image from "next/image";
import { cleanText, upcomingClasses } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Candle-Making Classes",
  description: "Book a joyful, hands-on candle-making class in Atlantic Beach, Florida.",
};

export default function ClassesPage() {
  const events = upcomingClasses();
  return (
    <>
      <section className="page-hero dark-hero">
        <div className="page-shell narrow">
          <p className="eyebrow light">Pour something together</p>
          <h1>Candle-making classes<br /><em>for your favorite people.</em></h1>
          <p>Pick a scent, pour two candles, and learn a few fun facts along the way. Classes are relaxed, hands-on, and BYOB.</p>
        </div>
      </section>
      <section className="page-shell section-pad">
        <div className="event-intro">
          <div><p className="eyebrow">Upcoming dates</p><h2>Save your seat</h2></div>
          <p>One seat includes two same-scent 8.5oz soy candles. Candles cool overnight and are ready for pickup the next day.</p>
        </div>
        {events.length ? (
          <div className="event-grid">
            {events.map((event) => (
              <article className="event-card" key={event.id}>
                <div className="event-image">
                  <Image src={event.image} alt="Candle-making class at The Candle Garden" fill sizes="(max-width: 760px) 100vw, 40vw" />
                </div>
                <div className="event-copy">
                  <p className="eyebrow">{event.dateDisplay}</p>
                  <h2>{event.title}</h2>
                  <div className="event-meta"><span>{event.time}</span><span>{event.duration}</span><span>${event.price}</span></div>
                  <p>{cleanText(event.description)}</p>
                  <p className="availability">{event.soldOut ? "Sold out" : `${event.available} seats available`}</p>
                  <a className="button button-dark" href={event.url}>Book this class</a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state"><h2>New dates are coming soon.</h2><p>Follow along on Instagram or contact the shop about a private class.</p></div>
        )}
      </section>
    </>
  );
}
