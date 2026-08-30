import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Our Story",
  description: "The story behind The Candle Garden and its flying pig.",
};

export default function StoryPage() {
  return (
    <>
      <section className="page-hero story-hero">
        <div className="page-shell story-title">
          <p className="eyebrow">Our story</p>
          <h1>From a kitchen spark<br /><em>to a garden of possibility.</em></h1>
        </div>
        <Image src={site.logo} width={230} height={230} alt="The Candle Garden flying pig" />
      </section>
      <section className="story-body page-shell section-pad">
        <div className="story-quote">“We don’t just pour candles; we pour heart, stories, and a little bit of ‘anything is possible’ into each one.”</div>
        <div className="story-columns">
          <div>
            <p>The Candle Garden began in Jordan’s kitchen more than ten years ago—with curiosity, determination, and a love for making everyday spaces feel warmer.</p>
            <p>What started with hand-poured candles grew into an Atlantic Beach shop filled with small-batch scents, beautiful plants, and classes where friends can slow down and create together.</p>
          </div>
          <div>
            <p>The flying pig was drawn by Jordan’s husband. It became the perfect mark for the business: a playful reminder that the things people call impossible are often just waiting for someone to begin.</p>
            <p>Every candle is still made with that same hands-on care—and every person who walks through the door becomes part of the story.</p>
          </div>
        </div>
        <div className="center-cta"><Link className="button button-dark" href="/shop">Find your candle</Link></div>
      </section>
    </>
  );
}
