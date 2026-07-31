// Individual journal article page. Reads the markdown file for the
// slug, renders body HTML, emits Article JsonLd (Schema.org) so Google
// treats the page as authored editorial content — higher-value crawl
// signal than a plain product listing.

import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getArticle, listArticleSlugs } from "@/lib/journal";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { JsonLd, breadcrumbJsonLd } from "@/lib/seo/json-ld";
import { SITE_CONFIG, absoluteUrl } from "@/lib/seo/site";

export const revalidate = 3600;

// Statically render every article at build time — cheap, and every
// article gets a canonical /journal/[slug] URL ready for the sitemap.
export function generateStaticParams() {
    return listArticleSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const article = await getArticle(slug);
    if (!article) {
        return buildPageMetadata({
            title: "Article not found",
            description: "This article isn't available on Modaire.",
            path: `/journal/${slug}`,
        });
    }
    return buildPageMetadata({
        title: article.title,
        description: article.description,
        path: `/journal/${article.slug}`,
        image: article.image,
    });
}

export default async function ArticlePage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const article = await getArticle(slug);
    if (!article) notFound();

    const author = article.author ?? SITE_CONFIG.name;
    const publishedDate = new Date(article.publishedAt);
    const displayDate = publishedDate.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    return (
        <>
            <JsonLd
                data={breadcrumbJsonLd([
                    { name: "Home", path: "/" },
                    { name: "Journal", path: "/journal" },
                    { name: article.title, path: `/journal/${article.slug}` },
                ])}
            />
            {/* Article schema. Tells Google this is authored editorial
                content, which qualifies for Article rich results
                (headline, date, author display in the SERP). */}
            <JsonLd
                data={{
                    "@context": "https://schema.org",
                    "@type": "Article",
                    headline: article.title,
                    description: article.description,
                    datePublished: publishedDate.toISOString(),
                    dateModified: article.updatedAt
                        ? new Date(article.updatedAt).toISOString()
                        : publishedDate.toISOString(),
                    author: { "@type": "Organization", name: author },
                    publisher: {
                        "@type": "Organization",
                        name: SITE_CONFIG.name,
                        logo: {
                            "@type": "ImageObject",
                            url: absoluteUrl("/icon-512.png"),
                        },
                    },
                    ...(article.image ? { image: absoluteUrl(article.image) } : {}),
                    mainEntityOfPage: {
                        "@type": "WebPage",
                        "@id": absoluteUrl(`/journal/${article.slug}`),
                    },
                }}
            />

            <article className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
                <Link
                    href="/journal"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    All articles
                </Link>

                <header className="mt-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8a7667]">
                        The Journal · {displayDate}
                    </p>
                    <h1 className="mt-3 font-serif text-3xl leading-tight text-foreground sm:text-4xl">
                        {article.title}
                    </h1>
                    <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                        {article.description}
                    </p>
                </header>

                {article.image ? (
                    <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-[#f2ebe4]">
                        <Image
                            src={article.image}
                            alt={article.title}
                            fill
                            className="object-cover"
                            sizes="(min-width: 768px) 768px, 100vw"
                            priority
                        />
                    </div>
                ) : null}

                {/* Rendered markdown body. Styles come from prose defaults
                    below — kept minimal so it matches the marketplace's
                    editorial feel rather than a Medium-clone chrome. */}
                <div
                    className="prose prose-neutral mt-10 max-w-none prose-headings:font-serif prose-headings:text-foreground prose-p:text-[15px] prose-p:leading-relaxed prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground"
                    dangerouslySetInnerHTML={{ __html: article.html }}
                />
            </article>
        </>
    );
}
