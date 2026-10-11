import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, MessageCircle, Lightbulb } from "lucide-react";
import { listOffersForUser } from "@/lib/offers";
import { serializeOfferSummary, type SerializedOfferSummary } from "@/lib/offers/serialize";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; badge: string }> = {
  PENDING: { label: "Pending", badge: "bg-[#f3e9df] text-[#5f4437]" },
  COUNTERED: { label: "Countered", badge: "bg-[#e3d2c4] text-[#5f4437]" },
  ACCEPTED: { label: "Accepted", badge: "bg-[#dcebdc] text-[#3f6b47]" },
  REJECTED: { label: "Declined", badge: "bg-[#f0e2e2] text-[#9a5a5a]" },
  EXPIRED: { label: "Expired", badge: "bg-[#ece7e2] text-[#8a8078]" },
  WITHDRAWN: { label: "Withdrawn", badge: "bg-[#ece7e2] text-[#8a8078]" },
  COMPLETED: { label: "Purchased", badge: "bg-[#dcebdc] text-[#3f6b47]" },
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

type Tile = { offer: SerializedOfferSummary; count: number };

/** Collapse repeat attempts (same item + same buyer) into one tile showing the latest. */
function consolidate(offers: SerializedOfferSummary[]): Tile[] {
  const groups = new Map<string, Tile>();
  for (const o of offers) {
    const key = `${o.listing.id}:${o.buyerId}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { offer: o, count: 1 });
    else {
      g.count += 1;
      if (o.updatedAt > g.offer.updatedAt) g.offer = o;
    }
  }
  return [...groups.values()].sort((a, b) => (a.offer.updatedAt < b.offer.updatedAt ? 1 : -1));
}

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { tab } = await searchParams;
  const role = tab === "selling" ? "SELLER" : "BUYER";

  const [buyingRows, sellingRows] = await Promise.all([
    listOffersForUser(userId, "BUYER"),
    listOffersForUser(userId, "SELLER"),
  ]);
  // One tile per (item, buyer): a buyer who re-offers on the same item after a
  // rejection/expiry creates a new offer row each time, so collapse those into
  // a single tile showing the latest attempt (the thread merges the history).
  const buyingTiles = consolidate(buyingRows.map((o) => serializeOfferSummary(o, userId)));
  const sellingTiles = consolidate(sellingRows.map((o) => serializeOfferSummary(o, userId)));
  const tiles = role === "BUYER" ? buyingTiles : sellingTiles;

  return (
    <div className="mx-auto min-h-screen w-full max-w-[720px] px-4 py-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Account
      </Link>
      <h1 className="mt-2 font-serif text-[34px] leading-none text-foreground">My Offers</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">Manage your offers and stay updated</p>

      <div className="mt-5 flex gap-2">
        <TabLink active={role === "BUYER"} href="/offers" label={`Buying (${buyingTiles.length})`} />
        <TabLink active={role === "SELLER"} href="/offers?tab=selling" label={`Selling (${sellingTiles.length})`} />
      </div>

      {tiles.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-sm text-muted-foreground">
            {role === "BUYER" ? "You haven't made any offers yet." : "No offers on your listings yet."}
          </p>
          {role === "BUYER" && (
            <Link href="/browse" className="mt-4 inline-block rounded-full bg-[#2f2925] px-5 py-2.5 text-sm font-medium text-white">
              Browse items
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {tiles.map((t) => (
            <OfferCard key={t.offer.id} offer={t.offer} attemptCount={t.count} role={role} />
          ))}
        </div>
      )}

      {tiles.length > 0 && (
        <div className="mt-5 flex items-center gap-4 rounded-[20px] border border-border/70 bg-card px-5 py-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f3e9df] text-[#5f4437]">
            <Lightbulb className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-lg text-foreground">
              {role === "SELLER" ? "Responding to offers" : "Tips for a successful offer"}
            </p>
            <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
              {role === "SELLER"
                ? "You have 48 hours to accept, counter, or decline each offer. The buyer is notified of your decision."
                : "Sellers have 48 hours to respond to your offer. You'll get a notification when there's an update."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function TabLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-6 py-2.5 text-sm font-medium transition ${active ? "bg-[#4a3328] text-white" : "border border-border bg-card text-foreground hover:bg-muted"}`}
    >
      {label}
    </Link>
  );
}

function OfferCard({ offer: o, role, attemptCount }: { offer: SerializedOfferSummary; role: "BUYER" | "SELLER"; attemptCount: number }) {
  const s = STATUS[o.status] ?? { label: o.status, badge: "bg-[#ece7e2] text-[#8a8078]" };

  return (
    <div className="overflow-hidden rounded-[22px] border border-border/70 bg-card shadow-[0_14px_36px_rgba(110,82,63,0.06)]">
      <div className="flex gap-0">
        {/* Image */}
        <div className="relative m-3 aspect-[3/4] w-[38%] shrink-0 overflow-hidden rounded-[16px] bg-muted">
          {o.listing.imageUrl && (
            <Image src={o.listing.imageUrl} alt={o.listing.title} fill className="object-cover object-center" sizes="(max-width: 720px) 40vw, 280px" />
          )}
        </div>

        {/* Details */}
        <div className="flex min-w-0 flex-1 flex-col py-3 pr-3">
          <Link href={`/offers/${o.id}`} className="min-w-0">
            <h3 className="truncate font-serif text-[22px] leading-tight text-foreground">{o.listing.title}</h3>
            <p className="mt-1 text-[22px] font-bold leading-none text-[#4a3328]">${o.currentAmount?.toFixed(2)}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Asking ${o.listing.price?.toFixed(2)}</p>
            {role === "SELLER" && o.buyerName && (
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">from {o.buyerName}</p>
            )}
          </Link>

          <div className="my-3 h-px bg-border/70" />

          <div className="flex items-stretch gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Offer status</p>
              <p className="truncate text-sm text-foreground">
                {s.label}
                {attemptCount > 1 && <span className="text-muted-foreground"> · {attemptCount} attempts</span>}
              </p>
            </div>
            <div className="w-px bg-border/70" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Offered on</p>
              <p className="truncate text-sm text-foreground">{fmtDate(o.createdAt)}</p>
            </div>
          </div>

          <Link
            href={`/offers/${o.id}`}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-full border border-border bg-[#faf6f2] py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            <MessageCircle className="h-4 w-4" /> View Details
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
