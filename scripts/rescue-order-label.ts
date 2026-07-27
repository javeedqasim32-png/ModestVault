/**
 * Modaire — one-off rescue for orders where checkout finalize captured
 * payment but the auto-label purchase to Shippo failed silently. Those
 * orders sit at order_status=PAID / shipping_stage=OPTION_SELECTED with
 * NULL tracking_number / label_url / shippo_transaction_id.
 *
 * The buyer's card is not touched — Shippo bills the marketplace's
 * Shippo balance. Buyer already paid the shipping cost via Stripe.
 *
 * Usage:
 *   npx tsx scripts/rescue-order-label.ts <orderId>
 */

import dotenv from "dotenv";
dotenv.config();

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { purchaseLabel } from "../src/lib/shippo";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
}
const adapter = new PrismaPg({ connectionString } as any);
const prisma = new PrismaClient({ adapter });

async function run() {
    const orderId = process.argv[2];
    if (!orderId) {
        console.error("Usage: npx tsx scripts/rescue-order-label.ts <orderId>");
        process.exit(1);
    }

    console.log(`=== Rescue label for order ${orderId} ===`);

    const order = await (prisma as any).order.findUnique({ where: { id: orderId } });
    if (!order) {
        console.error(`Order ${orderId} not found.`);
        process.exit(1);
    }

    console.log(`  order_status:    ${order.order_status}`);
    console.log(`  shipping_status: ${order.shipping_status}`);
    console.log(`  shipping_stage:  ${order.shipping_stage}`);
    console.log(`  carrier:         ${order.carrier ?? "(null)"}`);
    console.log(`  rate_id:         ${order.shipping_option_rate_id ?? "(null)"}`);
    console.log(`  label_url:       ${order.label_url ?? "(null)"}`);
    console.log(`  tracking_number: ${order.tracking_number ?? "(null)"}`);

    if (order.label_url && order.tracking_number) {
        console.log("Order already has a label — nothing to rescue.");
        await prisma.$disconnect();
        return;
    }
    if (order.order_status !== "PAID") {
        console.error(`Refusing to buy label — order_status is "${order.order_status}", expected "PAID".`);
        process.exit(1);
    }
    if (!order.shipping_option_rate_id) {
        console.error("Refusing to buy label — no shipping_option_rate_id on this order.");
        process.exit(1);
    }

    console.log("");
    console.log("Calling Shippo to purchase label...");
    const labelData = await purchaseLabel(order.shipping_option_rate_id);
    console.log(`  tracking_number:       ${labelData.tracking_number}`);
    console.log(`  shippo_transaction_id: ${labelData.shippo_transaction_id}`);
    console.log(`  label_url:             ${labelData.label_url}`);

    console.log("");
    console.log("Persisting to Order row...");
    const updated = await (prisma as any).order.update({
        where: { id: order.id },
        data: {
            shipping_stage: "LABEL_PURCHASED",
            shipping_status: "PROCESSING",
            tracking_number: labelData.tracking_number,
            carrier: order.shipping_option_carrier || order.carrier || "Carrier",
            shippo_transaction_id: labelData.shippo_transaction_id,
            label_url: labelData.label_url,
        },
    });

    console.log("");
    console.log("Rescued. Final row state:");
    console.log(`  shipping_status: ${updated.shipping_status}`);
    console.log(`  shipping_stage:  ${updated.shipping_stage}`);
    console.log(`  tracking_number: ${updated.tracking_number}`);
    console.log(`  label_url:       ${updated.label_url}`);
    console.log("");
    console.log("Next: forward tracking number to buyer via the in-app message thread.");

    await prisma.$disconnect();
}

run().catch(async (err) => {
    console.error("");
    console.error("Rescue FAILED:", err?.message || err);
    if (typeof err?.stack === "string") console.error(err.stack);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
});
