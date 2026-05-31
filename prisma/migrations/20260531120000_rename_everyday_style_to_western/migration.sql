-- Data migration: rename the "Everyday" style to "Western" so existing
-- listings stay valid after the taxonomy update. Schema is unchanged.
UPDATE "Listing" SET style = 'Western' WHERE style = 'Everyday';
