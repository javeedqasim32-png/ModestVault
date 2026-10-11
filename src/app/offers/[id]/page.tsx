import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { getOfferThreadForUser, OfferError } from "@/lib/offers";
import { serializeOfferThread } from "@/lib/offers/serialize";
import OfferThreadClient from "@/components/offers/OfferThreadClient";

export const dynamic = "force-dynamic";

export default async function OfferThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;
  try {
    const thread = await getOfferThreadForUser(session.user.id, id);
    return <OfferThreadClient initial={serializeOfferThread(thread)} />;
  } catch (e) {
    if (e instanceof OfferError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
}
