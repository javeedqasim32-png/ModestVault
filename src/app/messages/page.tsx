import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatTime(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function MessagesInboxPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login?callbackUrl=/messages");
  }

  const conversationDelegate = (prisma as unknown as {
    conversation?: {
      findMany: (args: unknown) => Promise<any[]>;
    };
  }).conversation;

  if (!conversationDelegate) {
    return (
      <div className="min-h-screen bg-[#EFE7DE] pb-24">
        <div className="mx-auto w-full max-w-[820px] px-4 py-5">
          <h1 className="text-[30px] leading-[1.05] text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}>
            Messages
          </h1>
          <div className="mt-4 rounded-[14px] border border-[#ddd3cb] bg-[#f7f2ed] px-5 py-8 text-[14px] text-[#8a7667]">
            Messaging will be available after the latest migration is applied.
          </div>
        </div>
      </div>
    );
  }

  const conversations = await conversationDelegate.findMany({
    where: {
      OR: [{ buyer_id: userId }, { seller_id: userId }],
    },
    orderBy: { updated_at: "desc" },
    include: {
      buyer: { select: { id: true, first_name: true, last_name: true } },
      seller: { select: { id: true, first_name: true, last_name: true } },
      listing: { select: { id: true, title: true } },
      messages: {
        orderBy: { created_at: "desc" },
        take: 1,
        select: { body: true, created_at: true },
      },
    },
  });

  return (
    <div className="min-h-screen bg-[#EFE7DE] pb-24">
      <div className="mx-auto w-full max-w-[820px] px-4 py-5">
        <h1 className="text-[30px] leading-[1.05] text-[#2f2925]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 600 }}>
          Messages
        </h1>

        {conversations.length === 0 ? (
          <div className="mt-4 rounded-[14px] border border-[#ddd3cb] bg-[#f7f2ed] px-5 py-8 text-[14px] text-[#8a7667]">
            No messages yet.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {conversations.map((conversation) => {
              const otherUser = conversation.buyer_id === userId ? conversation.seller : conversation.buyer;
              const name = `${otherUser.first_name} ${otherUser.last_name?.[0] ? `${otherUser.last_name[0].toUpperCase()}.` : ""}`.trim();
              const latest = conversation.messages[0];

              return (
                <Link
                  key={conversation.id}
                  href={`/messages/${conversation.id}`}
                  className="block rounded-[14px] border border-[#ddd3cb] bg-[#fbf8f5] px-4 py-3 transition hover:bg-[#f6f0ea]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[16px] font-semibold text-[#2f2925]">{name}</p>
                    <span className="text-[12px] text-[#8a7667]">{latest ? formatTime(latest.created_at) : formatTime(conversation.updated_at)}</span>
                  </div>
                  {conversation.listing?.title ? (
                    <p className="mt-0.5 truncate text-[12px] text-[#8a7667]">Re: {conversation.listing.title}</p>
                  ) : null}
                  <p className="mt-1 truncate text-[13px] text-[#6f6054]">{latest?.body || "Open conversation"}</p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
