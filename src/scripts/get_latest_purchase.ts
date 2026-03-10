import { prisma } from '../lib/prisma'

async function main() {
    const lastPurchase = await prisma.purchase.findFirst({
        orderBy: { created_at: 'desc' },
        include: { listing: true }
    })

    if (lastPurchase) {
        console.log(JSON.stringify(lastPurchase, null, 2))
    } else {
        console.log('No purchases found.')
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
