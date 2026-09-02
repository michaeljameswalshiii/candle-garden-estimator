import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getGardenContent } from "@/lib/admin/content";
import { getPhotos } from "@/lib/admin/photos";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Our Story",
  description: "The story behind The Candle Garden and its flying pig.",
};

export default async function StoryPage() {
  const [content, photos] = await Promise.all([getGardenContent(), getPhotos()]);
  return (
    <>
      <section className="page-hero story-hero">
        <div className="page-shell story-title">
          <p className="eyebrow">Our story</p>
          <h1>From a kitchen spark<br /><em>to a garden of possibility.</em></h1>
        </div>
        <Image src={photos.about || site.logo} width={230} height={230} alt={photos.aboutAlt || "The Candle Garden flying pig"} unoptimized={!String(photos.about || site.logo).includes("squarespace-cdn.com")} />
      </section>
      <section className="story-body page-shell section-pad">
        <div className="story-quote">“{content.aboutQuote}”</div>
        <div className="story-columns">
          <div>
            <p>{content.aboutLeft}</p>
          </div>
          <div>
            <p>{content.aboutRight}</p>
          </div>
        </div>
        <div className="center-cta"><Link className="button button-dark" href="/shop">Find your candle</Link></div>
      </section>
    </>
  );
}
