// Structured-data (Schema.org) JSON-LD builders + a React component that
// serializes a schema object into the <script type="application/ld+json">
// block Google looks for when deciding whether to render rich results
// (price + availability + condition badges) on search listings.
//
// Everything here is server-safe (no client-only APIs) so it can be
// rendered inside Server Components or route layouts.

import { SITE_CONFIG, SITE_URL, absoluteUrl } from "./site";

type JsonLdData = Record<string, unknown> | Array<Record<string, unknown>>;

/**
 * React component that emits a <script type="application/ld+json"> tag
 * with the given schema object. Safe to render multiple times per page
 * (Google reads all of them). We use dangerouslySetInnerHTML because
 * that's the only way to write raw JSON inside a script tag without
 * React escaping the payload.
 */
export function JsonLd({ data }: { data: JsonLdData }) {
    return (
        <script
            type="application/ld+json"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
    );
}

// ─────────────────────────────────────────────────────────────────────
// Schema builders
// ─────────────────────────────────────────────────────────────────────

/**
 * Site-wide OnlineStore schema. Rendered once in layout.tsx so Google
 * knows Modaire is a marketplace, learns the logo/social handles, and
 * can associate every page under this domain with the same entity.
 *
 * When `aggregateRating` is provided (from getReviewAggregate() +
 * AGGREGATE_MIN_COUNT gate), Google can render star ratings next to
 * Modaire in the SERP. Omit the field entirely when below threshold
 * so we don't emit `null`/zero into schema — Google flags missing
 * required nested fields as errors.
 */
export function organizationJsonLd(opts?: {
    aggregateRating?: { average: number; count: number };
}): Record<string, unknown> {
    const base: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "OnlineStore",
        name: SITE_CONFIG.name,
        alternateName: SITE_CONFIG.fullName,
        url: SITE_URL,
        logo: absoluteUrl("/icon-512.png"),
        description: SITE_CONFIG.defaultDescription,
        sameAs: [
            // Add real profile URLs here as they exist.
            // "https://instagram.com/shopmodaire",
            // "https://tiktok.com/@shopmodaire",
        ],
    };
    if (opts?.aggregateRating && opts.aggregateRating.count > 0) {
        base.aggregateRating = {
            "@type": "AggregateRating",
            ratingValue: opts.aggregateRating.average,
            reviewCount: opts.aggregateRating.count,
            bestRating: 5,
            worstRating: 1,
        };
    }
    return base;
}

/**
 * WebSite schema with a SearchAction. Tells Google we have on-site
 * search, which can enable the sitelinks searchbox on the SERP.
 */
export function webSiteJsonLd(): Record<string, unknown> {
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: SITE_CONFIG.name,
        url: SITE_URL,
        potentialAction: {
            "@type": "SearchAction",
            target: {
                "@type": "EntryPoint",
                urlTemplate: `${SITE_URL}/browse?q={search_term_string}`,
            },
            "query-input": "required name=search_term_string",
        },
    };
}

export type ProductJsonLdInput = {
    id: string;
    title: string;
    description: string | null | undefined;
    price: number;
    currency?: string; // defaults to USD
    imageUrls: string[]; // absolute or root-relative; we normalize
    brand?: string | null;
    category?: string | null;
    /** AVAILABLE | SOLD | other */
    status: string;
};

/**
 * Product schema for a single listing. Populates the price + availability
 * + condition fields Google shows as rich results. Marketplace items are
 * always UsedCondition on Modaire (preloved / resale).
 */
export function productJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
    const availability = input.status === "AVAILABLE"
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock";
    return {
        "@context": "https://schema.org",
        "@type": "Product",
        name: input.title,
        description: input.description ?? undefined,
        image: input.imageUrls.map(absoluteUrl),
        sku: input.id,
        ...(input.brand ? { brand: { "@type": "Brand", name: input.brand } } : {}),
        ...(input.category ? { category: input.category } : {}),
        // UsedCondition — every listing on Modaire is preloved / resale.
        // If new-with-tags becomes a distinct flow, branch here.
        itemCondition: "https://schema.org/UsedCondition",
        offers: {
            "@type": "Offer",
            price: input.price.toFixed(2),
            priceCurrency: input.currency ?? "USD",
            availability,
            url: absoluteUrl(`/listings/${input.id}`),
            itemCondition: "https://schema.org/UsedCondition",
        },
    };
}

export type BreadcrumbItem = {
    name: string;
    path: string; // root-relative
};

/**
 * BreadcrumbList schema. Google renders breadcrumbs above the URL in
 * search results, which improves click-through-rate. The `path` on each
 * item is normalized to an absolute URL via absoluteUrl.
 */
export function breadcrumbJsonLd(items: BreadcrumbItem[]): Record<string, unknown> {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: item.name,
            item: absoluteUrl(item.path),
        })),
    };
}
