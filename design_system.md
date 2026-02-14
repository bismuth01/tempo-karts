# TEMPO KARTS — Design System (Retro Village)

## Core Aesthetic

**"Rustic Pixel Village"** — A charming, nostalgic top-down racer set in a vibrant fantasy village. Think *Stardew Valley* meets *Super Mario Kart* (SNES). Warm lighting, hand-crafted pixel art, and organic textures (wood, stone, grass).

- **Keywords:** Cozy, Organic, Hand-drawn Pixel Art, Fantasy, Vibrant.
- **Inspirations:** Stardew Valley, Zelda: A Link to the Past, classic JRPGs, Mario Kart (SNES).
- **Art Style:** 16-bit or 32-bit pixel art. Clean outlines, solid colors with minimal shading (cel-shaded feel).

---

## 1. Color Palette

### Primary Colors (Player Identification)

To distinguish between multiple players in a chaotic race.

- **P1 Red:** `#E74C3C`
- **P2 Blue:** `#3498DB`
- **P3 Green:** `#2ECC71`
- **P4 Yellow:** `#F1C40F`
- **P5 Purple:** `#9B59B6`
- **P6 Orange:** `#E67E22`
- **P7 Cyan:** `#1ABC9C`
- **P8 Pink:** `#FF69B4`

### Gameplay Colors

- **Gold:** `#FFD700` (Coins, Invincibility, UI Accents)
- **Danger Red:** `#C0392B` (Enemy projectiles, explosions)
- **Magic Purple:** `#9B59B6` (Items, Mystery)

### Environment Colors

Earthy tones for the map.

- **Grass Green:** `#2ECC71` (Main ground)
- **Dirt Path:** `#D35400` (Track surface)
- **Stone Grey:** `#95A5A6` (Walls, obstacles)
- **Water Blue:** `#2980B9` (Hazards)

### UI Colors

- **Parchment Base:** `#FDF2E9` (Main UI background)
- **Wood Dark:** `#5D4037` (Borders, Headers)
- **Ink Black:** `#2C3E50` (Text)

---

## 2. Typography

### Title / Headings

**Font:** `VT323` or `Press Start 2P` (Google Fonts)

- **Visual:** Pixelated serif or blocky retro font.
- **Color:** Wood Dark or Gold.
- **Effect:** Drop shadow (hard edge, no blur).

### Body Text

**Font:** `Pixelify Sans` or `DotGothic16` (Google Fonts)

- **Visual:** Czytać, clean pixel font.
- **Color:** Ink Black.

---

## 3. UI Components

### Buttons

- **Style:** Wooden plank texture with darker wood border.
- **Texture:** Horizontal wood grain.
- **Hover:** Brightens slightly (`filter: brightness(1.1)`), "bounces" up 2px.
- **Active:** Depresses 2px, darker shade.

### HUD

- **Health:** Heart icons (Pixel art hearts). Empty hearts = grey background.
- **Item Slot:** A stone or wooden square frame.
- **Timer:** Digital font inside a wooden signpost graphic at the top.

---

## 4. Asset Specifications (For AI Generation)

**General Rule:** All sprites should have a consistent pixel density. We are targeting a "2x" scale look (e.g., meaningful pixels are 2x2 or 4x4 actual screen pixels).
**Format:** PNG with transparency.

### A. Karts (The Player)

- **Theme:** Wooden Soapbox Derby or Rustic Fantasy Kart.
- **Sprite Size:** `48x48` pixels (Source).
- **Hitbox:** Roughly `32x32` centered.
- **Views:** 8 Directions (45-degree increments).
    1. **Facing Right:** Profile view. Wheels visible.
    2. **Facing Down-Right:** 3/4 view front.
    3. **Facing Down:** Front view. Steering wheel visible.
    4. **Facing Down-Left:** 3/4 view front.
    5. **Facing Left:** Profile view (mirrored Right).
    6. **Facing Up-Left:** 3/4 view back. Exhaust/back visible.
    7. **Facing Up:** Back view.
    8. **Facing Up-Right:** 3/4 view back.
- **Details:**
  - **Wheels:** Wooden spoke wheels or chunky rubber tires.
  - **Body:** Wooden planks, metal bands, or simple painted metal.
  - **Driver:** A generic "racer" with a helmet (makes it easy to reuse). Helmet color matches player color.

### B. Weapons / Projectiles

These need to be clear and distinct from the background.

1. **Rocket (Magic Missile)**
    - **Size:** `32x16` pixels (Horizontal), rotates in code.
    - **Visual:** A bottle rocket or a magical arrow.
    - **Effect:** Trail of sparkles or grey smoke puffs.
2. **Timed Bomb (Black Bomb)**
    - **Size:** `32x32` pixels.
    - **Visual:** Classic round black bomb with a fuse.
    - **Animation:** Fuse sparking (2-frame toggle). Flashes red before exploding.
3. **Invincibility (Star / Aura)**
    - **Size:** `48x48` pixels (Overlay on kart).
    - **Visual:** A golden star pulsing or a rotating shield of leaves/magic.
    - **Animation:** Rotates or pulses opacity.
4. **Bullets (Magic Bolts)**
    - **Size:** `16x8` pixels each.
    - **Visual:** Glowing yellow/white capsule shape.
    - **Behavior:** Two spawn at once (parallel).

### C. Map Tiles (The World)

Designed for a Grid-based Tilemap.

- **Tile Size:** `32x32` pixels.
- **Texture Requirements:** Seamless tiling.

1. **Ground / Track**
    - **Grass:** Green with varied pixel noise (light/dark blades).
    - **Dirt Path:** Brown/Orange packed earth. Rough edges for transition to grass.
    - **Start Line:** Chequered flag pattern (white/black) on dirt.
2. **Walls / Obstacles**
    - **Stone Wall:** Grey cobblestone texture. Top-down perspective (top face visible).
    - **Wooden Fence:** Posts with rails.
    - **Bush/Hedge:** Dense green leaves.
3. **Borders (Void)**
    - **Visual:** A cliff edge (darker dirt) transitioning to a deep abyss (dark blue/black).
    - **Transition:** 32px wide transition tile (Grass -> Cliff).

### D. Interactables

1. **Weapon Crate**
    - **Size:** `32x32` pixels.
    - **Visual:** A wooden crate with a glowing "?" painted on it.
    - **Animation:** Bobbing up and down (1-2px) or glowing.

---

## 5. Visual Effects (VFX)

- **Dust:** Small grey clouds (`8x8` or `16x16`) spawning behind karts when driving.
- **Explosion:** `64x64` sprite sheet. 6-8 frames. Orange/Yellow fireball expanding and turning into grey smoke.
- **Collision:** White "star" or "spark" (`16x16`) at point of impact.
- **Muzzle Flash:** `16x16` yellow burst at front of kart when firing.

---

---

## 7. Master Sprite Sheet Atlas

**File:** `public/assets/sprite-sheet.png` (2048x2048 px)

**Coordinates (from User Prompt):**

1. **Karts (Row Y=0)**
   - **Size:** `48x48` px per frame.
   - **Red Kart:** `(0,0)` to `(384,0)` (8 frames: R, DR, D, DL, L, UL, U, UR)
   - **Blue Kart:** `(448,0)` to `(832,0)` (8 frames: R, DR, D, DL, L, UL, U, UR)

2. **Terrain & Obstacles (Row Y=120)**
   - **Size:** `32x32` px per tile.
   - `Grass`: `(0,120)`
   - `Dirt`: `(40,120)`
   - `Start Line`: `(80,120)`
   - `Stone Wall`: `(120,120)`
   - `Fence`: `(160,120)`
   - `Hedge`: `(200,120)`
   - `Cliff`: `(240,120)`
   - `Void`: `(280,120)`

3. **Interactables & Projectiles (Row Y=192)**
   - `Weapon Crate`: `(0,192)` and `(40,192)` (2 frames, 32x32)
   - `Rocket`: `(88,200)` (32x16)
   - `Bomb`: `(136,192)`, `(176,192)`, `(216,192)` (3 frames, 32x32)
   - `Bullet`: `(264,204)` (16x8)

4. **VFX (Row Y=264)**
   - `Invincibility`: `(0,264)` (4 frames, 48x48)
   - `Collision Spark`: `(232,280)` (3 frames, 16x16)
   - `Muzzle Flash`: `(312,280)` (2 frames, 16x16)
   - `Dust (8px)`: `(368,284)` (4 frames, 8x8)
   - `Dust (16px)`: `(440,280)` (4 frames, 16x16)

5. **Explosion (Row Y=344)**
   - `Explosion`: `(0,344)` (8 frames, 64x64, 72px apart)

6. **HUD (Row Y=424)**
   - `Heart Full`: `(0,424)` (16x16)
   - `Heart Empty`: `(24,424)` (16x16)
   - `Item Slot Wood`: `(56,416)` (32x32)
   - `Item Slot Stone`: `(96,416)` (32x32)
   - `Timer Board`: `(136,416)` (96x32)
   - `Minimap Dots`: `(240,428)` (Red), `(256,428)` (Blue), `(272,428)` (Gold), `(288,428)` (Neutral) (8x8)
