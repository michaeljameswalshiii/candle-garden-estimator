import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms of Use for The Candle Garden App.",
};

export default function TermsPage() {
  return (
    <>
      <section className="page-hero legal-hero">
        <div className="page-shell narrow">
          <p className="eyebrow">The Candle Garden App</p>
          <h1>Terms of Use</h1>
          <p>Effective September 16, 2026</p>
        </div>
      </section>
      <article className="legal-page page-shell narrow section-pad">
        <p>
          By using The Candle Garden App, you agree to provide accurate account, payment,
          and shipping information and to use the app only for lawful purposes.
        </p>

        <h2>Estimates and orders</h2>
        <p>
          Photo-based candle-volume estimates are approximate. Final refill pricing,
          shipping charges, availability, and fulfillment details shown at checkout control
          the order. Orders are subject to payment authorization and acceptance.
        </p>

        <h2>Classes and purchases</h2>
        <p>
          Candle classes, cancellations, returns, and other purchases are subject to the
          policies presented with the applicable product or booking.
        </p>

        <h2>Acceptable use</h2>
        <p>
          You may not misuse the app, interfere with its operation, attempt unauthorized
          access, or use it in a way that violates applicable law or another person&apos;s rights.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about an order or these terms can be sent to{" "}
          <a href="mailto:jordan@thecandlegarden.co">jordan@thecandlegarden.co</a> or through
          our <Link href="/contact">contact page</Link>.
        </p>
      </article>
    </>
  );
}

