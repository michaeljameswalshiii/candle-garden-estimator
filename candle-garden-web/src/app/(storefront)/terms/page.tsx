import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms",
  description: "How orders and member accounts work in The Candle Garden app.",
};

export default function TermsPage() {
  return (
    <article className="page-shell narrow section-pad legal-copy">
      <p className="eyebrow">The Candle Garden</p>
      <h1>Terms</h1>
      <p>
        Orders placed in the app are sales by The Candle Garden. The price, shipping choice, and
        class details shown before you pay are the ones that apply to that order.
      </p>
      <p>
        A member account keeps your contact details and order history together. You can still
        check out as a guest. Checkout for a member uses the email and phone saved on the account.
        You can change the shipping address before you pay.
      </p>
      <p>
        A photo you submit for a refill estimate is used for that estimate. Follow the candle-care
        instructions that come with your order.
      </p>
      <p>
        The app is provided by Triple I Business Solutions for The Candle Garden. If the app
        misbehaves, use Contact us.
        Questions about a candle, a class, or a delivery go to the shop.
      </p>
    </article>
  );
}
