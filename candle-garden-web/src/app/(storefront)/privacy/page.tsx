import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What The Candle Garden app and website collect, and how to ask a question.",
};

export default function PrivacyPage() {
  return (
    <article className="page-shell narrow section-pad legal-copy">
      <p className="eyebrow">The Candle Garden</p>
      <h1>Privacy</h1>
      <p>
        This notice describes the Candle Garden app and this website. The shop is The Candle Garden.
        The app is built and supported by Triple I Business Solutions.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Name, email, phone, and mailing address when you become a member or check out.</li>
        <li>Order details, including the items and the shipping address you enter.</li>
        <li>Payment is processed by Stripe. The app does not store your card number.</li>
        <li>If you use Sign in with Apple, Apple shares the name and email you approve.</li>
        <li>If you photograph a vessel for a refill estimate, that photo is used for the estimate.</li>
        <li>If you turn on order alerts, we store a notification token for that device.</li>
        <li>If you opt in, we email Candle Garden news. You can turn that off in Account.</li>
      </ul>
      <h2>How it is used</h2>
      <p>
        We use this information to create your account, complete an order, send the receipt, and
        contact you about that order. Sign-in is handled by Amazon Cognito. Shipping labels go
        through the carrier chosen at checkout.
      </p>
      <h2>Your choices</h2>
      <p>
        You can update your phone, address, and email preference in Account. You can delete the
        account from the same screen. Deleting the account removes the login. Records of a
        completed sale may be kept for the shop’s order history.
      </p>
      <h2>Questions</h2>
      <p>
        A problem with the app goes through Contact us.
        A question about a candle, a class, or a delivery goes to the shop from the Visit page.
      </p>
      <p>This notice describes the current app and website. It is not legal advice.</p>
    </article>
  );
}
