const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    const res = await pool.query('SELECT stripe_session_id, amount FROM "Purchase" ORDER BY created_at DESC LIMIT 1');
    if (res.rows.length > 0) {
        console.log(JSON.stringify(res.rows[0]));
    } else {
        console.log('No purchases found');
    }
    await pool.end();
}

main().catch(console.error);
