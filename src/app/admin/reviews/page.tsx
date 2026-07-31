import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AdminReviewsClient from "./AdminReviewsClient";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage() {
    const session = await auth();
    if (!session?.user?.id) redirect("/login?callbackUrl=/admin/reviews");

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { is_admin: true },
    });
    if (!user?.is_admin) redirect("/");

    const rows = await (prisma as any).siteReview.findMany({
        orderBy: { created_at: "desc" },
        include: {
            user: {
                select: {
                    first_name: true,
                    last_name: true,
                    email: true,
                },
            },
        },
    });

    const formatted = rows.map((r: any) => ({
        id: r.id,
        rating: r.rating,
        body: r.body,
        status: r.status,
        hidden_at: r.hidden_at ? r.hidden_at.toISOString() : null,
        hidden_reason: r.hidden_reason,
        created_at: r.created_at.toISOString(),
        reviewer_name: `${r.user?.first_name ?? ""} ${r.user?.last_name ?? ""}`.trim() || "Anonymous",
        reviewer_email: r.user?.email ?? "",
    }));

    return (
        <div className="mt-4">
            <h1 className="font-serif text-3xl font-bold text-foreground mb-2">Site Reviews</h1>
            <p className="mb-8 text-sm text-muted-foreground">
                Buyer + seller reviews of Modaire. Auto-published on submission &mdash; hide anything abusive or spam.
            </p>
            <AdminReviewsClient initialReviews={formatted} />
        </div>
    );
}
