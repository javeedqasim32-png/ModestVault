"use client";

import { useState } from "react";
import Image from "next/image";
import { CornerDownRight, Lock, MessageCircle, MoreVertical } from "lucide-react";
import SignInPromptModal from "@/components/auth/SignInPromptModal";
import { postComment, removeComment, flagComment } from "@/app/actions/comments";
import { findBlockedContent, COMMENT_MAX_LENGTH } from "@/lib/comments/guard";
import type { SerializedComment } from "@/lib/comments";

/**
 * Listing Q&A ("Have a question about this item?"). Guests can read; asking,
 * replying, deleting and reporting prompt sign-in. The pure content guard
 * runs here for instant feedback, but the server enforces every rule.
 *
 * Layout: tan banner with a single "Ask a Question" CTA that opens the
 * composer; each question is a card; replies nest inside it, with the
 * seller's answers on a tan panel so they read as the answer.
 */
const PREVIEW_COUNT = 3;
const SERIF = { fontFamily: "var(--font-serif), serif" } as const;

export default function ListingComments({
  listingId,
  initialComments,
  isAuthed,
}: {
  listingId: string;
  initialComments: SerializedComment[];
  isAuthed: boolean;
}) {
  const [comments, setComments] = useState(initialComments);
  const [composerOpen, setComposerOpen] = useState(false);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null); // top-level comment id
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [reported, setReported] = useState<Set<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);

  const questionCount = comments.filter((c) => !c.deleted).length;
  const shown = showAll ? comments : comments.slice(0, PREVIEW_COUNT);
  const hiddenCount = comments.length - shown.length;

  function requireAuth() {
    if (isAuthed) return true;
    setPromptOpen(true);
    return false;
  }

  function openComposer() {
    if (!requireAuth()) return;
    setReplyTo(null);
    setError(null);
    setComposerOpen(true);
  }

  function startReply(topLevelId: string, prefill = "") {
    if (!requireAuth()) return;
    setComposerOpen(false);
    setError(null);
    setReplyTo(topLevelId);
    setReplyText(prefill);
  }

  async function submit(body: string, parentId: string | null) {
    if (!requireAuth()) return;
    const trimmed = body.trim();
    if (!trimmed) return;
    const blocked = findBlockedContent(trimmed);
    if (blocked) {
      setError(`To keep everyone safe, ${blocked} can't be shared here. For private questions, use Message Seller.`);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await postComment(listingId, trimmed, parentId);
    setBusy(false);
    if (res.ok) {
      setComments(res.data);
      if (parentId) {
        setReplyTo(null);
        setReplyText("");
      } else {
        setText("");
        setComposerOpen(false);
      }
    } else {
      setError(res.message);
    }
  }

  async function remove(commentId: string) {
    setBusy(true);
    setError(null);
    const res = await removeComment(listingId, commentId);
    setBusy(false);
    if (res.ok) setComments(res.data);
    else setError(res.message);
  }

  async function report(commentId: string) {
    if (!requireAuth()) return;
    const res = await flagComment(commentId);
    if (res.ok || res.code === "ALREADY_REPORTED") {
      setReported((s) => new Set(s).add(commentId));
    } else {
      setError(res.message);
    }
  }

  return (
    <section id="comments" className="mt-6 scroll-mt-24">
      {/* Banner / CTA */}
      <div className="rounded-[16px] border border-[#ddd3cb] bg-[#e8ddd1] p-4 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#faf6f2]">
            <MessageCircle className="h-5 w-5 text-[#4a3328]" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 style={SERIF} className="text-[21px] leading-[1.15] text-[#2f2925]">Have a question about this item?</h2>
            <p className="mt-1 text-[13px] leading-[1.4] text-[#8a7667]">Ask about sizing, condition, or any other details.</p>
          </div>
          <button
            type="button"
            onClick={openComposer}
            style={SERIF}
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#4a3328] px-5 py-3 text-[16px] leading-none text-white transition-colors hover:bg-[#3b281f] sm:px-6 sm:text-[17px]"
          >
            Ask a Question
          </button>
        </div>
      </div>

      {/* Composer (opens from the CTA) */}
      {composerOpen && (
        <div className="mt-3 rounded-[16px] border border-[#ece3dc] bg-[#fdfbf9] p-4">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, COMMENT_MAX_LENGTH))}
            rows={3}
            placeholder="What would you like to know? Measurements, fit, fabric, any flaws…"
            className="w-full resize-none bg-transparent text-[15px] leading-[1.5] text-[#2f2925] placeholder:text-[#b3a89e] outline-none"
          />
          {error && !replyTo && <GuardNote text={error} />}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#b3a89e]">
              {text.length >= COMMENT_MAX_LENGTH - 100 ? `${COMMENT_MAX_LENGTH - text.length} characters left` : "Visible to everyone"}
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => { setComposerOpen(false); setError(null); }} className="rounded-full px-4 py-2 text-[13px] text-[#8a7667] hover:text-[#2f2925]">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !text.trim()}
                onClick={() => submit(text, null)}
                className="rounded-full bg-[#4a3328] px-5 py-2 text-[13px] font-medium text-white disabled:opacity-40"
              >
                {busy ? "Posting…" : "Post Question"}
              </button>
            </div>
          </div>
        </div>
      )}
      {error && !composerOpen && !replyTo && <GuardNote text={error} />}

      {/* Questions */}
      {comments.length === 0 ? (
        <p className="mt-4 text-center text-[13px] text-[#8a7667]">No questions yet — be the first to ask.</p>
      ) : (
        <>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a7667]">
            {questionCount} {questionCount === 1 ? "question" : "questions"}
          </p>
          <ul className="mt-2 space-y-3">
            {shown.map((c) => (
              <li key={c.id}>
                <article className="rounded-[16px] border border-[#ece3dc] bg-[#fdfbf9] p-4">
                  <div className="flex items-start gap-3">
                    <Avatar author={c.author} size={44} />
                    <div className="min-w-0 flex-1 pt-[3px]">
                      <p className="truncate text-[15px] font-medium leading-tight text-[#2f2925]">{c.deleted ? "Removed" : c.author.name}</p>
                      <p className="mt-[3px] text-[12px] text-[#8a7667]">{fmtWhen(c.createdAt)}</p>
                    </div>
                    {!c.deleted && (
                      <KebabMenu
                        items={
                          c.canDelete
                            ? [{ label: "Delete", danger: true, disabled: busy, onClick: () => remove(c.id) }]
                            : [{ label: reported.has(c.id) ? "Reported" : "Report", disabled: reported.has(c.id), onClick: () => report(c.id) }]
                        }
                      />
                    )}
                  </div>

                  <div className="pl-[56px]">
                    {c.deleted ? (
                      <p className="mt-2 text-[14px] italic text-[#b3a89e]">This question was removed.</p>
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-[1.5] text-[#2f2925]">{c.body}</p>
                    )}

                    {c.replies.map((r) => (
                      <ReplyPanel
                        key={r.id}
                        r={r}
                        busy={busy}
                        reported={reported.has(r.id)}
                        onDelete={() => remove(r.id)}
                        onReport={() => report(r.id)}
                      />
                    ))}

                    {!c.deleted && replyTo !== c.id && (
                      <button
                        type="button"
                        onClick={() => startReply(c.id)}
                        className="mt-3 inline-flex items-center gap-1 text-[12px] text-[#8a7667] transition-colors hover:text-[#2f2925]"
                      >
                        <CornerDownRight className="h-3.5 w-3.5" /> Reply
                      </button>
                    )}

                    {replyTo === c.id && (
                      <div className="mt-3 rounded-[14px] border border-[#ece3dc] bg-white p-3">
                        <textarea
                          autoFocus
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value.slice(0, COMMENT_MAX_LENGTH))}
                          rows={2}
                          placeholder="Write a reply…"
                          className="w-full resize-none bg-transparent text-[14px] leading-[1.5] text-[#2f2925] placeholder:text-[#b3a89e] outline-none"
                        />
                        {error && <GuardNote text={error} />}
                        <div className="mt-2 flex justify-end gap-1">
                          <button type="button" onClick={() => { setReplyTo(null); setError(null); }} className="rounded-full px-3 py-1.5 text-[12px] text-[#8a7667] hover:text-[#2f2925]">
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={busy || !replyText.trim()}
                            onClick={() => submit(replyText, c.id)}
                            className="rounded-full bg-[#4a3328] px-4 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
                          >
                            {busy ? "Posting…" : "Reply"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-3 w-full rounded-full border border-[#ddd3cb] bg-[#fbf8f5] py-2.5 text-[13px] text-[#2f2925] transition-colors hover:bg-[#f3ece6]"
            >
              View all {questionCount} questions
            </button>
          )}
        </>
      )}

      <SignInPromptModal open={promptOpen} onClose={() => setPromptOpen(false)} intent="comment" callbackUrl={`/listings/${listingId}#comments`} />
    </section>
  );
}

/** A reply inside a question card. Seller answers get the tan panel. */
function ReplyPanel({
  r,
  busy,
  reported,
  onDelete,
  onReport,
}: {
  r: SerializedComment;
  busy: boolean;
  reported: boolean;
  onDelete: () => void;
  onReport: () => void;
}) {
  const panel = r.isSeller ? "bg-[#f3ece6]" : "border border-[#ece3dc] bg-white";
  return (
    <div className={`mt-3 rounded-[14px] p-3 ${panel}`}>
      <div className="flex items-center gap-2.5">
        <Avatar author={r.author} size={32} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-[14px] font-medium text-[#2f2925]">{r.deleted ? "Removed" : r.author.name}</span>
          {r.isSeller && !r.deleted && (
            <span className="rounded-full bg-[#e8ddd1] px-2 py-[2px] text-[11px] leading-none text-[#7a6050]">Seller</span>
          )}
          <span className="hidden h-3 w-px bg-[#d9cfc5] sm:block" />
          <span className="text-[12px] text-[#8a7667]">{fmtWhen(r.createdAt)}</span>
        </div>
        {!r.deleted && (
          <KebabMenu
            small
            items={
              r.canDelete
                ? [{ label: "Delete", danger: true, disabled: busy, onClick: onDelete }]
                : [{ label: reported ? "Reported" : "Report", disabled: reported, onClick: onReport }]
            }
          />
        )}
      </div>
      {r.deleted ? (
        <p className="mt-1.5 text-[13px] italic text-[#b3a89e]">This reply was removed.</p>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-[1.5] text-[#2f2925]">{r.body}</p>
      )}
    </div>
  );
}

function Avatar({ author, size }: { author: SerializedComment["author"]; size: number }) {
  const initial = (author.name[0] || "M").toUpperCase();
  if (author.avatarUrl) {
    return (
      <Image
        src={author.avatarUrl}
        alt={author.name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), ...SERIF }}
      className="flex shrink-0 items-center justify-center rounded-full bg-[#e8ddd1] text-[#7a6050]"
    >
      {initial}
    </div>
  );
}

function KebabMenu({
  items,
  small = false,
}: {
  items: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }[];
  small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const dim = small ? "h-7 w-7" : "h-8 w-8";
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="More options"
        onClick={() => setOpen((o) => !o)}
        className={`flex ${dim} items-center justify-center rounded-full text-[#8a7667] transition-colors hover:bg-[#efe7de] hover:text-[#2f2925]`}
      >
        <MoreVertical className="h-[18px] w-[18px]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-20 min-w-[140px] overflow-hidden rounded-[12px] border border-[#ece3dc] bg-white py-1 shadow-[0_10px_30px_rgba(74,51,40,0.12)]">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                disabled={it.disabled}
                onClick={() => { setOpen(false); it.onClick(); }}
                className={`block w-full px-4 py-2.5 text-left text-[13px] hover:bg-[#faf6f2] disabled:opacity-50 ${it.danger ? "text-[#b4463a]" : "text-[#2f2925]"}`}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Guard / server messages in brand voice rather than red validation text. */
function GuardNote({ text }: { text: string }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-[1.4] text-[#7a6050]">
      <Lock className="mt-[2px] h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

function fmtWhen(iso: string) {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} ${mins === 1 ? "minute" : "minutes"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ${hrs === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
