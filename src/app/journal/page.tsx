// Journal index page — lists every published article. Server component
// that reads the article files at build/revalidate time. Editorial /
// long-tail-keyword content that supports the ecommerce SEO strategy.

import Link from "next/link";
import Image from "next/image";
import { listArticles } from "@/lib/journal";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { JsonLd, breadcrumbJsonLd } from "@/lib/seo/json-ld";

export const revalidate = 3600; // Journal changes infrequently

export const metadata = buildPageMetadata({
    title: "The Modaire Journal",
    description:
        "Guides, stories, and editorial notes from Modaire — the modest fashion marketplace. Modest wear styling tips, seller spotlights, and buyer guides for preloved abayas, kaftans, and Pakistani bridal wear.",
    path: "/journal",
});

export default async function JournalIndex() {
    const articles = await listArticles();

    return (
        <>
            <JsonLd
                data={breadcrumbJsonLd([
                    { name: "Home", path: "/" },
                    { name: "Journal", path: "/journal" },
                ])}
            />

            <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
                <header className="text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8a7667]">
                        The Modaire Journal
                    </p>
                    <h1 className="mt-3 font-serif text-3xl leading-tight text-foreground sm:text-4xl">
                        Notes on modest fashion
                    </h1>
                    <p className="mx-auto mt-4 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
                        Buyer guides, seller spotlights, and styling notes from our community.
                    </p>
                </header>

                {articles.length === 0 ? (
                    <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
                        <p className="text-sm text-muted-foreground">
                            No articles yet. Check back soon.
                        </p>
                    </div>
                ) : (
                    <ul className="mt-12 divide-y divide-border/60 border-y border-border/60">
                        {articles.map((article) => (
                            <li key={article.slug}>
                                <Link
                                    href={`/journal/${article.slug}`}
                                    className="group flex gap-5 py-6 sm:py-8"
                                >
                                    {article.image ? (
                                        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#f2ebe4] sm:h-32 sm:w-32">
                                            <Image
                                                src={article.image}
                                                alt={article.title}
                                                fill
                                                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                                                sizes="(min-width: 640px) 128px, 96px"
                                            />
                                        </div>
                                    ) : null}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a7667]">
                                            {new Date(article.publishedAt).toLocaleDateString(undefined, {
                                                year: "numeric",
                                                month: "long",
                                                day: "numeric",
                                            })}
                                        </p>
                                        <h2 className="mt-2 font-serif text-xl leading-snug text-foreground group-hover:text-primary sm:text-2xl">
                                            {article.title}
                                        </h2>
                                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground sm:mt-3">
                                            {article.description}
                                        </p>
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </>
    );
}
