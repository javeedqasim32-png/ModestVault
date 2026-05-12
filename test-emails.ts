const nodemailer = require('nodemailer');
require('dotenv').config();

async function runTests() {
    console.log("🚀 Starting email tests (Manual Bypass)...");
    
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_APP_PASSWORD?.replace(/\s/g, ''),
        },
    });

    const testEmail = "payitforwardlunch@gmail.com";
    const testTitle = "Vintage Mohair Cardigan";

    try {
        console.log("- Sending Test Sale Notification...");
        await transporter.sendMail({
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: testEmail,
            subject: 'Good news! Your item has been sold on Modaire',
            html: `<h2>You made a sale!</h2><p>Item: ${testTitle}</p><p>This is a test of the new template.</p>`
        });

        console.log("- Sending Test Order Confirmation...");
        await transporter.sendMail({
            from: `"Modaire" <${process.env.EMAIL_USER}>`,
            to: testEmail,
            subject: 'Order Confirmation - Modaire',
            html: `<h2>Thank you for your purchase!</h2><p>Item: ${testTitle}</p><p>This is a test of the new template.</p>`
        });

        console.log("✅ Emails sent successfully!");
    } catch (err) {
        console.error("❌ Still failed:", err.message);
    }
}

runTests();
