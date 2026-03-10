import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import SellPageClient from "./SellPageClient";

export default async function SellPage() {
    const session = await auth();

    // If logged-out user clicks Sell, redirect them to login/signup
    if (!session?.user?.id) {
        redirect("/login?callbackUrl=/sell");
    }

    // Check user's latest seller status from the database
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { seller_enabled: true }
    });

    if (!user) {
        redirect("/login?callbackUrl=/sell");
    }

    return (
        <SellPageClient isSellerInitially={user.seller_enabled} />
    );
}
