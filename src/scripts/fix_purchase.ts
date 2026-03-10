import { prisma } from '../lib/prisma'

async function main() {
    const email = 'qasimmarshadjaveed@gmail.com'
    const user = await prisma.user.findUnique({
        where: { email: email }
    })

    const lastSoldListing = await prisma.listing.findFirst({
        where: { status: 'SOLD' },
        orderBy: { updated_at: 'desc' }
    })

    console.log('User:', user?.id, email)
    console.log('Listing:', lastSoldListing?.id, lastSoldListing?.title, lastSoldListing?.price)

    if (user && lastSoldListing) {
        // Check if a purchase already exists
        const existing = await prisma.purchase.findFirst({
            where: { listing_id: lastSoldListing.id }
        })
        if (!existing) {
            const p = await prisma.purchase.create({
                data: {
                    buyer_id: user.id,
                    listing_id: lastSoldListing.id,
                    amount: lastSoldListing.price,
                    stripe_session_id: 'MANUAL_FIX'
                }
            })
            console.log('Created manual purchase record:', p.id)
        } else {
            console.log('Purchase record already exists for this listing:', existing.id)
        }
    } else {
        console.log('Could not find user or last sold listing.')
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
