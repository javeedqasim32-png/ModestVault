import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const admins = await prisma.user.findMany({ where: { is_admin: true } });
    console.log("Found admins:", admins.map(a => a.email));
}

main().catch(console.error).finally(() => process.exit(0));
