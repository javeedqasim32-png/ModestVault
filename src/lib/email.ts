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
