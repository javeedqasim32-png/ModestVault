import { Fragment } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { markConversationRead, sendConversationMessage } from "@/app/actions/messages";
import ConversationViewportFix from "@/components/messages/ConversationViewportFix";
import MessageComposer from "@/components/messages/MessageComposer";
import UserResponseBadge from "@/components/messages/UserResponseBadge";
import { getUserResponseStat } from "@/lib/user-response";
import { getUserSlugMap } from "@/lib/user-slugs";

export const dynamic = "force-dynamic";

function formatMessageTime(date: Date) {
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const sameYear = date.getFullYear() === now.getFullYear();
  if (sameDay) {
    // e.g., "3:45 PM"
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (sameYear) {
    // e.g., "Jan 15, 3:45 PM"
    return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  // e.g., "Jan 15, 2025, 3:45 PM"
  return date.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: (args: unknown) => Promise<any>;
    };
  }).conversation;

  if (!conversationDelegate) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#EFE7DE] px-4">
        <div className="rounded-[14px] border border-[#ddd3cb] bg-[#f7f2ed] px-5 py-8 text-[14px] text-[#8a7667]">
          Messaging will be available after the latest migration is applied.
        </div>
      </div>
    );
  }

  const conversation = await conversationDelegate.findUnique({
    where: { id },
    include: {
      buyer: { select: { id: true, first_name: true, last_name: true, is_admin: true, profile_image: true } },
      seller: { select: { id: true, first_name: true, last_name: true, is_admin: true, profile_image: true } },
      listing: { select: { id: true, title: true } },
      messages: {
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          body: true,
          image_url: true,
          created_at: true,
          read_at: true,
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
  // Support thread = the other party is admin AND there's no listing context.
  const isSupportThread = Boolean(otherUser?.is_admin) && conversation.listing_id == null;

  // Header card data: avatar + response stat + slug for the View profile link.
  const otherUserStat = await getUserResponseStat(otherUser.id);
  const slugMap = await getUserSlugMap();
  const otherUserSlug = slugMap.get(otherUser.id) || otherUser.id;
  const otherInitial = (otherUser.first_name?.[0] || "M").toUpperCase();

  // Index of the LAST message I sent that the other party has read. Used to
  // anchor a single iMessage-style "Read HH:MM" label under just that one
  // bubble instead of every read message.
  const lastReadMineIndex = (() => {
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      const m = conversation.messages[i];
      if (m.sender_id === userId && m.read_at) return i;
    }
    return -1;
  })();

  const sendMessage = async (formData: FormData) => {
    "use server";
    const body = String(formData.get("body") || "");
    const rawImage = formData.get("imageFile");
    const imageFile = rawImage && rawImage instanceof File && rawImage.size > 0 ? rawImage : null;
    await sendConversationMessage({ conversationId: conversation.id, body, imageFile });
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#EFE7DE]">
      <ConversationViewportFix messageCount={conversation.messages.length} />

      {/* Header — one compact row: back arrow + avatar + name/avg/profile */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[#ddd3cb] bg-[#fbf8f5] px-3 py-2">
        <Link
          href="/messages"
          aria-label="Back to messages"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#2f2925] hover:bg-[#efe6dd]"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>

        {otherUser.profile_image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={otherUser.profile_image}
            alt={otherName}
            className="h-10 w-10 shrink-0 rounded-full border-[1.5px] border-[#ddd3cb] object-cover"
          />
        ) : (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#ddd3cb] bg-[#d2baa3] text-[14px] font-medium text-[#5f4437]"
            style={{ fontFamily: "var(--font-serif), serif" }}
          >
            {otherInitial}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-[15px] font-semibold text-[#2f2925]">
            <span className="truncate">{otherName}</span>
            {isSupportThread ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                Support
              </span>
            ) : null}
          </p>
          {otherUserStat ? <UserResponseBadge medianMinutes={otherUserStat.medianMinutes} /> : null}
          <Link
            href={`/${otherUserSlug}`}
            className="mt-0.5 inline-block text-[12px] text-[#7a6050] underline-offset-2 hover:underline"
          >
            View profile
          </Link>
        </div>
      </div>

      {/* Scrollable messages area */}
      <div id="conversation-scroll" className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        <div className="mx-auto flex w-full max-w-[820px] flex-col gap-2">
          {conversation.messages.length === 0 ? (
            <div className="rounded-[14px] border border-[#ddd3cb] bg-[#f7f2ed] px-4 py-6 text-center text-[13px] text-[#8a7667]">
              Start the conversation.
            </div>
          ) : (
            conversation.messages.map((message: {
              id: string;
              body: string;
              image_url: string | null;
              created_at: Date;
              read_at: Date | null;
              sender_id: string;
              sender: { first_name: string; last_name: string | null };
            }, index: number) => {
              const mine = message.sender_id === userId;
              const senderName = `${message.sender.first_name} ${message.sender.last_name?.[0] ? `${message.sender.last_name[0].toUpperCase()}.` : ""}`.trim();
              const hasBody = message.body && message.body.trim().length > 0;
              return (
                <Fragment key={message.id}>
                  <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] rounded-[18px] px-3.5 py-2 ${mine ? "bg-[#a07c61] text-white" : "border border-[#ddd3cb] bg-[#fbf8f5] text-[#2f2925]"}`}>
                      {!mine ? (
                        <p className="text-[11px] text-[#8a7667]">{senderName}</p>
                      ) : null}
                      {message.image_url ? (
                        <a
                          href={message.image_url}
                          target="_blank"
                          rel="noreferrer"
                          className={`block ${hasBody ? "mb-1.5" : ""}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={message.image_url}
                            alt="Attached photo"
                            className="block max-h-[320px] w-auto rounded-[14px] object-cover"
                          />
                        </a>
                      ) : null}
                      {hasBody ? (
                        <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{message.body}</p>
                      ) : null}
                      <p className={`mt-1 text-[10px] ${mine ? "text-white/80" : "text-[#8a7667]"}`}>{formatMessageTime(message.created_at)}</p>
                    </div>
                  </div>
                  {index === lastReadMineIndex && message.read_at ? (
                    <div className="flex justify-end pr-1">
                      <span className="text-[10px] text-[#8a7667]">
                        Read {formatMessageTime(message.read_at)}
                      </span>
                    </div>
                  ) : null}
                </Fragment>
              );
            })
          )}
          <div id="conversation-latest-anchor" className="h-px w-full" aria-hidden />
        </div>
      </div>

      {/* Composer pinned to the bottom edge */}
      <div id="conversation-composer" className="shrink-0 border-t border-[#ddd3cb] bg-[#fbf8f5] px-3 py-3">
        <div className="mx-auto w-full max-w-[820px]">
          <MessageComposer action={sendMessage} />
        </div>
      </div>
    </div>
  );
}
