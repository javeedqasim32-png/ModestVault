/**
 * Placeholder Email Service Utility
 * 
 * In the future, this can be integrated with:
 * - AWS SES
 * - SendGrid
 * - Resend
 * - Mailgun
 * - Postmark
 */

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
    // TODO: Connect to real email provider here
    console.log("=========================================");
    console.log("✉️  MOCK EMAIL SENT");
    console.log(`To: ${email}`);
    console.log(`Subject: Your ModestVault Verification Code`);
    console.log(`Code: ${code}`);
    console.log("=========================================");

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
}
