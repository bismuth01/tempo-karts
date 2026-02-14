# Sprite Sheet Description and Position Map

## Sources
- Main environment/UI sheet: `tempo-karts/public/assets/sprite-sheet.png` (`1024 x 1536`)
- Kart-only sheet: `tempo-karts/public/assets/kart-sheet.png` (`1536 x 1024`)
- HUD-only sheet: `tempo-karts/public/assets/hud-sheet.png` (`1536 x 1024`)
- Coordinate system: top-left origin
- Format used below: `asset_name -> x, y, w, h`

## Important
- Mapping is based on the generated sheet content (as visible in your screenshot), not the original generation prompt.
- Karts are now moved to `kart-sheet.png` and should no longer be sourced from row 1/2 of `sprite-sheet.png`.
- Asset names are descriptive; a few are inferred where the generator produced stylistic variants.

## Kart Sheet (New, Active)
- `kart_blue_base_down` -> `119, 375, 211, 245`
- `kart_blue_base_down_left` -> `372, 380, 261, 234`
- `kart_blue_base_left` -> `647, 390, 284, 232`
- `kart_blue_base_up_left` -> `946, 377, 259, 238`
- `kart_blue_base_up` -> `1247, 372, 211, 240`

## HUD Sheet (New, Active)
- `hud_panel_wood_square` -> `128, 32, 257, 240`
- `hud_panel_stone_square` -> `415, 34, 250, 236`
- `hud_panel_parchment_large` -> `687, 33, 448, 168`
- `hud_panel_wood_strip` -> `128, 304, 344, 73`
- `hud_panel_stone_strip` -> `509, 304, 340, 73`
- `hud_bar_bg_stone` -> `808, 595, 289, 61`
- `hud_bar_hp_high` -> `128, 678, 344, 50`
- `hud_bar_hp_mid` -> `488, 678, 297, 50`
- `hud_bar_hp_low` -> `808, 677, 294, 51`
- `hud_button_small_yellow` -> `552, 760, 144, 56`
- `hud_icon_none` -> `128, 847, 111, 97`
- `hud_icon_rocket` -> `248, 848, 106, 96`
- `hud_icon_bomb` -> `360, 848, 108, 96`
- `hud_icon_bullet` -> `584, 848, 106, 96`
- `hud_icon_crate` -> `698, 848, 106, 96`
- `hud_icon_question` -> `813, 847, 107, 97`
- `hud_icon_trophy_skull_heart_strip` -> `944, 860, 171, 82`

## 8 Direction Runtime Mapping (From 5 Base Sprites)
- Index order used in code: `0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE`
- `E` -> frame `kart_blue_base_left`, `flipX=true`, `angle=0`
- `SE` -> frame `kart_blue_base_down_left`, `flipX=true`, `angle=0`
- `S` -> frame `kart_blue_base_down`, `flipX=false`, `angle=0`
- `SW` -> frame `kart_blue_base_down_left`, `flipX=false`, `angle=0`
- `W` -> frame `kart_blue_base_left`, `flipX=false`, `angle=0`
- `NW` -> frame `kart_blue_base_up_left`, `flipX=false`, `angle=0`
- `N` -> frame `kart_blue_base_up`, `flipX=false`, `angle=0`
- `NE` -> frame `kart_blue_base_up_left`, `flipX=true`, `angle=0`

## Row 3 (Terrain / Track Tiles)
- `tile_grass` -> `24, 320, 147, 134`
- `tile_dirt` -> `186, 321, 150, 135`
- `tile_start_checker` -> `350, 322, 154, 133`
- `tile_stone_wall` -> `520, 320, 150, 134`
- `tile_wood_fence` -> `682, 320, 156, 135`
- `tile_cliff_water_edge` -> `848, 320, 153, 134`

## Row 4 (Pickups / Weapons / Small Projectiles)
- `weapon_crate_a` -> `32, 506, 104, 94`
- `weapon_crate_b` -> `170, 506, 110, 94`
- `rocket_missile` -> `318, 534, 140, 55`
- `bomb_state_01` -> `487, 504, 78, 94`
- `bomb_state_02` -> `581, 508, 67, 90`
- `bomb_state_03` -> `680, 510, 86, 88`
- `projectile_spark_01` -> `803, 560, 66, 28`
- `projectile_spark_02` -> `888, 549, 49, 45`
- `projectile_spark_03` -> `949, 550, 46, 46`

## Row 5 (Aura + Explosion + Smoke Set A)
- `aura_a_01` -> `32, 650, 118, 110`
- `aura_a_02` -> `160, 650, 115, 110`
- `explosion_a_01` -> `302, 650, 115, 110`
- `explosion_a_02` -> `432, 649, 120, 111`
- `explosion_a_03` -> `568, 650, 124, 111`
- `smoke_a_01` -> `712, 651, 120, 109`
- `smoke_a_02` -> `852, 651, 146, 109`

## Row 6 (HUD Large: Hearts + Dust + Timer Board)
- `heart_large_red` -> `39, 810, 65, 54`
- `heart_large_gray` -> `121, 808, 69, 56`
- `heart_large_white` -> `204, 810, 66, 53`
- `dust_large_01` -> `320, 816, 56, 45`
- `dust_large_02` -> `379, 816, 50, 46`
- `dust_large_03` -> `442, 812, 66, 51`
- `dust_large_04` -> `528, 811, 62, 52`
- `dust_large_05` -> `606, 812, 61, 52`
- `timer_board_large` -> `704, 808, 281, 76`

## Row 7 (HUD Medium: Hearts / Slots / Arrows)
- `heart_med_red` -> `32, 923, 62, 53`
- `heart_med_dark` -> `104, 926, 57, 49`
- `badge_med_shield` -> `176, 923, 48, 52`
- `slot_med_wood` -> `278, 923, 77, 58`
- `slot_med_stone` -> `380, 922, 80, 59`
- `slot_med_crate` -> `480, 922, 49, 54`
- `slot_med_question` -> `544, 924, 47, 53`
- `arrow_med_01` -> `640, 937, 48, 34`
- `arrow_med_02` -> `693, 936, 34, 38`
- `arrow_med_03` -> `744, 936, 36, 35`
- `arrow_med_04` -> `792, 936, 37, 37`
- `arrow_med_05` -> `843, 936, 36, 35`
- `arrow_med_06` -> `891, 936, 36, 34`
- `arrow_med_07` -> `941, 937, 37, 35`

## Row 8 (Explosion/Smoke Strip B)
- `explosion_b_01` -> `31, 1032, 154, 125`
- `explosion_b_02` -> `200, 1032, 164, 126`
- `explosion_b_03` -> `377, 1032, 183, 125`
- `smoke_b_strip` -> `567, 1032, 429, 125`

## Row 9 (Aura + Explosion + Smoke Set C)
- `aura_c_01` -> `32, 1225, 128, 111`
- `aura_c_02` -> `184, 1227, 139, 107`
- `explosion_c_01` -> `343, 1227, 113, 107`
- `smoke_c_01` -> `472, 1227, 138, 109`
- `smoke_c_02` -> `631, 1227, 169, 109`
- `smoke_c_03` -> `819, 1227, 178, 109`

## Row 10 (HUD Small: Hearts / Slots / Arrows)
- `heart_small_red` -> `26, 1409, 64, 53`
- `heart_small_dark` -> `96, 1409, 61, 52`
- `heart_small_white` -> `165, 1409, 64, 52`
- `slot_small_wood` -> `279, 1408, 98, 64`
- `slot_small_stone` -> `403, 1408, 95, 64`
- `slot_small_question` -> `512, 1408, 58, 63`
- `arrow_small_01` -> `655, 1423, 33, 30`
- `arrow_small_02` -> `697, 1420, 37, 36`
- `arrow_small_03` -> `747, 1419, 36, 35`
- `arrow_small_04` -> `808, 1418, 28, 36`
- `arrow_small_05` -> `840, 1419, 32, 36`
- `arrow_small_06` -> `896, 1421, 40, 35`
- `arrow_small_07` -> `943, 1421, 41, 34`

## Practical Grouping for Game Use
- Core racing + map: `kart-sheet.png` + Rows 3-4
- Combat VFX: Rows 5, 8, 9
- HUD/icon sets by scale: Rows 6, 7, 10
