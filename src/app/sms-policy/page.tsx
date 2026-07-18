import type { Metadata } from "next";
import Link from "next/link";

/**
 * Dedicated SMS/text messaging policy page.
 *
 * Twilio A2P 10DLC and The Campaign Registry (TCR) reviewers land on
 * the URL you submit and need to see substantive, visible policy
 * content immediately. Burying SMS terms inside a collapsed accordion
 * on /policies is a known cause of campaign rejection — this page
 * exists specifically so the reviewer can validate consent language,
 * message frequency, opt-out instructions, and non-sharing without
 * clicking anything.
 *
 * Content must match what the app actually does (transactional-only,
 * STOP webhook wired, no third-party sharing).
 */

const SUPPORT_EMAIL = "shopmodaire@gmail.com";

export const metadata: Metadata = {
    title: "SMS Policy — Modaire",
    description:
        "Modaire's SMS/text messaging policy: what messages we send, how often, how to opt out, and how we protect your phone number.",
};

export default function SmsPolicyPage() {
    return (
        <div className="min-h-screen bg-[#f4efea]">
            <div className="mx-auto w-full max-w-[860px] border-y border-[#ddd3cb] bg-[#f4efea] px-6 py-10 sm:px-8 sm:py-14">
                <h1 className="mb-2 text-[28px] leading-tight text-[#2f2925] sm:text-[32px]" style={{ fontFamily: "var(--font-serif), serif", fontWeight: 400 }}>
                    SMS Policy
                </h1>
                <p className="mb-8 text-[14px] text-[#8a7667]">
                    Last updated: July 2026
                </p>

                <div className="space-y-6 text-[15px] leading-[1.6] text-[#4a3d33]">
                    <section className="space-y-3">
                        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                            Program Description
                        </h2>
                        <p>
                            Modaire operates a peer-to-peer marketplace for
                            modest fashion at shopmodaire.com. As part of your
                            account, Modaire may send you SMS/text messages
                            related to your marketplace activity. This is a
                            transactional messaging program — we do not send
                            marketing broadcasts through SMS.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                            Message Types
                        </h2>
                        <p>
                            After opting in, you may receive SMS messages
                            covering the following:
                        </p>
                        <ul className="list-disc space-y-1 pl-6">
                            <li>
                                <strong>Buyer/seller message alerts</strong> — a text when another Modaire user sends you a message you have not yet read.
                            </li>
                            <li>
                                <strong>Order updates</strong> — notifications when an item you listed sells, when an item you purchased ships, and when a shipment is delivered.
                            </li>
                            <li>
                                <strong>Account &amp; verification</strong> — one-time codes to verify your identity or recover your account.
                            </li>
                            <li>
                                <strong>Time-sensitive marketplace notices</strong> — for example, seller-approved discount campaign invitations you may accept or decline.
                            </li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                            How You Opt In
                        </h2>
                        <p>
                            SMS is optional. You opt in at Modaire signup by
                            checking the box labeled &ldquo;I agree to receive SMS
                            notification for buyer/seller messages and shipping
                            update on Modaire.&rdquo; The checkbox is unchecked by
                            default. You may also update SMS preferences from
                            your account settings after signup.
                        </p>
                        <p>
                            Opting in is not required to use Modaire or make a
                            purchase.
                        </p>
                        <p>
                            You must be 18 or older to receive Modaire SMS
                            messages. By opting in, you confirm you meet this
                            age requirement.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                            Sample Messages
                        </h2>
                        <p>
                            Below are example messages you may receive. All
                            messages end with opt-out instructions.
                        </p>
                        <div className="space-y-2 rounded-[16px] border border-[#d9cfc7] bg-[#fbf8f5] p-4 text-[14px]">
                            <p className="font-mono text-[13px]">
                                Modaire: Sarah sent you a message. Reply here:
                                shopmodaire.com/messages. Reply STOP to opt out.
                            </p>
                            <p className="font-mono text-[13px]">
                                Modaire: Your &ldquo;Ivory Kaftan&rdquo; sold for $85.
                                Ship within 3 business days:
                                shopmodaire.com/dashboard. Reply STOP to opt out.
                            </p>
                            <p className="font-mono text-[13px]">
                                Modaire: You have 3 listings eligible for 15%
                                off Summer Sale. Opt-in by Aug 1:
                                shopmodaire.com/p/xxxxx. Reply STOP to opt out.
                            </p>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                            Message Frequency
                        </h2>
                        <p>
                            Message frequency varies based on your marketplace
                            activity. Typical users receive fewer than 5
                            messages per week. Active buyers and sellers may
                            receive more during peak activity. There is no
                            fixed cadence — messages are sent only when
                            triggered by real events on your account.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                            Message &amp; Data Rates
                        </h2>
                        <p>
                            Message and data rates may apply. Modaire does not
                            charge you for the SMS messages we send, but your
                            wireless carrier may. Check with your carrier for
                            details on your plan.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                            How to Opt Out
                        </h2>
                        <p>
                            You can opt out of Modaire SMS messages at any
                            time by replying <strong>STOP</strong> to any
                            message you receive from us. Once you send STOP,
                            we will not send you further SMS messages except a
                            single confirmation that your opt-out has been
                            processed. Other opt-out keywords we honor:
                            UNSUBSCRIBE, CANCEL, END, QUIT, STOPALL, REVOKE,
                            OPTOUT.
                        </p>
                        <p>
                            You may also opt out at any time by contacting{" "}
                            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline hover:text-[#5a4426]">
                                {SUPPORT_EMAIL}
                            </a>{" "}
                            or by disabling SMS in your Modaire account
                            settings.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                            How to Get Help
                        </h2>
                        <p>
                            Reply <strong>HELP</strong> to any Modaire SMS to
                            get contact information for support. You may also
                            email us at{" "}
                            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline hover:text-[#5a4426]">
                                {SUPPORT_EMAIL}
                            </a>
                            .
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                            Privacy &amp; Data Sharing
                        </h2>
                        <p>
                            Modaire does not sell, rent, or share your mobile
                            phone number with third parties or affiliates for
                            their own marketing or promotional purposes.
                        </p>
                        <p>
                            Your text messaging originator opt-in data and
                            consent are not shared with any third parties
                            except as needed to provide the SMS service (for
                            example, Twilio, which is our SMS carrier
                            partner), to comply with law, or to protect the
                            rights, safety, and security of Modaire, our
                            users, or others.
                        </p>
                        <p>
                            For our full data-handling practices see our{" "}
                            <Link href="/policies" className="underline hover:text-[#5a4426]">
                                Privacy Policy
                            </Link>
                            .
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                            Supported Carriers
                        </h2>
                        <p>
                            Modaire SMS is supported on all major U.S.
                            carriers (AT&amp;T, T-Mobile, Verizon, and others).
                            Carriers are not liable for delayed or undelivered
                            messages.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                            Contact
                        </h2>
                        <p>
                            Questions about this SMS Policy may be sent to{" "}
                            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline hover:text-[#5a4426]">
                                {SUPPORT_EMAIL}
                            </a>
                            .
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}
