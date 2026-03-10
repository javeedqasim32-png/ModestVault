INSERT INTO "Purchase" (id, buyer_id, listing_id, amount, stripe_session_id, created_at)
SELECT 
    l.id || '-p', 
    u.id, 
    l.id, 
    l.price, 
    'MANUAL_FIX', 
    now()
FROM "User" u, "Listing" l
WHERE u.email = 'qasimmarshadjaveed@gmail.com'
AND l.status = 'SOLD'
AND NOT EXISTS (SELECT 1 FROM "Purchase" p WHERE p.listing_id = l.id)
ORDER BY l.updated_at DESC
LIMIT 1;
