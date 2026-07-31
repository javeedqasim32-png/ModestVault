// File-based robots.txt. Next.js serves this at /robots.txt. Rules
// mirror what should be indexable — every public page is allowed;
// buyer-private + admin + API surfaces are blocked.

import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                disallow: [
                    // Admin console — never indexable.
                    "/admin/",
                    // Auth flows and dashboards behind login.
                    "/login",
                    "/signup",
                    "/dashboard/",
                    // Buyer-private surfaces. Cart / checkout / notifications
                    // don't have canonical public content.
                    "/cart",
                    "/buy/",
                    "/messages/",
                    "/notifications",
                    "/favorites",
                    // API + internal endpoints.
                    "/api/",
                    // Unsubscribe / preferences links are per-user tokens.
                    "/unsubscribe/",
                    // Promotion approval links are per-seller tokens.
                    "/promotions/",
                ],
            },
        ],
        sitemap: absoluteUrl("/sitemap.xml"),
    };
}
