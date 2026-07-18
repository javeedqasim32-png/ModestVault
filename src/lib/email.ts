import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
    },
});

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
    try {
        const mailOptions = {
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: email, // The user's email address
            subject: 'Your Modaire Verification Code',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2>Welcome to Modaire!</h2>
                    <p>Your verification code is:</p>
                    <h1 style="color: #4CAF50; letter-spacing: 2px;">${code}</h1>
                    <p>Please enter this code on the verification page to complete your registration.</p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✉️ VERIFICATION EMAIL SENT to ${email} (Message ID: ${info.messageId})`);
    } catch (error) {
        console.error("❌ Failed to send verification email:", error);
    }
}

export async function sendSaleNotificationEmail(
    email: string,
    listingTitle: string,
    amount: number,
    opts?: { needsStripeConnect?: boolean }
): Promise<void> {
    try {
        const needsStripeConnect = opts?.needsStripeConnect === true;
        const subject = needsStripeConnect
            ? `Your item sold — connect Stripe to receive $${amount.toFixed(2)}`
            : 'Good news! Your item has been sold on Modaire';
        const ctaHref = needsStripeConnect
            ? `${process.env.NEXT_PUBLIC_APP_URL}/sell`
            : `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/sales`;
        const ctaLabel = needsStripeConnect ? 'Connect Stripe to Get Paid' : 'View Order';
        const callout = needsStripeConnect
            ? `<p style="margin-top: 20px;">To receive your payout, you'll need to connect a Stripe account. It takes about two minutes — your funds are held safely on Modaire until then.</p>`
            : `<p>Please log in to your dashboard to download your shipping label and fulfill the order.</p>`;

        const mailOptions = {
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: email,
            subject,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #4a3328;">You made a sale!</h2>
                    <p>Congratulations! Your item <strong>${listingTitle}</strong> was just purchased.</p>
                    <div style="background: #f9f4f1; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0; font-size: 14px; color: #8a7667;">Sale Price</p>
                        <h1 style="margin: 5px 0; color: #2f2925;">$${amount.toFixed(2)}</h1>
                    </div>
                    ${callout}
                    <a href="${ctaHref}" style="display: inline-block; background: #a07c61; color: white; padding: 12px 25px; text-decoration: none; border-radius: 25px; font-weight: bold; margin-top: 10px;">${ctaLabel}</a>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                    <p style="font-size: 12px; color: #b0a89e;">Thank you for selling on Modaire.</p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("❌ Failed to send sale notification email:", error);
    }
}

export async function sendUnclaimedPayoutReminderEmail(
    email: string,
    totalAmount: number,
    orderCount: number
): Promise<void> {
    try {
        const itemWord = orderCount === 1 ? 'item' : 'items';
        const isWord = orderCount === 1 ? 'is' : 'are';
        const mailOptions = {
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `You have $${totalAmount.toFixed(2)} waiting — connect Stripe to claim`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #4a3328;">Your payout is waiting</h2>
                    <p>${orderCount} ${itemWord} you sold ${isWord} ready for payout. Connect a Stripe account to claim your earnings.</p>
                    <div style="background: #f9f4f1; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0; font-size: 14px; color: #8a7667;">Total Waiting</p>
                        <h1 style="margin: 5px 0; color: #2f2925;">$${totalAmount.toFixed(2)}</h1>
                    </div>
                    <p>Stripe onboarding takes about two minutes. Once connected, your pending payouts release automatically.</p>
                    <a href="${process.env.NEXT_PUBLIC_APP_URL}/sell" style="display: inline-block; background: #a07c61; color: white; padding: 12px 25px; text-decoration: none; border-radius: 25px; font-weight: bold; margin-top: 10px;">Connect Stripe to Get Paid</a>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                    <p style="font-size: 12px; color: #b0a89e;">Your funds are held safely on Modaire until you connect.</p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("❌ Failed to send unclaimed payout reminder email:", error);
    }
}

export async function sendOrderConfirmationEmail(email: string, listingTitle: string, totalAmount: number): Promise<void> {
    try {
        const mailOptions = {
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Order Confirmation - Modaire',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #4a3328;">Thank you for your purchase!</h2>
                    <p>We've received your order for <strong>${listingTitle}</strong>.</p>
                    <div style="background: #f9f4f1; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0; font-size: 14px; color: #8a7667;">Total Paid</p>
                        <h1 style="margin: 5px 0; color: #2f2925;">$${totalAmount.toFixed(2)}</h1>
                    </div>
                    <p>The seller will be notified to ship your item soon. You can track your purchase history in your dashboard.</p>
                    <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/purchases" style="display: inline-block; border: 1px solid #a07c61; color: #a07c61; padding: 12px 25px; text-decoration: none; border-radius: 25px; font-weight: bold; margin-top: 10px;">View Purchases</a>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("❌ Failed to send order confirmation email:", error);
    }
}

export async function sendTrackingUpdateEmail(email: string, listingTitle: string, status: string, trackingNumber: string, carrier: string): Promise<void> {
    try {
        const mailOptions = {
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Update on your order: ${listingTitle}`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #4a3328;">Shipping Update</h2>
                    <p>Your item <strong>${listingTitle}</strong> is now <strong>${status.toLowerCase()}</strong>.</p>
                    <div style="background: #f9f4f1; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0; font-size: 14px; color: #8a7667;">${carrier} Tracking Number</p>
                        <p style="margin: 5px 0; font-weight: bold; font-family: monospace;">${trackingNumber}</p>
                    </div>
                    <p>You can track the progress of your delivery through the button below.</p>
                    <a href="https://www.google.com/search?q=${trackingNumber}" style="display: inline-block; background: #a07c61; color: white; padding: 12px 25px; text-decoration: none; border-radius: 25px; font-weight: bold; margin-top: 10px;">Track Package</a>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("❌ Failed to send tracking update email:", error);
    }
}

export async function sendDeliveryNotificationEmail(buyerEmail: string, sellerEmail: string, listingTitle: string): Promise<void> {
    try {
        // 1. Notify Buyer
        await transporter.sendMail({
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: buyerEmail,
            subject: 'Delivered! Modaire Order',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #4a3328;">Package Delivered!</h2>
                    <p>Great news! Your item <strong>${listingTitle}</strong> has been delivered.</p>
                    <p>We hope you love your new find! If there are any issues, please contact us within 3 days.</p>
                </div>
            `
        });

        // 2. Notify Seller
        await transporter.sendMail({
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: sellerEmail,
            subject: 'Item Delivered - Your payout is coming soon!',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #4a3328;">Successful Delivery!</h2>
                    <p>Your item <strong>${listingTitle}</strong> has been successfully delivered to the buyer.</p>
                    <p>According to our policy, your funds will be released to your Stripe account automatically in <strong>3 days</strong>.</p>
                    <p>Thank you for selling on Modaire!</p>
                </div>
            `
        });
    } catch (error) {
        console.error("❌ Failed to send delivery notification emails:", error);
    }
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
    try {
        const resetLink = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
        const mailOptions = {
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Reset your Modaire Password',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #4a3328;">Reset Your Password</h2>
                    <p>We received a request to reset the password for your Modaire account.</p>
                    <p>Click the button below to choose a new password. This link is only valid for <strong>1 hour</strong>.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetLink}" style="display: inline-block; background: #a07c61; color: white; padding: 12px 25px; text-decoration: none; border-radius: 25px; font-weight: bold;">Reset Password</a>
                    </div>
                    <p style="font-size: 12px; color: #8a7667; line-height: 1.5;">If the button above doesn't work, copy and paste this URL into your browser:</p>
                    <p style="font-size: 12px; color: #a07c61; word-break: break-all; font-family: monospace;">${resetLink}</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                    <p style="font-size: 12px; color: #b0a89e;">If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
        console.log(`✉️ PASSWORD RESET EMAIL SENT to ${email}`);
    } catch (error) {
        console.error("❌ Failed to send password reset email:", error);
    }
}

export async function sendListingApprovedEmail(email: string, listingTitle: string): Promise<void> {
    try {
        const mailOptions = {
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Approved! Your listing is now live on Modaire',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #4a3328;">Your listing is live!</h2>
                    <p>Good news! Your listing <strong>${listingTitle}</strong> has been approved by our moderation team and is now live for buyers on Modaire.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.NEXT_PUBLIC_APP_URL}/sell" style="display: inline-block; background: #a07c61; color: white; padding: 12px 25px; text-decoration: none; border-radius: 25px; font-weight: bold;">Go to Dashboard</a>
                    </div>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                    <p style="font-size: 12px; color: #b0a89e;">Thank you for selling on Modaire.</p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
        console.log(`✉️ LISTING APPROVED EMAIL SENT to ${email}`);
    } catch (error) {
        console.error("❌ Failed to send listing approved email:", error);
    }
}

export async function sendListingRejectedEmail(email: string, listingTitle: string, reason: string): Promise<void> {
    try {
        const mailOptions = {
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Action Needed: Your Modaire listing requires edits',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #d32f2f;">Listing Edits Required</h2>
                    <p>Thank you for submitting <strong>${listingTitle}</strong>. Our moderation team reviewed your listing and determined it requires a few edits before it can go live.</p>
                    <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 15px; border-radius: 4px; margin: 20px 0;">
                        <p style="margin: 0 0 5px 0; font-weight: bold; color: #c62828;">Feedback from Moderation:</p>
                        <p style="margin: 0; color: #333; font-style: italic;">"${reason}"</p>
                    </div>
                    <p>You can easily update your listing, fix these items, and resubmit it from your Sell dashboard.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.NEXT_PUBLIC_APP_URL}/sell" style="display: inline-block; background: #a07c61; color: white; padding: 12px 25px; text-decoration: none; border-radius: 25px; font-weight: bold;">Edit Your Listing</a>
                    </div>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                    <p style="font-size: 12px; color: #b0a89e;">Thank you for selling on Modaire.</p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
        console.log(`✉️ LISTING REJECTED EMAIL SENT to ${email}`);
    } catch (error) {
        console.error("❌ Failed to send listing rejected email:", error);
    }
}

export async function sendRefundIssuedBuyerEmail(
    email: string,
    listingTitle: string,
    amount: number,
    reason: string
): Promise<void> {
    try {
        const mailOptions = {
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Refund processed for "${listingTitle}"`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #2e7d32;">Your refund is on its way</h2>
                    <p>We've processed a refund of <strong>$${amount.toFixed(2)}</strong> for your order of <strong>${listingTitle}</strong>.</p>
                    <div style="background: #f1f8e9; border-left: 4px solid #66bb6a; padding: 15px; border-radius: 4px; margin: 20px 0;">
                        <p style="margin: 0 0 5px 0; font-weight: bold; color: #2e7d32;">Reason:</p>
                        <p style="margin: 0; color: #333;">${reason}</p>
                    </div>
                    <p>The refund will appear back on your original payment method within 5–10 business days, depending on your bank.</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                    <p style="font-size: 12px; color: #b0a89e;">If you have questions about this refund, reply to this email or contact support through your Modaire account.</p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
        console.log(`✉️ REFUND BUYER EMAIL SENT to ${email}`);
    } catch (error) {
        console.error("❌ Failed to send refund buyer email:", error);
    }
}

export async function sendRefundIssuedSellerEmail(
    email: string,
    listingTitle: string,
    amount: number,
    reason: string,
    transferReversed: boolean
): Promise<void> {
    try {
        const reversalCopy = transferReversed
            ? `<p>Because your payout for this order had already been released, the corresponding amount has been pulled back from your connected account.</p>`
            : `<p>Your payout for this order was still on hold, so no funds have been transferred to you for this sale.</p>`;
        const mailOptions = {
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `An order was refunded: "${listingTitle}"`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #c62828;">An order has been refunded</h2>
                    <p>The buyer of your listing <strong>${listingTitle}</strong> has been refunded <strong>$${amount.toFixed(2)}</strong>.</p>
                    <div style="background: #ffebee; border-left: 4px solid #ef5350; padding: 15px; border-radius: 4px; margin: 20px 0;">
                        <p style="margin: 0 0 5px 0; font-weight: bold; color: #c62828;">Reason:</p>
                        <p style="margin: 0; color: #333;">${reason}</p>
                    </div>
                    ${reversalCopy}
                    <p>If you believe this refund was issued in error, please reply to this email so our team can review.</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                    <p style="font-size: 12px; color: #b0a89e;">Thank you for selling on Modaire.</p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
        console.log(`✉️ REFUND SELLER EMAIL SENT to ${email}`);
    } catch (error) {
        console.error("❌ Failed to send refund seller email:", error);
    }
}

/**
 * Fires whenever someone sends a direct message to a Modaire user.
 * Pairs with the in-app notification + push queued by createNotification —
 * email is the always-reliable fallback for users who don't have push
 * enabled or aren't logged in.
 */
export async function sendNewMessageEmail(
    email: string,
    fromName: string,
    snippet: string,
    conversationUrl: string,
): Promise<void> {
    try {
        // Soft-cap the preview so a long paragraph doesn't bloat the email.
        const preview = snippet.length > 140
            ? `${snippet.slice(0, 140).trimEnd()}…`
            : snippet;
        const mailOptions = {
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `${fromName} sent you a message on Modaire`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #4a3328;">New message from ${fromName}</h2>
                    <div style="background: #f9f4f1; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 3px solid #a07c61;">
                        <p style="margin: 0; color: #2f2925; font-size: 15px; line-height: 1.5;">${preview}</p>
                    </div>
                    <a href="${conversationUrl}" style="display: inline-block; background: #a07c61; color: white; padding: 12px 25px; text-decoration: none; border-radius: 25px; font-weight: bold; margin-top: 10px;">Reply on Modaire</a>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                    <p style="font-size: 12px; color: #b0a89e;">You're receiving this because someone messaged you on Modaire.</p>
                </div>
            `,
        };
        await transporter.sendMail(mailOptions);
        console.log(`✉️ NEW MESSAGE EMAIL SENT to ${email}`);
    } catch (error) {
        console.error("❌ Failed to send new message email:", error);
    }
}

/**
 * 24h-after digest sent by /api/internal/remind-unread-messages for any
 * direct message that's still unread a day later. One email per recipient
 * summarizing every aged unread message in the same digest.
 */
export async function sendUnreadMessagesReminderEmail(
    email: string,
    items: Array<{ from: string; snippet: string; conversationUrl: string }>,
): Promise<void> {
    if (items.length === 0) return;
    try {
        const total = items.length;
        const cap = (s: string) =>
            s.length > 120 ? `${s.slice(0, 120).trimEnd()}…` : s;
        const itemsHtml = items
            .map(
                (it) => `
                    <a href="${it.conversationUrl}" style="display: block; text-decoration: none; color: inherit; background: #f9f4f1; padding: 14px 16px; border-radius: 10px; margin-bottom: 10px; border-left: 3px solid #a07c61;">
                        <p style="margin: 0 0 4px 0; font-weight: bold; color: #2f2925; font-size: 14px;">${it.from}</p>
                        <p style="margin: 0; color: #6f6054; font-size: 13px; line-height: 1.45;">${cap(it.snippet)}</p>
                    </a>`,
            )
            .join("");
        const mailOptions = {
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: email,
            subject:
                total === 1
                    ? "You have 1 unread message on Modaire"
                    : `You have ${total} unread messages on Modaire`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #4a3328;">Still waiting for your reply</h2>
                    <p>The conversations below haven't been opened yet. A quick reply keeps your buyers and sellers engaged.</p>
                    <div style="margin: 20px 0;">${itemsHtml}</div>
                    <a href="${process.env.NEXT_PUBLIC_APP_URL}/messages" style="display: inline-block; background: #a07c61; color: white; padding: 12px 25px; text-decoration: none; border-radius: 25px; font-weight: bold; margin-top: 10px;">View all messages</a>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                    <p style="font-size: 12px; color: #b0a89e;">You're receiving this because messages addressed to you have been unread for over 24 hours.</p>
                </div>
            `,
        };
        await transporter.sendMail(mailOptions);
        console.log(
            `✉️ UNREAD MESSAGES REMINDER (${total}) SENT to ${email}`,
        );
    } catch (error) {
        console.error(
            "❌ Failed to send unread messages reminder email:",
            error,
        );
    }
}

/**
 * 48h-after (and again at 7d) abandoned-cart reminder sent by
 * /api/internal/remind-abandoned-carts. `which` controls the subject +
 * tone so the second nudge feels softer than the first.
 */
export async function sendCartReminderEmail(
    email: string,
    items: Array<{
        title: string;
        price: number;
        thumbUrl: string | null;
        listingUrl: string;
    }>,
    which: "first" | "second",
): Promise<void> {
    if (items.length === 0) return;
    try {
        const subject =
            which === "first"
                ? "Still thinking it over? Your bag is waiting"
                : "Your favorites are still in your bag";
        const heading =
            which === "first" ? "You left something behind" : "Don't miss out";
        const intro =
            which === "first"
                ? "The items you saved are still available. Come back and check out before someone else does."
                : "These pieces have been in your bag for over a week — they won't stay around forever.";

        const itemsHtml = items
            .map((it) => {
                const img = it.thumbUrl
                    ? `<img src="${it.thumbUrl}" alt="" width="64" height="80" style="display: block; border-radius: 8px; object-fit: cover;" />`
                    : `<div style="width: 64px; height: 80px; background: #f2ebe4; border-radius: 8px;"></div>`;
                return `
                    <a href="${it.listingUrl}" style="display: block; text-decoration: none; color: inherit; background: #fbf8f5; padding: 12px; border-radius: 10px; margin-bottom: 10px; border: 1px solid #e3d9d1;">
                        <table style="width: 100%; border-collapse: collapse;"><tr>
                            <td style="width: 64px; vertical-align: top;">${img}</td>
                            <td style="padding-left: 12px; vertical-align: top;">
                                <p style="margin: 0 0 4px 0; font-weight: bold; color: #2f2925; font-size: 14px;">${it.title}</p>
                                <p style="margin: 0; color: #4a3328; font-size: 14px; font-weight: 600;">$${it.price.toFixed(0)}</p>
                            </td>
                        </tr></table>
                    </a>`;
            })
            .join("");

        const mailOptions = {
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: email,
            subject,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #4a3328;">${heading}</h2>
                    <p>${intro}</p>
                    <div style="margin: 20px 0;">${itemsHtml}</div>
                    <a href="${process.env.NEXT_PUBLIC_APP_URL}/cart" style="display: inline-block; background: #a07c61; color: white; padding: 12px 25px; text-decoration: none; border-radius: 25px; font-weight: bold; margin-top: 10px;">Return to your bag</a>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                    <p style="font-size: 12px; color: #b0a89e;">You're receiving this because items in your Modaire bag haven't been purchased.</p>
                </div>
            `,
        };
        await transporter.sendMail(mailOptions);
        console.log(
            `✉️ CART REMINDER (${which}, ${items.length} items) SENT to ${email}`,
        );
    } catch (error) {
        console.error("❌ Failed to send cart reminder email:", error);
    }
}

/**
 * One-off invitation asking a seller to opt-in their eligible listings to a
 * time-boxed promotion campaign (e.g. Myrtle 15% off). The secure link
 * carries a plaintext token — the DB only stores sha256(token) — that lets
 * the seller land directly on their approval page without logging in.
 *
 * Fired from scripts/create-myrtle-campaign.ts with --send-emails; never
 * fires automatically.
 */
export async function sendPromotionInvitationEmail(
    email: string,
    sellerName: string,
    campaignName: string,
    discountPercent: number,
    secureLink: string,
    listingCount: number,
    startsAt: Date,
    endsAt: Date,
    inviteExpiresAt: Date,
): Promise<void> {
    try {
        const listingLabel = listingCount === 1 ? "listing" : "listings";
        const fmt = (d: Date) => d.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
        });
        const startsLabel = fmt(startsAt);
        const endsLabel = fmt(endsAt);
        const inviteExpiresLabel = fmt(inviteExpiresAt);
        // Subject dedupes "Modaire" if the campaign name already contains it
        // ("You're invited to Modaire's Modaire Sale" → "You're invited: Modaire Sale").
        const subject = /modaire/i.test(campaignName)
            ? `You're invited: ${campaignName}`
            : `You're invited to Modaire's ${campaignName}`;
        const mailOptions = {
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: email,
            subject,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #4a3328;">Hi ${sellerName || "there"},</h2>
                    <p style="font-size: 15px; line-height: 1.55; color: #2f2925;">
                        You've been selected to join <strong>Modaire's ${campaignName}</strong>, and <strong>${listingCount} of your ${listingLabel}</strong> ${listingCount === 1 ? "is" : "are"} eligible to be featured in the campaign.
                    </p>
                    <div style="background: #f9f4f1; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 3px solid #a07c61;">
                        <p style="margin: 0; font-size: 15px; color: #2f2925; line-height: 1.5;">
                            You can choose which eligible listings you'd like to include at <strong>${discountPercent}% off</strong>. The campaign runs from <strong>${startsLabel}</strong> through <strong>${endsLabel}</strong>, and the promotional discount will automatically be removed once it ends.
                        </p>
                    </div>
                    <div style="text-align: center; margin: 28px 0;">
                        <a href="${secureLink}" style="display: inline-block; background: #a07c61; color: white; padding: 14px 28px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 15px;">Review My Eligible Listings</a>
                    </div>
                    <p style="font-size: 13px; color: #6f6054; line-height: 1.5;">
                        This link is unique to you, so please don't share it. It will stop working after <strong>${endsLabel}</strong>.
                    </p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                    <p style="font-size: 12px; color: #b0a89e;">You're receiving this because you have active Modaire listings that qualify for this campaign. Opting listings in is optional.</p>
                </div>
            `,
        };
        await transporter.sendMail(mailOptions);
        console.log(
            `✉️ PROMOTION INVITE (${campaignName}, ${listingCount} listings) SENT to ${email}`,
        );
    } catch (error) {
        console.error("❌ Failed to send promotion invitation email:", error);
    }
}

/**
 * Sale-discovery email — one per user, batching multiple listings from
 * their cart + favorites that just went on sale. Fired by the cron at
 * /api/internal/send-sale-discovery-emails. One-time per (user, listing)
 * pair via SaleDiscoveryEmail unique constraint.
 *
 * `firstName` is used only for the greeting; falls back to "there" if
 * missing so the salutation always reads cleanly.
 */
export async function sendSaleDiscoveryEmail(
    email: string,
    firstName: string,
    items: Array<{
        title: string;
        originalPrice: number;
        salePrice: number;
        discountPercent: number;
        thumbUrl: string | null;
        listingUrl: string;
    }>,
): Promise<void> {
    if (items.length === 0) return;
    try {
        const total = items.length;
        const itemLabel = total === 1 ? "item" : "items";
        const itemsHtml = items
            .map((it) => {
                const img = it.thumbUrl
                    ? `<img src="${it.thumbUrl}" alt="" width="72" height="90" style="display: block; border-radius: 8px; object-fit: cover;" />`
                    : `<div style="width: 72px; height: 90px; background: #f2ebe4; border-radius: 8px;"></div>`;
                return `
                    <a href="${it.listingUrl}" style="display: block; text-decoration: none; color: inherit; background: #fbf8f5; padding: 12px; border-radius: 10px; margin-bottom: 10px; border: 1px solid #e3d9d1;">
                        <table style="width: 100%; border-collapse: collapse;"><tr>
                            <td style="width: 72px; vertical-align: top;">${img}</td>
                            <td style="padding-left: 14px; vertical-align: top;">
                                <p style="margin: 0 0 6px 0; font-weight: bold; color: #2f2925; font-size: 14px; line-height: 1.3;">${it.title}</p>
                                <p style="margin: 0 0 4px 0; color: #4a3328; font-size: 15px; font-weight: 600;">
                                    $${it.salePrice.toFixed(2)}
                                    <span style="color: #8a7667; font-weight: 400; font-size: 13px; text-decoration: line-through; margin-left: 6px;">$${it.originalPrice.toFixed(2)}</span>
                                </p>
                                <span style="display: inline-block; background: #4a3328; color: white; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">${it.discountPercent}% Off</span>
                            </td>
                        </tr></table>
                    </a>`;
            })
            .join("");
        const subject = total === 1
            ? "An item you saved just went on sale"
            : `${total} items you saved just went on sale`;
        const heading = total === 1
            ? "An item you love is now on sale"
            : "Items you love are now on sale";
        const intro = total === 1
            ? `An item from your bag or favorites just went on sale on Modaire.`
            : `${total} ${itemLabel} from your bag or favorites just went on sale on Modaire.`;
        const mailOptions = {
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: email,
            subject,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #4a3328;">Hi ${firstName || "there"},</h2>
                    <p style="font-size: 15px; line-height: 1.55; color: #2f2925;">${heading}.</p>
                    <div style="background: #f9f4f1; padding: 16px; border-radius: 10px; margin: 20px 0; border-left: 3px solid #a07c61;">
                        <p style="margin: 0; font-size: 14px; color: #2f2925; line-height: 1.5;">${intro} Grab ${total === 1 ? "it" : "them"} before ${total === 1 ? "the seller closes it out" : "the sale ends or someone else beats you to them"}.</p>
                    </div>
                    <div style="margin: 20px 0;">${itemsHtml}</div>
                    <div style="text-align: center; margin: 24px 0;">
                        <a href="${process.env.NEXT_PUBLIC_APP_URL}/browse?sale=1" style="display: inline-block; background: #a07c61; color: white; padding: 12px 26px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 14px;">Shop the sale</a>
                    </div>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                    <p style="font-size: 12px; color: #b0a89e;">You're receiving this because these items were in your bag or favorites when they went on sale. Each item triggers this email at most once.</p>
                </div>
            `,
        };
        await transporter.sendMail(mailOptions);
        console.log(
            `✉️ SALE DISCOVERY (${total} ${itemLabel}) SENT to ${email}`,
        );
    } catch (error) {
        console.error("❌ Failed to send sale discovery email:", error);
    }
}

/**
 * Sale-broadcast email — one-off promotional send to every opted-in
 * user announcing an active promotion.
 *
 * Distinct from sendSaleDiscoveryEmail: that one is a per-user
 * targeted alert triggered by cart/favorite membership. This one is a
 * broadcast — same curated items to everyone.
 *
 * Layout is editorial-boutique, not commodity-retailer:
 *   - Personalized subject line (falls back to editorial when no name)
 *   - Hidden preview text (Gmail inbox row's second line)
 *   - Hero item at top with the CAMPAIGN framing (not just a price tile)
 *   - 3-tile grid for additional pieces, with per-item scarcity signal
 *   - Trust strip (verified sellers / insured shipping)
 *   - Two additional CTAs, real end-date urgency
 *   - CAN-SPAM footer (unsubscribe + mailing address)
 *
 * `items[0]` becomes the hero. Ideal input is 4 items (hero + 3 grid).
 * Fewer is fine — grid shrinks. Zero throws.
 *
 * Throws on SMTP failure so the broadcast script can record per-
 * recipient outcomes to MarketingEmailDelivery. Callers try/catch.
 */
export async function sendSaleBroadcastEmail(input: {
    email: string;
    firstName: string;
    discountLabel: string;   // e.g. "15% Off"
    campaignName: string;    // e.g. "Summer Sale"
    campaignEndsAt: Date;    // real deadline for urgency copy
    unsubscribeUrl: string;
    /** Optional subject override — otherwise a personalized default is used. */
    subject?: string;
    items: Array<{
        title: string;
        originalPrice: number;
        salePrice: number;
        discountPercent: number;
        thumbUrl: string | null;
        listingUrl: string;
    }>;
}): Promise<void> {
    const {
        email,
        firstName,
        discountLabel,
        campaignName,
        campaignEndsAt,
        unsubscribeUrl,
        subject: subjectOverride,
        items,
    } = input;
    if (items.length === 0) {
        throw new Error("sendSaleBroadcastEmail requires at least one item");
    }
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://shopmodaire.com").replace(/\/$/, "");
    const mailingAddress = process.env.MODAIRE_MAILING_ADDRESS || "[SET MODAIRE_MAILING_ADDRESS IN .env]";
    const shopUrl = `${appUrl}/browse?sale=1`;

    const hero = items[0];
    const grid = items.slice(1, 4);
    const endShort = formatEndShort(campaignEndsAt); // "July 19"
    const endLong = formatEndLong(campaignEndsAt);   // "Sunday, July 19 · 11:59pm CT"

    // Personalized default subject. Editorial fallback when firstName
    // is missing.
    const subject = subjectOverride
        || (firstName
            ? `${firstName}, we found pieces you'll love — ${discountLabel}`
            : `The Modaire Edit: ${discountLabel} through ${endShort}`);

    // Hidden preview text — the second line shown in Gmail's inbox list
    // next to the subject. Optimize this like a subheadline.
    const previewText = `Handpicked modest pieces from our community — ${discountLabel.toLowerCase()} through ${endShort}. One of a kind.`;

    const heroImg = hero.thumbUrl
        ? `<img src="${hero.thumbUrl}" alt="${escapeAttr(hero.title)}" width="600" style="display: block; width: 100%; height: auto; max-height: 520px; object-fit: cover;" />`
        : `<div style="width: 100%; height: 320px; background: #ede2d5;"></div>`;

    const gridCells = grid.map((it) => {
        const img = it.thumbUrl
            ? `<img src="${it.thumbUrl}" alt="${escapeAttr(it.title)}" style="display: block; width: 100%; height: 200px; object-fit: cover; border-radius: 6px;" />`
            : `<div style="width: 100%; height: 200px; background: #ede2d5; border-radius: 6px;"></div>`;
        return `
            <td width="33%" valign="top" style="width: 33.3%; padding: 6px; vertical-align: top;">
                <a href="${it.listingUrl}" style="text-decoration: none; color: inherit; display: block;">
                    ${img}
                    <p style="margin: 8px 0 4px 0; font-weight: 600; color: #2f2925; font-size: 12px; line-height: 1.3; min-height: 32px;">${escapeText(truncate(it.title, 46))}</p>
                    <p style="margin: 0; color: #2f2925; font-size: 13px; font-weight: 700;">
                        $${it.salePrice.toFixed(2)}
                        <span style="color: #8a7667; font-weight: 400; font-size: 11px; text-decoration: line-through; margin-left: 4px;">$${it.originalPrice.toFixed(2)}</span>
                    </p>
                    <p style="margin: 4px 0 0 0; color: #a07c61; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em;">Only 1 available</p>
                </a>
            </td>`;
    }).join("");

    const mailOptions = {
        from: `"Modaire" <${process.env.EMAIL_USER}>`,
        to: email,
        subject,
        html: `<!doctype html>
<html><head><meta charset="utf-8"/><title>${escapeText(subject)}</title></head>
<body style="margin: 0; padding: 0; background: #f4efea;">
<div style="display:none; overflow:hidden; height:0; width:0; max-height:0; max-width:0; opacity:0; color:transparent;">
${escapeText(previewText)}
</div>
<div style="max-width: 600px; margin: 0 auto; background: #ffffff; font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #2f2925;">

  <!-- Brand bar -->
  <div style="background: #4a3328; padding: 18px 24px; text-align: center;">
    <span style="color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 0.28em;">MODAIRE</span>
  </div>

  <!-- Hero -->
  <a href="${hero.listingUrl}" style="text-decoration: none; color: inherit; display: block;">
    ${heroImg}
  </a>
  <div style="padding: 26px 26px 8px 26px;">
    <p style="margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.18em; font-size: 10px; color: #a07c61; font-weight: 700;">The ${escapeText(campaignName)} Edit</p>
    <h1 style="margin: 0 0 12px 0; font-size: 28px; line-height: 1.15; color: #2f2925; font-weight: 700;">${escapeText(discountLabel)} — through ${escapeText(endShort)}.</h1>
    <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #4a3328;">
      Handpicked modest pieces from our community&rsquo;s closets. One of a kind — when they&rsquo;re gone, they&rsquo;re gone.
    </p>
    <div>
      <a href="${shopUrl}" style="display: inline-block; background: #4a3328; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 999px; font-weight: 700; font-size: 13px; letter-spacing: 0.06em;">Shop the Edit &rarr;</a>
    </div>
  </div>

  <!-- Greeting -->
  <div style="padding: 26px 26px 4px 26px;">
    <p style="margin: 0; font-size: 15px; color: #2f2925; line-height: 1.55;">Hi ${escapeText(firstName || "there")},</p>
    <p style="margin: 8px 0 0 0; font-size: 14px; color: #4a3328; line-height: 1.6;">
      A few more pieces we&rsquo;re loving this week &mdash;
    </p>
  </div>

  <!-- 3-tile grid -->
  <div style="padding: 12px 20px 24px 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: separate; border-spacing: 0;">
      <tr>${gridCells}</tr>
    </table>
  </div>

  <!-- Trust strip -->
  <div style="padding: 18px 24px; background: #fbf8f5; border-top: 1px solid #e3d9d1; border-bottom: 1px solid #e3d9d1;">
    <p style="margin: 0; text-align: center; color: #6f5647; font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase;">
      Verified sellers &middot; Insured shipping
    </p>
  </div>

  <!-- Second CTA + real deadline -->
  <div style="padding: 30px 24px; text-align: center;">
    <p style="margin: 0 0 14px 0; font-size: 13px; color: #4a3328;">More at the boutique.</p>
    <a href="${shopUrl}" style="display: inline-block; background: #a07c61; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 999px; font-weight: 700; font-size: 13px; letter-spacing: 0.04em;">See all sale items &rarr;</a>
    <p style="margin: 22px 0 0 0; color: #4a3328; font-size: 13px; font-weight: 600;">⏰ Ends ${escapeText(endLong)}</p>
  </div>

  <!-- Footer -->
  <div style="padding: 20px 24px 26px 24px; background: #f4efea; border-top: 1px solid #e3d9d1;">
    <p style="margin: 0; font-size: 10px; color: #a8a29e; text-align: center; line-height: 1.6;">
      You&rsquo;re receiving this because you have a Modaire account and opted in to marketing email.
      <a href="${unsubscribeUrl}" style="color: #6f5647; text-decoration: underline;">Unsubscribe with one click</a>.
    </p>
    <p style="margin: 8px 0 0 0; font-size: 10px; color: #a8a29e; text-align: center; line-height: 1.6;">
      Modaire &middot; ${escapeText(mailingAddress)} &middot; shopmodaire@gmail.com
    </p>
  </div>

</div>
</body></html>`,
    };
    await transporter.sendMail(mailOptions);
    console.log(`✉️ SALE BROADCAST (${campaignName}, ${items.length} items) SENT to ${email}`);
}

function formatEndShort(d: Date): string {
    // "July 19"
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Chicago" });
}

function formatEndLong(d: Date): string {
    // "Sunday, July 19 · 11:59pm CT"
    const dayName = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Chicago" });
    const monthDay = d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Chicago" });
    return `${dayName}, ${monthDay} · 11:59pm CT`;
}

function escapeText(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function truncate(s: string, n: number): string {
    return s.length <= n ? s : `${s.slice(0, n - 1).trim()}…`;
}

