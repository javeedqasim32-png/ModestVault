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

