// Layout-scoped metadata for /policies. The page itself is a client
// component (accordion state) which can't export `metadata`, so the
// server-side layout supplies it. Sub-pages under /policies inherit
// this only if they don't define their own — /terms, /privacy, and
// /sms-policy each have their own metadata in their page.tsx.

import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
    title: "Policies",
    description:
        "Modaire's marketplace policies — terms of service, privacy policy, seller policies, buyer protections, and shipping. Learn how our modest fashion community operates.",
    path: "/policies",
});

export default function PoliciesLayout({ children }: { children: ReactNode }) {
    return <>{children}</>;
}
