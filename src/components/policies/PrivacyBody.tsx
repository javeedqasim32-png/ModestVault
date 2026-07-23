/**
 * Shared Privacy Policy body. Rendered inline in TWO places:
 *
 *   1. /privacy   — dedicated standalone URL. The primary link submitted
 *                   in TCR / A2P 10DLC campaign registrations and
 *                   surfaced from /signup as "Privacy Policy".
 *   2. /policies  — inside the "Privacy Policy" accordion on the hub
 *                   page. Kept so users landing on /policies directly
 *                   (e.g. from the dashboard settings link) still see
 *                   all four policy documents in one place.
 *
 * Both callers wrap in their own outer container; this component emits
 * the document body only. Any policy change here propagates to both
 * surfaces automatically.
 */

const SUPPORT_EMAIL = "shopmodaire@gmail.com";

export default function PrivacyBody() {
    return (
        <div className="space-y-4">
            <p>
                We collect your name, email and usage data to operate the marketplace.
                We never sell your data. Payment information is handled by Stripe and
                never stored on our servers. You may request account deletion at any
                time.
            </p>
            <div className="pt-2 border-t border-[#d9cfc7]/60">
                <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647] mb-3">
                    SMS / Text Messaging
                </p>
                <div className="space-y-3">
                    <p>
                        When you opt in to SMS on Modaire&rsquo;s signup page, your
                        consent is given directly to Modaire and is not shared with any
                        third-party aggregator, affiliate, or marketing partner.
                    </p>
                    <p>
                        Modaire may collect your mobile phone number when you create an
                        account, update your profile, or choose to receive text message
                        alerts.
                    </p>
                    <p>
                        If you opt in, Modaire may send you SMS/text messages related to
                        your account activity, including alerts about unread
                        buyer/seller messages, marketplace communication, account
                        updates, and other service-related notifications.
                    </p>
                    <p>
                        Message frequency may vary. Message and data rates may apply.
                        You can opt out of SMS messages at any time by replying{" "}
                        <strong>STOP</strong> to any message. You may also contact us at{" "}
                        <a
                            href={`mailto:${SUPPORT_EMAIL}`}
                            className="underline hover:text-[#5a4426]"
                        >
                            {SUPPORT_EMAIL}
                        </a>{" "}
                        for help.
                    </p>
                    <p>
                        Modaire does not sell, rent, or share your mobile phone number
                        with third parties or affiliates for marketing or promotional
                        purposes.
                    </p>
                    <p>
                        Text messaging originator opt-in data and consent will not be
                        shared with any third parties, except as needed to provide SMS
                        messaging services, comply with law, or protect the rights,
                        safety, and security of Modaire, our users, or others.
                    </p>
                    <p>
                        Your decision to opt in to SMS messages is optional and is not
                        required to use Modaire or make a purchase.
                    </p>
                </div>
            </div>
        </div>
    );
}
