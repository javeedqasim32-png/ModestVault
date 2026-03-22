const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is not set");
    }
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    const user = await prisma.user.findFirst();
    if (!user) {
        console.error("No user found in database");
        process.exit(1);
    }

    console.log(`Adding listings for user: ${user.email} (${user.id})`);

    // First delete any existing test listings with these titles to avoid duplicates if re-run
    await prisma.listing.deleteMany({
        where: {
            title: {
                in: ["Aeterna Automatic Chronometer", "C&A Premium Leather Handbag"]
            }
        }
    });

    await prisma.listing.create({
        data: {
            user_id: user.id,
            title: "Aeterna Automatic Chronometer",
            description: "A rare and sophisticated timepiece featuring a brushed silver dial and automatic movement. Perfect for the modern collector.",
            price: 1250,
            style: "Formals",
            category: "Accessories",
            subcategory: "Jewelry",
            condition: "MINT",
            image_url: "/listings/watch.png", // Local path
            status: "AVAILABLE",
            moderation_status: "APPROVED"
        }
    });

    await prisma.listing.create({
        data: {
            user_id: user.id,
            title: "C&A Premium Leather Handbag",
            description: "Exquisite craftsmanship meets timeless design. This premium leather handbag features gold-tone hardware and a spacious interior.",
            price: 850,
            style: "Everyday",
            category: "Accessories",
            subcategory: "Bags",
            condition: "NEW",
            image_url: "/listings/handbag.png", // Local path
            status: "AVAILABLE",
            moderation_status: "APPROVED"
        }
    });

    console.log("Test listings created successfully!");
    await prisma.$disconnect();
    await pool.end();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
