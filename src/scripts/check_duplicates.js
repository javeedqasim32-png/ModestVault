const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    const res = await pool.query('SELECT stripe_session_id, COUNT(*) FROM "Purchase" GROUP BY stripe_session_id HAVING COUNT(*) > 1');
    console.log('Duplicates:', res.rows);
    await pool.end();
}

main().catch(console.error);
