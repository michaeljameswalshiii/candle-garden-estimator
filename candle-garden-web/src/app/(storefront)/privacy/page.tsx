import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for The Candle Garden App.",
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <section className="page-hero legal-hero">
        <div className="page-shell narrow">
          <p className="eyebrow">The Candle Garden App</p>
          <h1>Privacy Policy</h1>
          <p>Effective September 16, 2026</p>
        </div>
      </section>
      <article className="legal-page page-shell narrow section-pad">
        <p>
          The Candle Garden App uses information you provide to create and manage your
          account, process orders, provide customer support, and prevent fraud.
        </p>

        <h2>Information we use</h2>
        <ul>
          <li>Account information, including your name and email address</li>
          <li>Shipping and contact information supplied during checkout</li>
          <li>Order and purchase history</li>
          <li>A candle-vessel photo when you choose camera or photo-library estimation</li>
          <li>Technical identifiers needed for authentication, security, and service operation</li>
        </ul>
        <p>
          Camera or photo-library access is used only after you choose the corresponding
          feature. You can enter ounces manually instead.
        </p>

        <h2>Service providers</h2>
        <p>
          Stripe processes payment information. UPS receives the information needed to
          calculate shipping rates and create shipping labels. Amazon Cognito provides
          authentication, and Amazon Web Services hosts application infrastructure. These
          providers process information as needed to provide their services.
        </p>
        <p>
          The Candle Garden does not sell your personal information and does not use it for
          cross-app advertising tracking.
        </p>

        <h2>Retention and deletion</h2>
        <p>
          Order and transaction records may be retained as required for accounting, fraud
          prevention, dispute resolution, and legal compliance. You can delete your
          authentication account directly in the app from <strong>Profile → Delete account</strong>.
          The permanent web instructions are on the{" "}
          <Link href="/privacy/data-deletion">account deletion</Link> page.
        </p>

        <h2>Contact</h2>
        <p>
          For privacy questions or data requests, email{" "}
          <a href="mailto:jordan@thecandlegarden.co">jordan@thecandlegarden.co</a> or use our{" "}
          <Link href="/contact">contact page</Link>.
        </p>
      </article>
    </>
  );
}

