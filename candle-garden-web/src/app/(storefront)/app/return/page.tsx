"use client";

import { useEffect } from "react";
import Link from "next/link";

const APP_LINK = "candlegarden://orders";

export default function AppReturnPage() {
  useEffect(() => {
    const destination = new URLSearchParams(window.location.search).get("destination");
    const target = destination === "classes" ? "candlegarden://classes" : APP_LINK;
    window.location.replace(target);
  }, []);

  return (
    <section className="page-hero legal-hero">
      <div className="page-shell narrow">
        <p className="eyebrow">Checkout</p>
        <h1>Return to the app</h1>
        <p>
          If the Candle Garden App does not open automatically, go back to it and open the
          Orders tab. Class bookings return to the Classes tab.
        </p>
        <p>
          <a href={APP_LINK}>Open the app</a>
          {" · "}
          <Link href="/shop">Continue shopping on the web</Link>
        </p>
      </div>
    </section>
  );
}
