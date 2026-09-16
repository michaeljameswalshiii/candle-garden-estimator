import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Account deletion",
  description: "How to delete a Candle Garden App account.",
};

export default function DataDeletionPage() {
  return (
    <>
      <section className="page-hero legal-hero">
        <div className="page-shell narrow">
          <p className="eyebrow">The Candle Garden App</p>
          <h1>Account deletion</h1>
          <p>Permanent URL for App Store and Google Play review</p>
        </div>
      </section>
      <article className="legal-page page-shell narrow section-pad">
        <p>
          You can delete your Candle Garden App account at any time from{" "}
          <strong>Profile → Delete account</strong>. The app asks for two confirmations, then
          removes the authentication account.
        </p>
        <p>
          Order and transaction records may be retained as required for accounting, fraud
          prevention, dispute resolution, and legal compliance. Deleting the app account does
          not automatically cancel a Squarespace or Acuity class booking.
        </p>
        <p>
          To request deletion by email instead, write to{" "}
          <a href="mailto:jordan@thecandlegarden.co">jordan@thecandlegarden.co</a> from the
          address on the account.
        </p>
        <p>
          <Link href="/privacy">Privacy Policy</Link>
        </p>
      </article>
    </>
  );
}
