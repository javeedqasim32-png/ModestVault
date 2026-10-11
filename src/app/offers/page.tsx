import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { listOffersForUser } from "@/lib/offers";
import { serializeOfferSummary, type SerializedOfferSummary } from "@/lib/offers/serialize";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  COUNTERED: "Countered",
  ACCEPTED: "Accepted",
  REJECTED: "Declined",
  EXPIRED: "Expired",
  WITHDRAWN: "Withdrawn",
  COMPLETED: "Purchased",
};

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { tab } = await searchParams;
  const role = tab === "selling" ? "SELLER" : "BUYER";

  const rows = await listOffersForUser(userId, role);
  const offers = rows.map((o) => serializeOfferSummary(o, userId));

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <h1 className="text-xl font-semibold text-[#2f2925]">Offers</h1>

      <div className="mt-4 flex gap-2">
        <TabLink active={role === "BUYER"} href="/offers" label="Buying" />
        <TabLink active={role === "SELLER"} href="/offers?tab=selling" label="Selling" />
      </div>

      {offers.length === 0 ? (
        <p className="mt-10 text-center text-sm text-[#7a6f66]">
          {role === "BUYER" ? "You haven't made any offers yet." : "No offers on your listings yet."}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {offers.map((o) => (
            <OfferRow key={o.id} offer={o} role={role} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TabLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-1.5 text-sm ${active ? "bg-[#2f2925] text-white" : "border border-[#ddd3cb] text-[#2f2925]"}`}
    >
      {label}
    </Link>
  );
}

function OfferRow({ offer: o, role }: { offer: SerializedOfferSummary; role: "BUYER" | "SELLER" }) {
  const waiting = o.status === "PENDING" || o.status === "COUNTERED";
  const yourTurn = waiting && o.currentTurn === role;
  return (
    <li>
      <Link href={`/offers/${o.id}`} className="flex items-center gap-3 rounded-xl border border-[#eadfd6] bg-white p-3 hover:border-[#2f2925]">
        {o.listing.imageUrl && (
          <Image src={o.listing.imageUrl} alt={o.listing.title} width={56} height={56} className="h-14 w-14 rounded-lg object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[#2f2925]">{o.listing.title}</p>
          <p className="text-sm text-[#7a6f66]">
            ${o.currentAmount?.toFixed(2)} · {STATUS_LABEL[o.status] ?? o.status}
            {role === "SELLER" && o.buyerName ? ` · ${o.buyerName}` : ""}
          </p>
        </div>
        {yourTurn && <span className="rounded-full bg-[#2f2925] px-2 py-1 text-[10px] font-medium text-white">Your turn</span>}
      </Link>
    </li>
  );
}
