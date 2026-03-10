const Stripe = require('stripe');
require('dotenv').config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function main() {
    const sessionId = 'cs_test_a1MkzR7EQnVpjGkloVeMrAe5i9Wel1ZqdidpfMBeUr9I1Tcmmrlrkj058d';
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent'],
    });

    const pi = session.payment_intent;
    console.log('--- Stripe Session Details ---');
    console.log('Total Amount:', session.amount_total / 100, session.currency.toUpperCase());
    console.log('Application Fee:', pi.application_fee_amount / 100);
    console.log('Seller Amount (Destination):', (pi.amount - pi.application_fee_amount) / 100);
    console.log('Transfer to Seller ID:', pi.transfer_data?.destination);
    console.log('Payment Status:', session.payment_status);
}

main().catch(console.error);
