-- Server-side shop (Blockerino 2.0).
-- owned_item_ids used to be writable by the client, so anyone could give themselves every cosmetic.
--   * shop_catalog: price and kind of every item. It mirrors constants/Shop.ts; a Jest test
--     (constants/ShopCatalog.test.ts) fails when the two drift apart. Regenerate the rows when the
--     client catalog changes.
--       free          - everyone owns it (starter cosmetics)
--       paid          - bought with coins through purchase_shop_item()
--       client_secret - unlocked by a hidden in-app mechanic, harmless (custom music / sfx link)
--       server_only   - granted by the server only (season podium rewards)
--   * clients may only ADD free / client_secret items to their own list and never lose an owned one;
--     everything else goes through purchase_shop_item() or a SECURITY DEFINER grant.

CREATE TABLE IF NOT EXISTS public.shop_catalog (
  item_id text PRIMARY KEY,
  price integer NOT NULL CHECK (price >= 0),
  kind text NOT NULL CHECK (kind IN ('free', 'paid', 'client_secret', 'server_only'))
);

ALTER TABLE public.shop_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_catalog FROM anon, authenticated;

INSERT INTO public.shop_catalog (item_id, price, kind) VALUES
  ('chess_piece_classic', 0, 'free'),
  ('chess_piece_royal', 500, 'paid'),
  ('chess_piece_club', 800, 'paid'),
  ('chess_piece_neon', 650, 'paid'),
  ('chess_piece_ember', 700, 'paid'),
  ('chess_piece_frost', 850, 'paid'),
  ('chess_board_slate', 0, 'free'),
  ('chess_board_violet', 300, 'paid'),
  ('chess_board_walnut', 600, 'paid'),
  ('chess_board_emerald', 450, 'paid'),
  ('chess_board_ice', 550, 'paid'),
  ('chess_board_candy', 700, 'paid'),
  ('sea_skin_navy', 0, 'free'),
  ('sea_skin_paper', 400, 'paid'),
  ('sea_skin_sonar', 500, 'paid'),
  ('sea_skin_sunset', 550, 'paid'),
  ('sea_skin_blueprint', 650, 'paid'),
  ('card_skin_classic', 0, 'free'),
  ('card_skin_casino', 750, 'paid'),
  ('card_skin_midnight', 700, 'paid'),
  ('card_skin_forest', 800, 'paid'),
  ('card_skin_sakura', 900, 'paid'),
  ('sudoku_theme_wood', 0, 'free'),
  ('sudoku_theme_night', 300, 'paid'),
  ('sudoku_theme_mint', 350, 'paid'),
  ('sudoku_theme_ocean', 450, 'paid'),
  ('sudoku_theme_neon', 550, 'paid'),
  ('mahjong_theme_jade', 0, 'free'),
  ('mahjong_theme_ivory', 500, 'paid'),
  ('mahjong_theme_onyx', 600, 'paid'),
  ('mahjong_theme_ruby', 650, 'paid'),
  ('mahjong_theme_sakura', 750, 'paid'),
  ('piece_classic', 0, 'free'),
  ('piece_minecraft', 120, 'paid'),
  ('piece_crystal', 220, 'paid'),
  ('piece_lava', 320, 'paid'),
  ('piece_circuit', 420, 'paid'),
  ('background_classic', 0, 'free'),
  ('background_ender', 160, 'paid'),
  ('background_sunset', 240, 'paid'),
  ('background_ice', 300, 'paid'),
  ('background_cyber', 380, 'paid'),
  ('music_classic', 0, 'free'),
  ('music_lofi', 140, 'paid'),
  ('music_arcade', 220, 'paid'),
  ('music_cave', 280, 'paid'),
  ('music_space', 360, 'paid'),
  ('sfx_classic', 0, 'free'),
  ('sfx_wood', 140, 'paid'),
  ('sfx_glass', 220, 'paid'),
  ('sfx_retro', 300, 'paid'),
  ('sfx_metal', 380, 'paid'),
  ('music_custom', 0, 'client_secret'),
  ('sfx_custom', 0, 'client_secret'),
  ('background_season_gold', 0, 'server_only'),
  ('background_season_silver', 0, 'server_only'),
  ('background_season_bronze', 0, 'server_only'),
  ('piece_minecraft_moss', 180, 'paid'),
  ('piece_minecraft_deepslate', 210, 'paid'),
  ('piece_minecraft_gold', 240, 'paid'),
  ('piece_minecraft_nether', 270, 'paid'),
  ('piece_minecraft_prismarine', 300, 'paid'),
  ('piece_crystal_aqua', 260, 'paid'),
  ('piece_crystal_amethyst', 300, 'paid'),
  ('piece_crystal_rose', 320, 'paid'),
  ('piece_crystal_emerald', 340, 'paid'),
  ('piece_crystal_sun', 360, 'paid'),
  ('piece_lava_obsidian', 300, 'paid'),
  ('piece_lava_solar', 330, 'paid'),
  ('piece_lava_ember', 360, 'paid'),
  ('piece_lava_basalt', 390, 'paid'),
  ('piece_lava_magma', 420, 'paid'),
  ('piece_circuit_matrix', 320, 'paid'),
  ('piece_circuit_neon', 350, 'paid'),
  ('piece_circuit_plasma', 380, 'paid'),
  ('piece_circuit_terminal', 410, 'paid'),
  ('piece_circuit_candy', 440, 'paid'),
  ('piece_paper_cut', 460, 'paid'),
  ('piece_ocean_shell', 480, 'paid'),
  ('piece_monochrome', 500, 'paid'),
  ('piece_candy_pop', 520, 'paid'),
  ('piece_shadow_gold', 540, 'paid'),
  ('piece_forest_mushroom', 560, 'paid'),
  ('piece_aurora_glass', 580, 'paid'),
  ('piece_neon_fruit', 600, 'paid'),
  ('piece_ink_stamp', 620, 'paid'),
  ('piece_cosmic_ore', 640, 'paid'),
  ('piece_moonstone', 660, 'paid'),
  ('piece_jade_tile', 680, 'paid'),
  ('piece_ruby_cut', 700, 'paid'),
  ('piece_sapphire_cut', 720, 'paid'),
  ('piece_topaz_tile', 740, 'paid'),
  ('piece_ghost_ink', 760, 'paid'),
  ('piece_radioactive', 780, 'paid'),
  ('piece_storm_cloud', 800, 'paid'),
  ('piece_pearl_shell', 820, 'paid'),
  ('piece_arcade_gum', 840, 'paid'),
  ('piece_desert_clay', 860, 'paid'),
  ('piece_night_market', 880, 'paid'),
  ('piece_laser_grid', 900, 'paid'),
  ('piece_snow_mint', 920, 'paid'),
  ('piece_copper_wire', 940, 'paid'),
  ('piece_royal_velvet', 960, 'paid'),
  ('piece_magma_ice', 980, 'paid'),
  ('piece_lime_shadow', 1000, 'paid'),
  ('piece_peach_soda', 1020, 'paid'),
  ('piece_void_pearl', 1040, 'paid'),
  ('background_aurora', 180, 'paid'),
  ('background_midnight', 200, 'paid'),
  ('background_volcano', 220, 'paid'),
  ('background_mint', 240, 'paid'),
  ('background_plum', 260, 'paid'),
  ('background_copper', 280, 'paid'),
  ('background_lagoon', 300, 'paid'),
  ('background_ruby', 320, 'paid'),
  ('background_terminal', 340, 'paid'),
  ('background_starlit', 360, 'paid'),
  ('background_candy', 380, 'paid'),
  ('background_gold', 400, 'paid'),
  ('background_frost', 420, 'paid'),
  ('background_void', 440, 'paid'),
  ('background_lime', 460, 'paid'),
  ('background_rose', 480, 'paid'),
  ('background_ocean', 500, 'paid'),
  ('background_ultraviolet', 520, 'paid'),
  ('background_solar', 540, 'paid'),
  ('background_quartz', 560, 'paid'),
  ('background_paper_dawn', 580, 'paid'),
  ('background_deep_forest', 600, 'paid'),
  ('background_coral_sea', 620, 'paid'),
  ('background_mono_lab', 640, 'paid'),
  ('background_lilac_mist', 660, 'paid'),
  ('background_amber_room', 680, 'paid'),
  ('background_steel_rain', 700, 'paid'),
  ('background_melon_arcade', 720, 'paid'),
  ('background_blueprint', 740, 'paid'),
  ('background_crimson_fog', 760, 'paid'),
  ('background_moonbase', 780, 'paid'),
  ('background_emerald_rain', 800, 'paid'),
  ('background_desert_stars', 820, 'paid'),
  ('background_neon_market', 840, 'paid'),
  ('background_glacier_depth', 860, 'paid'),
  ('background_cherry_night', 880, 'paid'),
  ('background_storm_cell', 900, 'paid'),
  ('background_jade_temple', 920, 'paid'),
  ('background_peach_dusk', 940, 'paid'),
  ('background_violet_lab', 960, 'paid'),
  ('background_magma_sea', 980, 'paid'),
  ('background_arctic_wire', 1000, 'paid'),
  ('background_mint_noir', 1020, 'paid'),
  ('background_ruby_night', 1040, 'paid'),
  ('background_circuit_bloom', 1060, 'paid'),
  ('background_pearl_void', 1080, 'paid'),
  ('background_bronze_city', 1100, 'paid'),
  ('background_rain_window', 1120, 'paid'),
  ('background_pixel_meadow', 1140, 'paid'),
  ('background_eclipse_gold', 1160, 'paid'),
  ('music_lofi_rain', 180, 'paid'),
  ('music_lofi_rooftop', 200, 'paid'),
  ('music_lofi_midnight', 220, 'paid'),
  ('music_lofi_cafe', 240, 'paid'),
  ('music_lofi_clouds', 260, 'paid'),
  ('music_arcade_turbo', 280, 'paid'),
  ('music_arcade_combo', 300, 'paid'),
  ('music_arcade_pixel', 320, 'paid'),
  ('music_arcade_neon', 340, 'paid'),
  ('music_arcade_boss', 360, 'paid'),
  ('music_cave_drip', 300, 'paid'),
  ('music_cave_depth', 320, 'paid'),
  ('music_cave_crystal', 340, 'paid'),
  ('music_cave_ember', 360, 'paid'),
  ('music_cave_echo', 380, 'paid'),
  ('music_space_orbit', 340, 'paid'),
  ('music_space_comet', 360, 'paid'),
  ('music_space_nebula', 380, 'paid'),
  ('music_space_satellite', 400, 'paid'),
  ('music_space_void', 420, 'paid'),
  ('music_salsa', 440, 'paid'),
  ('music_hardstyle', 460, 'paid'),
  ('music_music_box', 480, 'paid'),
  ('music_harp', 500, 'paid'),
  ('music_breakbeat', 520, 'paid'),
  ('music_dub', 540, 'paid'),
  ('music_garage', 560, 'paid'),
  ('music_minimal', 580, 'paid'),
  ('music_waltz', 600, 'paid'),
  ('music_future_bass', 620, 'paid'),
  ('music_bossa_blocks', 640, 'paid'),
  ('music_dungeon_low', 660, 'paid'),
  ('music_meteor_shower', 680, 'paid'),
  ('music_sunrise_pad', 700, 'paid'),
  ('music_circuit_calm', 720, 'paid'),
  ('music_crystal_run', 740, 'paid'),
  ('music_ocean_pulse', 760, 'paid'),
  ('music_desert_night', 780, 'paid'),
  ('music_steel_dream', 800, 'paid'),
  ('music_snowfall', 820, 'paid'),
  ('music_forest_walk', 840, 'paid'),
  ('music_vapor_trail', 860, 'paid'),
  ('music_puzzle_focus', 880, 'paid'),
  ('music_thunder_room', 900, 'paid'),
  ('music_koto_steps', 920, 'paid'),
  ('music_western_dust', 940, 'paid'),
  ('music_deep_house', 960, 'paid'),
  ('music_chip_calm', 980, 'paid'),
  ('music_marimba_run', 1000, 'paid'),
  ('music_cosmic_bell', 1020, 'paid'),
  ('sfx_wood_oak', 180, 'paid'),
  ('sfx_wood_bamboo', 200, 'paid'),
  ('sfx_wood_chest', 220, 'paid'),
  ('sfx_wood_plank', 240, 'paid'),
  ('sfx_wood_forest', 260, 'paid'),
  ('sfx_glass_frost', 240, 'paid'),
  ('sfx_glass_prism', 260, 'paid'),
  ('sfx_glass_ice', 280, 'paid'),
  ('sfx_glass_neon', 300, 'paid'),
  ('sfx_glass_chime', 320, 'paid'),
  ('sfx_retro_chip', 280, 'paid'),
  ('sfx_retro_terminal', 300, 'paid'),
  ('sfx_retro_laser', 320, 'paid'),
  ('sfx_retro_coin', 340, 'paid'),
  ('sfx_retro_console', 360, 'paid'),
  ('sfx_metal_steel', 320, 'paid'),
  ('sfx_metal_anvil', 340, 'paid'),
  ('sfx_metal_robot', 360, 'paid'),
  ('sfx_metal_cyber', 380, 'paid'),
  ('sfx_metal_titan', 400, 'paid'),
  ('sfx_camera', 420, 'paid'),
  ('sfx_clock', 440, 'paid'),
  ('sfx_rubber', 460, 'paid'),
  ('sfx_ceramic', 480, 'paid'),
  ('sfx_spark', 500, 'paid'),
  ('sfx_bass', 520, 'paid'),
  ('sfx_digital', 540, 'paid'),
  ('sfx_magic', 560, 'paid'),
  ('sfx_crunch', 580, 'paid'),
  ('sfx_wind', 600, 'paid'),
  ('sfx_quartz', 620, 'paid'),
  ('sfx_velvet', 640, 'paid'),
  ('sfx_arcade', 660, 'paid'),
  ('sfx_moon', 680, 'paid'),
  ('sfx_jade', 700, 'paid'),
  ('sfx_rain', 720, 'paid'),
  ('sfx_pearl', 740, 'paid'),
  ('sfx_thunder', 760, 'paid'),
  ('sfx_neon', 780, 'paid'),
  ('sfx_snow', 800, 'paid'),
  ('sfx_copper', 820, 'paid'),
  ('sfx_ghost', 840, 'paid'),
  ('sfx_lime', 860, 'paid'),
  ('sfx_orbit', 880, 'paid'),
  ('sfx_bronze', 900, 'paid'),
  ('sfx_silk', 920, 'paid'),
  ('sfx_starlight', 940, 'paid'),
  ('sfx_clack', 960, 'paid'),
  ('sfx_peach', 980, 'paid'),
  ('sfx_void', 1000, 'paid')
ON CONFLICT (item_id) DO UPDATE SET price = EXCLUDED.price, kind = EXCLUDED.kind;

-- Items a client may add to its own list without paying.
CREATE OR REPLACE FUNCTION public.shop_client_grantable_items()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(item_id), '{}') FROM public.shop_catalog WHERE kind IN ('free', 'client_secret');
$$;

REVOKE ALL ON FUNCTION public.shop_client_grantable_items() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shop_client_grantable_items() TO anon, authenticated;

-- Runs as the caller, so dashboard / service_role / SECURITY DEFINER functions are not restricted.
CREATE OR REPLACE FUNCTION public.profiles_owned_items_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_grantable text[];
  v_old text[];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  v_grantable := public.shop_client_grantable_items();
  v_old := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.owned_item_ids, '{}') ELSE '{}' END;

  NEW.owned_item_ids := ARRAY(
    SELECT DISTINCT item
      FROM unnest(v_old || COALESCE(NEW.owned_item_ids, '{}')) AS item
     WHERE item = ANY (v_old) OR item = ANY (v_grantable)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_owned_items_guard ON public.profiles;
CREATE TRIGGER trg_profiles_owned_items_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_owned_items_guard();

-- Buys an item with the coins stored on the server. Returns {status, coins, owned_item_ids}.
CREATE OR REPLACE FUNCTION public.purchase_shop_item(p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item public.shop_catalog%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_owned text[];
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;

  SELECT * INTO v_item FROM public.shop_catalog WHERE item_id = p_item_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unknown_item'); END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'no_profile'); END IF;

  v_owned := COALESCE(v_profile.owned_item_ids, '{}');
  IF p_item_id = ANY (v_owned) THEN
    RETURN jsonb_build_object('status', 'owned', 'coins', v_profile.coins, 'owned_item_ids', to_jsonb(v_owned));
  END IF;

  IF v_item.kind IN ('client_secret', 'server_only') THEN
    RETURN jsonb_build_object('status', 'not_for_sale', 'coins', v_profile.coins, 'owned_item_ids', to_jsonb(v_owned));
  END IF;

  IF v_profile.coins < v_item.price THEN
    RETURN jsonb_build_object('status', 'not_enough_coins', 'coins', v_profile.coins, 'owned_item_ids', to_jsonb(v_owned));
  END IF;

  UPDATE public.profiles
     SET coins = coins - v_item.price,
         owned_item_ids = array_append(v_owned, p_item_id)
   WHERE id = v_profile.id
  RETURNING coins, owned_item_ids INTO v_profile.coins, v_owned;

  RETURN jsonb_build_object('status', 'purchased', 'coins', v_profile.coins, 'owned_item_ids', to_jsonb(v_owned));
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_shop_item(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_shop_item(text) TO authenticated;
