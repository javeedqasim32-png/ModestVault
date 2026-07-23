/**
 * Shared Terms & Conditions body. Rendered inline in TWO places:
 *
 *   1. /terms    — dedicated standalone URL. The primary link submitted
 *                  in TCR / A2P 10DLC campaign registrations and
 *                  surfaced from /signup as "Terms & Conditions".
 *   2. /policies — inside the "Terms & Conditions" accordion on the
 *                  hub page. Kept so users landing on /policies directly
 *                  (e.g. from the dashboard settings link) still see all
 *                  four policy documents in one place.
 *
 * Both callers wrap in their own outer container; this component emits
 * the document body only. Any policy change here propagates to both
 * surfaces automatically.
 */

const SUPPORT_EMAIL = "shopmodaire@gmail.com";

export default function TermsBody() {
    return (
        <div className="space-y-4">
            <p>
                By using Modaire (shopmodaire.com), a peer-to-peer marketplace
                for modest fashion, you agree to these Terms. If you do not
                agree, do not use the service.
            </p>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                SMS Communications
            </p>
            <p>
                SMS/text messages are optional. Message and data rates may
                apply. Reply <strong>STOP</strong> to opt out, <strong>HELP</strong>{" "}
                for help. You must be 18 or older to opt in.
            </p>
            <p>
                When you opt in to SMS on Modaire&rsquo;s signup page, your
                consent is given directly to Modaire and is not shared with any
                third-party aggregator, affiliate, or marketing partner. Modaire
                does not sell, rent, or share your mobile phone number or mobile
                opt-in data with third parties or affiliates for marketing or
                promotional purposes.
            </p>
            <p>
                For the full SMS policy &mdash; message types, sample messages,
                message frequency, supported carriers, and how we handle your
                data &mdash; see our{" "}
                <a href="/sms-policy" className="underline hover:text-[#5a4426]">
                    SMS Policy
                </a>
                .
            </p>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                Eligibility &amp; Account
            </p>
            <p>
                You must be at least 18 and legally able to enter into a binding
                contract. You must provide accurate registration information
                (name, email, address, and phone number for verification) and
                keep your login credentials secure. Modaire currently supports
                shipping within the United States.
            </p>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                Marketplace Role
            </p>
            <p>
                Modaire connects independent buyers and sellers. We do not take
                title to items listed for sale. Sellers are responsible for the
                accuracy, authenticity, and timely shipment of their items;
                buyers are responsible for reading listings and paying for what
                they purchase.
            </p>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                User Conduct
            </p>
            <p>
                You agree not to list counterfeit, stolen, or misrepresented
                items; circumvent our payment system; harass, threaten, or
                defraud other users; impersonate anyone; or attempt to access
                accounts or systems you are not authorized to use. Violations
                may result in listing removal, suspension, or permanent
                termination.
            </p>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                Payments
            </p>
            <p>
                All payments are processed by Stripe. Modaire charges a 15%
                commission on completed sales. Seller payouts are held briefly
                after delivery confirmation to allow disputes to be raised.
            </p>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                Disclaimers &amp; Liability
            </p>
            <p>
                Modaire is provided &ldquo;as is&rdquo; without warranties of any kind. We
                are not responsible for the acts or omissions of buyers or
                sellers. To the extent permitted by law, Modaire&apos;s aggregate
                liability for any claim will not exceed the greater of the fees
                collected from you in the 90 days before the claim or $100, and
                we are not liable for indirect or consequential damages.
            </p>

            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6f5647]">
                Contact
            </p>
            <p>
                Questions about these Terms:{" "}
                <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="underline hover:text-[#5a4426]"
                >
                    {SUPPORT_EMAIL}
                </a>
                .
            </p>
        </div>
    );
}
