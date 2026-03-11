import { Resend } from 'resend';

// Securely load the API key from the .env file
const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
    try {
        await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: email, // The user's email address
            subject: 'Your ModestVault Verification Code',
            html: `<p>Your verification code is: <strong>${code}</strong></p>`
        });

        console.log(`✉️ VERIFICATION EMAIL SENT to ${email} via Resend`);
    } catch (error) {
        console.error("❌ Failed to send verification email:", error);
    }
}
