import nodemailer from 'nodemailer';

// Configure the nodemailer transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
    service: 'gmail',
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

export async function sendSaleNotificationEmail(email: string, listingTitle: string, amount: number): Promise<void> {
    try {
        const mailOptions = {
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Good news! Your item has been sold on Modaire',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #4a3328;">You made a sale!</h2>
                    <p>Congratulations! Your item <strong>${listingTitle}</strong> was just purchased.</p>
                    <div style="background: #f9f4f1; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0; font-size: 14px; color: #8a7667;">Sale Price</p>
                        <h1 style="margin: 5px 0; color: #2f2925;">$${amount.toFixed(2)}</h1>
                    </div>
                    <p>Please log in to your dashboard to download your shipping label and fulfill the order.</p>
                    <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/sales" style="display: inline-block; background: #a07c61; color: white; padding: 12px 25px; text-decoration: none; border-radius: 25px; font-weight: bold; margin-top: 10px;">View Order</a>
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
