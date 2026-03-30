import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { markConversationRead, sendConversationMessage } from "@/app/actions/messages";

export const dynamic = "force-dynamic";

function formatMessageTime(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect(`/login?callbackUrl=/messages/${id}`);
  }

  const conversationDelegate = (prisma as unknown as {
    conversation?: {
      findUnique: (args: unknown) => Promise<any>;
    };
  }).conversation;

  if (!conversationDelegate) {
    return (
      <div className="min-h-screen bg-[#EFE7DE] pb-24">
        <div className="mx-auto w-full max-w-[820px] px-4 py-5">
          <div className="rounded-[14px] border border-[#ddd3cb] bg-[#f7f2ed] px-5 py-8 text-[14px] text-[#8a7667]">
            Messaging will be available after the latest migration is applied.
          </div>
        </div>
      </div>
    );
  }

  const conversation = await conversationDelegate.findUnique({
    where: { id },
    include: {
      buyer: { select: { id: true, first_name: true, last_name: true } },
      seller: { select: { id: true, first_name: true, last_name: true } },
      listing: { select: { id: true, title: true } },
      messages: {
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          body: true,
          created_at: true,
          sender_id: true,
          sender: { select: { first_name: true, last_name: true } },
        },
      },
    },
  });

  if (!conversation) notFound();

  const isParticipant = conversation.buyer_id === userId || conversation.seller_id === userId;
  if (!isParticipant) notFound();

  await markConversationRead(conversation.id);

  const otherUser = conversation.buyer_id === userId ? conversation.seller : conversation.buyer;
  const otherName = `${otherUser.first_name} ${otherUser.last_name?.[0] ? `${otherUser.last_name[0].toUpperCase()}.` : ""}`.trim();

  return (
    <div className="min-h-screen bg-[#EFE7DE] pb-28">
      <div className="mx-auto w-full max-w-[820px] px-4 py-4">
        <Link href="/messages" className="text-[12px] text-[#8a7667] hover:text-[#2f2925]">
          Back to messages
        </Link>

        <div className="mt-2 rounded-[14px] border border-[#ddd3cb] bg-[#fbf8f5] px-4 py-3">
          <p className="text-[16px] font-semibold text-[#2f2925]">{otherName}</p>
          {conversation.listing?.title ? (
            <p className="mt-0.5 text-[12px] text-[#8a7667]">About: {conversation.listing.title}</p>
          ) : null}
        </div>

        <div className="mt-3 space-y-2">
          {conversation.messages.length === 0 ? (
            <div className="rounded-[14px] border border-[#ddd3cb] bg-[#f7f2ed] px-4 py-6 text-[13px] text-[#8a7667]">
              Start the conversation.
            </div>
          ) : (
            conversation.messages.map((message: {
              id: string;
              body: string;
              created_at: Date;
              sender_id: string;
              sender: { first_name: string; last_name: string | null };
            }) => {
              const mine = message.sender_id === userId;
              const senderName = `${message.sender.first_name} ${message.sender.last_name?.[0] ? `${message.sender.last_name[0].toUpperCase()}.` : ""}`.trim();
              return (
                <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[86%] rounded-[14px] border px-3 py-2 ${mine ? "border-[#a07c61] bg-[#a07c61] text-white" : "border-[#ddd3cb] bg-[#fbf8f5] text-[#2f2925]"}`}>
                    <p className={`text-[11px] ${mine ? "text-white/85" : "text-[#8a7667]"}`}>{senderName}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[14px]">{message.body}</p>
                    <p className={`mt-1 text-[11px] ${mine ? "text-white/85" : "text-[#8a7667]"}`}>{formatMessageTime(message.created_at)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[78px] z-[70] border-t border-[#ddd3cb] bg-[#fbf8f5]/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-[#fbf8f5]/80 md:bottom-0">
        <div className="mx-auto w-full max-w-[820px]">
          <form
            action={async (formData) => {
              "use server";
              const body = String(formData.get("body") || "");
              await sendConversationMessage({ conversationId: conversation.id, body });
            }}
            className="flex items-center gap-2"
          >
            <input
              name="body"
              placeholder="Type your message"
              className="h-11 flex-1 rounded-full border border-[#ddd3cb] bg-white px-4 text-[14px] text-[#2f2925] placeholder:text-[#8a7667] focus:outline-none"
              maxLength={1000}
              required
            />
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-full border border-[#a07c61] bg-[#a07c61] px-5 text-[14px] font-medium text-white"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
