-- The "own music / own sounds link" items are gone from the game (2.0.9): drop them from the server catalog so the
-- client and server catalogs match. Nothing references the rows (chests only roll 'paid' items); a profile that still
-- lists them simply keeps two unknown ids, which the client ignores and normalizes away.
DELETE FROM public.shop_catalog WHERE item_id IN ('music_custom', 'sfx_custom');
