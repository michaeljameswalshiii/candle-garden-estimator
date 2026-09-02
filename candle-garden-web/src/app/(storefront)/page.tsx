import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { featuredProducts, upcomingClasses } from "@/lib/catalog";
import { site } from "@/lib/site";

const classImage =
  "https://images.squarespace-cdn.com/content/v1/65fae805de7d9316f58ac65f/7b332a48-a942-49b2-9557-e11f6a2039ec/CandleGardenSummer2025-44.jpg";

export default function Home() {
  const nextClass = upcomingClasses()[0];

  return (
    <>
      <section className="hero">
        <Image src={site.hero} alt="The Candle Garden storefront in Atlantic Beach" fill priority sizes="100vw" />
        <div className="hero-shade" />
        <div className="hero-content page-shell">
          <p className="eyebrow light">Hand-poured in Atlantic Beach</p>
          <h1>Candles with heart.<br /><em>Plants with personality.</em></h1>
          <p className="hero-lede">Small-batch soy candles, happy house plants, and creative classes made for gathering.</p>
          <div className="button-row">
            <Link className="button button-light" href="/shop">Shop candles</Link>
            <Link className="button button-outline-light" href="/classes">Book a class</Link>
          </div>
        </div>
        <div className="hero-note">From my hands, to your home.</div>
      </section>

      <section className="value-strip" aria-label="What makes our candles special">
        <span>100% soy wax</span><span>Woman-owned</span><span>Hand-poured</span><span>Made by the beach</span>
      </section>

      <section className="intro page-shell section-pad">
        <div>
          <p className="eyebrow">Welcome to the garden</p>
          <h2>A little shop full of really good smells and really happy things.</h2>
        </div>
        <div className="intro-copy">
          <p>Every candle is poured in small batches with clean-burning soy wax and a whole lot of care. Come find your new signature scent, pick out a plant, or make something beautiful with us.</p>
          <Link className="text-link" href="/our-story">Meet the maker <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section className="soft-section section-pad">
        <div className="page-shell">
          <div className="section-heading">
            <div><p className="eyebrow">Light something lovely</p><h2>Current favorites</h2></div>
            <Link className="text-link desktop-link" href="/shop">Shop all candles <span aria-hidden="true">→</span></Link>
          </div>
          <div className="product-grid">
            {featuredProducts.map((product) => <ProductCard product={product} key={product.id} />)}
          </div>
          <Link className="button button-dark mobile-only-button" href="/shop">Shop all candles</Link>
        </div>
      </section>

      <section className="class-feature page-shell section-pad">
        <div className="class-photo">
          <Image src={classImage} alt="Friends making candles together at The Candle Garden" fill sizes="(max-width: 800px) 100vw, 52vw" />
          <div className="scribble">pour · mix · laugh</div>
        </div>
        <div className="class-copy">
          <p className="eyebrow">Make your own</p>
          <h2>Have you booked your <em>candle class?</em></h2>
          <p>Choose your scent, mix your wax, and pour two soy candles while learning the process step by step. Bring your favorite people—and your favorite bottle.</p>
          {nextClass ? <p className="next-date"><span>Next opening</span>{nextClass.scheduleLabel}</p> : null}
          <Link className="button button-dark" href="/classes">See class dates</Link>
        </div>
      </section>

      <section className="story-banner section-pad">
        <div className="page-shell story-banner-inner">
          <Image src={site.logo} width={160} height={160} alt="The flying pig logo" />
          <div>
            <p className="eyebrow light">Why the flying pig?</p>
            <h2>Because the best things begin when someone says, “when pigs fly.”</h2>
            <p>The logo is our reminder that with passion, determination, and a little joy, anything is possible.</p>
            <Link className="text-link light-link" href="/our-story">Read Jordan’s story <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>

      <section className="app-callout page-shell section-pad">
        <div className="app-card">
          <div>
            <p className="eyebrow">Your favorite vessel, renewed</p>
            <h2>Keep the jar. Refill the joy.</h2>
            <p>Our Candle Garden app helps estimate a refill from a photo, choose a scent, and start a refill order from home.</p>
          </div>
          <div className="phone-mock" aria-label="Preview of The Candle Garden app">
            <Image src={site.logo} width={70} height={70} alt="" />
            <strong>The Candle Garden</strong>
            <span>Snap. Estimate. Refill.</span>
            <span className="mock-button">Open the app</span>
          </div>
        </div>
      </section>

      <section className="visit-callout">
        <div className="page-shell visit-inner">
          <div><p className="eyebrow light">Come see us</p><h2>Your neighborhood candle garden.</h2></div>
          <div><p>{site.address}<br />{site.city}</p><a className="button button-light" href={site.mapUrl} target="_blank" rel="noreferrer">Get directions</a></div>
        </div>
      </section>
    </>
  );
}
