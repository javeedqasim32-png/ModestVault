/**
 * Shared SMS/A2P 10DLC policy body. Rendered inline in TWO places:
 *
 *   1. /policies  — inside the "Terms & Conditions" accordion, under the
 *                   "SMS Communications" eyebrow. Ensures TCR reviewers
 *                   clicking the Terms link from /signup see the full
 *                   SMS policy without a second click.
 *   2. /sms-policy — the dedicated standalone URL TCR was previously
 *                    given in the campaign submission. Kept alive so
 *                    existing audit records / direct links still resolve.
 *
 * Both callers wrap in their own outer container; this component just
 * emits the subsection body ordered per the /sms-policy canonical layout.
 * Any policy change made here propagates to both surfaces automatically —
 * that's the whole point of the extraction.
 */

const SUPPORT_EMAIL = "shopmodaire@gmail.com";

export default function SmsPolicyBody() {
    return (
        <div className="space-y-4">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                Program Description
            </p>
            <p>
                Modaire operates a peer-to-peer marketplace for modest fashion
                at shopmodaire.com. As part of your account, Modaire may send
                you SMS/text messages related to your marketplace activity.
                This is a transactional messaging program &mdash; we do not send
                marketing broadcasts through SMS.
            </p>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                Message Types
            </p>
            <p>
                After opting in, you may receive SMS messages covering the
                following:
            </p>
            <ul className="list-disc space-y-1 pl-6">
                <li>
                    <strong>Buyer/seller message alerts</strong> &mdash; a text
                    when another Modaire user sends you a message you have not
                    yet read.
                </li>
                <li>
                    <strong>Order updates</strong> &mdash; notifications when an
                    item you listed sells, when an item you purchased ships, and
                    when a shipment is delivered.
                </li>
                <li>
                    <strong>Account &amp; verification</strong> &mdash; one-time
                    codes to verify your identity or recover your account.
                </li>
                <li>
                    <strong>Time-sensitive marketplace notices</strong> &mdash;
                    for example, seller-approved discount campaign invitations
                    you may accept or decline.
                </li>
            </ul>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                How You Opt In
            </p>
            <p>
                SMS is optional. You opt in at Modaire signup by checking the
                box labeled &ldquo;I agree to receive SMS notifications for
                buyer/seller messages and shipping updates from Modaire.&rdquo;
                The checkbox is unchecked by default. You may also update SMS
                preferences from your account settings after signup.
            </p>
            <p>
                Opting in is not required to use Modaire or make a purchase. You
                must be 18 or older to receive Modaire SMS messages. By opting
                in, you confirm you meet this age requirement.
            </p>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                Sample Messages
            </p>
            <p>
                Below are example messages you may receive. All messages end
                with opt-out instructions.
            </p>
            <div className="space-y-2 rounded-[16px] border border-[#d9cfc7] bg-[#fbf8f5] p-4 text-[14px]">
                <p className="font-mono text-[13px]">
                    Modaire: Sarah sent you a message. Reply here:
                    shopmodaire.com/messages. Reply STOP to opt out.
                </p>
                <p className="font-mono text-[13px]">
                    Modaire: Your &ldquo;Ivory Kaftan&rdquo; sold for $85. Ship
                    within 3 business days: shopmodaire.com/dashboard. Reply
                    STOP to opt out.
                </p>
                <p className="font-mono text-[13px]">
                    Modaire: You have 3 listings eligible for 15% off Summer
                    Sale. Opt-in by Aug 1: shopmodaire.com/p/xxxxx. Reply STOP
                    to opt out.
                </p>
            </div>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                Message Frequency
            </p>
            <p>
                Message frequency varies based on your marketplace activity.
                Typical users receive fewer than 5 messages per week. Active
                buyers and sellers may receive more during peak activity. There
                is no fixed cadence &mdash; messages are sent only when triggered
                by real events on your account.
            </p>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                Message &amp; Data Rates
            </p>
            <p>
                Message and data rates may apply. Modaire does not charge you
                for the SMS messages we send, but your wireless carrier may.
                Check with your carrier for details on your plan.
            </p>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                How to Opt Out
            </p>
            <p>
                You can opt out of Modaire SMS messages at any time by replying{" "}
                <strong>STOP</strong> to any message you receive from us. Once
                you send STOP, we will not send you further SMS messages except
                a single confirmation that your opt-out has been processed.
                Other opt-out keywords we honor: UNSUBSCRIBE, CANCEL, END, QUIT,
                STOPALL, REVOKE, OPTOUT.
            </p>
            <p>
                You may also opt out at any time by contacting{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="underline hover:text-[#5a4426]">
                    {SUPPORT_EMAIL}
                </a>{" "}
                or by disabling SMS in your Modaire account settings.
            </p>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                How to Get Help
            </p>
            <p>
                Reply <strong>HELP</strong> to any Modaire SMS to get contact
                information for support. You may also email us at{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="underline hover:text-[#5a4426]">
                    {SUPPORT_EMAIL}
                </a>
                .
            </p>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                Privacy &amp; Data Sharing
            </p>
            <p>
                When you opt in to SMS on Modaire&rsquo;s signup page, your
                consent is given directly to Modaire and is not shared with any
                third-party aggregator, affiliate, or marketing partner.
            </p>
            <p>
                Modaire does not sell, rent, or share your mobile phone number
                or mobile opt-in data with third parties or affiliates for
                marketing or promotional purposes.
            </p>
            <p>
                Your text messaging originator opt-in data and consent are not
                shared with any third parties except as needed to provide the
                SMS service (for example, Twilio, which is our SMS carrier
                partner), to comply with law, or to protect the rights, safety,
                and security of Modaire, our users, or others.
            </p>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                Supported Carriers
            </p>
            <p>
                Modaire SMS is supported on all major U.S. carriers (AT&amp;T,
                T-Mobile, Verizon, and others). Carriers are not liable for
                delayed or undelivered messages.
            </p>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                Contact
            </p>
            <p>
                Questions about this SMS Policy may be sent to{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="underline hover:text-[#5a4426]">
                    {SUPPORT_EMAIL}
                </a>
                .
            </p>
        </div>
    );
}
