/**
 * Modaire — one-off backfill for PromotionInvitation.short_slug.
 *
 * The current summer-sale-2026 campaign's 91 invitations were created
 * before the SMS work landed, so they have no `short_slug`. Run this
 * before firing the SMS pass so `scripts/create-myrtle-campaign.ts
 * --send-sms` has valid short URLs to construct.
 *
 * Idempotent: rows that already have a short_slug are skipped. Safe to
 * re-run any time.
 *
 * Usage:
 *   npx tsx scripts/backfill-invitation-slugs.ts
 */

import { randomBytes } from "crypto";
import dotenv from "dotenv";
dotenv.config();

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
}
const adapter = new PrismaPg({ connectionString } as any);
const prisma = new PrismaClient({ adapter });

function makeSlug(): string {
    // 8 random bytes → base64url → 10 chars.  62^10 ≈ 8×10^17 combos, safe
    // against enumeration and TCC exhaust on a small table.
    return randomBytes(8).toString("base64url").slice(0, 10);
}

async function run() {
    console.log("=== PromotionInvitation short_slug backfill ===");
    const targets = await prisma.promotionInvitation.findMany({
        where: { short_slug: null },
        select: { id: true },
    });
    console.log(`  ${targets.length} invitation(s) missing short_slug.`);

    let updated = 0;
    let collisions = 0;
    for (const t of targets) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const slug = makeSlug();
            try {
                await prisma.promotionInvitation.update({
                    where: { id: t.id },
                    data: { short_slug: slug },
                });
                updated += 1;
                break;
            } catch (err: any) {
                // P2002 = unique constraint violation. Retry with a new
                // random slug. Extremely unlikely at these odds but the
                // retry costs nothing.
                if (err?.code === "P2002") {
                    collisions += 1;
                    if (attempt === 2) {
                        console.error(
                            `  ❌ 3 collisions for invitation ${t.id} — giving up on this row`,
                        );
                    }
                    continue;
                }
                throw err;
            }
        }
    }

    console.log(`  ✅ Backfilled ${updated} slug(s). ${collisions} retry collision(s).`);
    await prisma.$disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
