# TEMPO KARTS 🏎️💥

> The first responsive on-chain multiplayer battle racer — powered by Tempo's 2D nonces.

## The Core Innovation

Every on-chain game in history has felt broken because **actions queue sequentially** (1D nonces).
Tempo's **2D nonces** let us create **parallel action lanes** — movement, combat, and items execute simultaneously.

**This is the first on-chain game that actually feels like a game.**

---

## System Architecture

```mermaid
graph TB
    subgraph Client["🎮 Browser Client (Next.js + Phaser 3)"]
        Phaser["Phaser 3 Game Engine<br/>WebGL Rendering<br/>Arcade Physics<br/>60fps Game Loop"]
        Privy["Privy Auth<br/>Email/Phone → Wallet"]
        TXRouter["TX Lane Router<br/>2D Nonce Manager"]
        WSClient["Socket.io Client<br/>Real-time Sync"]
    end

    subgraph Server["⚙️ Game Server (Node.js + Socket.io)"]
        Matchmaker["Matchmaker<br/>Lobby + Pairing"]
        AuthState["Authoritative State<br/>Positions, HP, Items"]
        PhysicsVal["Physics Validator<br/>Anti-cheat Checks"]
        Settler["Settlement Engine<br/>Kill Rewards + Payouts"]
    end

    subgraph Tempo["⛓️ Tempo Chain (ID: 42431)"]
        L0["Lane 0 (key: 0n)<br/>🏎️ Drive Actions"]
        L1["Lane 1 (key: 1n)<br/>🔫 Combat Actions"]
        L2["Lane 2 (key: 2n)<br/>📦 Item Actions"]
        L3["Lane 3 (key: 3n)<br/>💰 Economy Actions"]
        Escrow["Escrow Contract<br/>(Solidity EVM)"]
        Alpha["AlphaUSD<br/>0x20c0...0001"]
        FeeSponsor["Fee Sponsor<br/>sponsor.moderato.tempo.xyz"]
    end

    Phaser <-->|"60fps state sync"| WSClient
    WSClient <-->|"WebSocket"| AuthState
    Privy -->|"wallet"| TXRouter
    TXRouter -->|"nonceKey: 0n"| L0
    TXRouter -->|"nonceKey: 1n"| L1
    TXRouter -->|"nonceKey: 2n"| L2
    TXRouter -->|"nonceKey: 3n"| L3
    AuthState --> PhysicsVal
    Settler --> Escrow
    Settler --> Alpha
    FeeSponsor -.->|"pays all fees"| Tempo
```

---

## 2D Nonce Action Lanes

The core mechanic that makes this game possible. Each action type uses an independent nonce sequence.

```mermaid
sequenceDiagram
    participant P as 🎮 Player
    participant R as TX Router
    participant L0 as Lane 0 🏎️
    participant L1 as Lane 1 🔫
    participant L2 as Lane 2 📦
    participant C as ⛓️ Tempo

    Note over P,C: Player presses 4 buttons at once

    P->>R: W key (accelerate)
    P->>R: Left click (fire missile)
    P->>R: E key (use shield)
    P->>R: Tab (bet $0.50)

    par Parallel — all fire at once
        R->>L0: transfer(memo: "move:up") nonceKey=0
        R->>L1: transfer(memo: "fire:missile") nonceKey=1
        R->>L2: transfer(memo: "use:shield") nonceKey=2
        R->>L0: transfer(memo: "bet:0.50") nonceKey=3
    end

    Note over L0,C: All 4 hit chain simultaneously

    par All confirm in ~0.5s
        L0-->>C: ✅ Block N
        L1-->>C: ✅ Block N
        L2-->>C: ✅ Block N
    end

    Note over P,C: Total: 0.5s ⚡ (vs 2.0s sequential on 1D chains)
```

### 1D vs 2D — The Demo Comparison

```mermaid
gantt
    title ❌ 1D Nonces (Ethereum, Solana, etc.)
    dateFormat X
    axisFormat %Ls

    section Player
    Move (nonce 0)           :a1, 0, 500
    BLOCKED ⏳               :crit, a2, 500, 500
    Fire (nonce 1)           :a3, 1000, 500
    BLOCKED ⏳               :crit, a4, 1500, 500
    Use Item (nonce 2)       :a5, 2000, 500
```

```mermaid
gantt
    title ✅ 2D Nonces (Tempo) — Parallel Action Lanes
    dateFormat X
    axisFormat %Ls

    section Lane 0 🏎️
    Move         :a1, 0, 500

    section Lane 1 🔫
    Fire         :b1, 0, 500

    section Lane 2 📦
    Use Item     :c1, 0, 500

    section ⚡
    ALL DONE     :milestone, m1, 500, 0
```

> **1D: 2.5 seconds.  2D: 0.5 seconds.  5× faster.  The game goes from unplayable to buttery.**

---

## Match Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Lobby: Join via email (Privy)

    Lobby --> Matchmaking: Click "Find Match"

    Matchmaking --> Staking: 2-4 players matched
    note right of Staking
        Each player stakes $1 AlphaUSD
        Fee sponsored — gasless
        Atomic batch transaction
    end note

    Staking --> Countdown: All stakes on-chain ✅

    Countdown --> Battle: 3... 2... 1... GO!
    note right of Battle
        2-minute match
        60fps WebSocket sync
        Key actions → 2D nonce lanes
    end note

    Battle --> Kill: Player eliminated
    note right of Kill
        $0.25 → killer instantly
        Memo: "kill:P2:missile:x42:y18"
    end note

    Kill --> Battle: Lives remaining
    Kill --> Spectate: No lives left

    Battle --> Settlement: ⏰ Timer expires
    note right of Settlement
        Batch settlement (atomic)
        Winner: $3.00
        Kill bonuses distributed
    end note

    Settlement --> Results: Show leaderboard + tx hashes
    Results --> [*]
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Game Engine** | [Phaser 3](https://phaser.io) (MIT) | Best free 2D engine. WebGL rendering, Arcade Physics, sprites, particles, input handling, tilemaps |
| **Frontend** | Next.js 14 | SSR landing page, API routes, React components for lobby/HUD |
| **Auth** | Privy | Email/phone → wallet. Zero crypto knowledge required |
| **Blockchain** | viem + tempoActions | 2D nonce management, transfers, memos |
| **Multiplayer** | Socket.io | Authoritative server, 60fps state broadcast |
| **Server** | Node.js + Express | Game rooms, physics validation, settlement |
| **Styling** | CSS (dark mode, glassmorphism) | Premium gaming aesthetic |
| **Chain** | Tempo Testnet (42431) | 0.5s blocks, 2D nonces, fee sponsorship, memos |

### Why Phaser 3

- **MIT Licensed** — 100% free, even commercial
- **WebGL + Canvas fallback** — runs everywhere
- **Arcade Physics** — perfect for top-down kart collisions
- **Particle System** — explosions, trails, power-up effects
- **Sprite Sheets** — animated karts, weapons, items
- **Tilemap Support** — arena layouts
- **Input Manager** — keyboard, mouse, touch, gamepad
- **Camera System** — follow player, screen shake on hits
- **10+ years mature** — stable, documented, huge community

---

## On-Chain Data Model

### Memo Encoding (32 bytes per action)

```
Byte 0:     Event type (0x01=join, 0x02=fire, 0x03=kill, 0x04=pickup, 0x05=use, 0x06=bet)
Bytes 1-2:  Match ID (uint16 — up to 65535 matches)
Bytes 3-4:  Source player ID (uint16)
Bytes 5-6:  Target player/item ID (uint16)
Byte 7:     Weapon/Item type (0x01=missile, 0x02=bomb, 0x03=laser, 0x04=shield, 0x05=boost)
Bytes 8-9:  Position X (uint16, scaled)
Bytes 10-11: Position Y (uint16, scaled)
Bytes 12-13: Damage / Amount (uint16)
Bytes 14-31: Reserved (zero-padded)
```

### Stablecoin Flows

```mermaid
graph LR
    subgraph Entry
        P1["Player 1"] -->|"$1.00"| E["Escrow"]
        P2["Player 2"] -->|"$1.00"| E
        P3["Player 3"] -->|"$1.00"| E
        P4["Player 4"] -->|"$1.00"| E
    end

    subgraph During["Mid-Game (real-time)"]
        E -->|"$0.25 per kill"| Killer["Kill Reward"]
    end

    subgraph Settlement["Match End (atomic batch)"]
        E -->|"$2.00"| W["🥇 Winner"]
        E -->|"$0.75"| R1["🥈 Runner-up"]
        E -->|"$0.25"| R2["🥉 Third"]
    end
```

---

## Game Design

### Arena

- **Size:** 800×600 px viewport, 1600×1200 world
- **Style:** Top-down 2D, retro pixel-art aesthetic
- **Map:** Enclosed arena with obstacles (walls, crates, ramps)
- **Camera:** Follows player kart, smooth lerp

### Kart

- **Speed:** 200 px/s base, 350 px/s boost
- **HP:** 100
- **Controls:** WASD/Arrows = drive, Mouse = aim, Click = fire, E = use item
- **Physics:** Arcade (no rotation drag — keep it simple and responsive)

### Weapons & Items

| Item | Effect | Rarity | On-Chain? |
|------|--------|--------|-----------|
| 🚀 Missile | 25 damage, straight line | Common | Fire event (Lane 1) |
| 💣 Bomb | 40 damage, AoE | Rare | Fire event (Lane 1) |
| ⚡ Laser | 15 damage, instant | Common | Fire event (Lane 1) |
| 🛡️ Shield | Block next hit | Rare | Use event (Lane 2) |
| 🔥 Boost | 2s speed boost | Common | Use event (Lane 2) |
| ❤️ Heal | Restore 25 HP | Rare | Use event (Lane 2) |

### Pickup Spawning

- Weapon crates spawn every 5s at random positions
- Max 6 crates on map at once
- Pickup = on-chain memo recording who got what
- Visual: spinning crate with glow effect

---

## Folder Structure

```
tempo-hackathon/
├── ARCHITECTURE.md              # This file
├── package.json
│
├── frontend/                    # Next.js 14 app
│   ├── app/
│   │   ├── layout.tsx           # Root layout + Privy provider
│   │   ├── page.tsx             # Landing page (join/lobby)
│   │   ├── game/
│   │   │   └── page.tsx         # Game page (mounts Phaser)
│   │   └── api/
│   │       ├── match/route.ts   # Create/join match
│   │       └── settle/route.ts  # Settlement endpoint
│   │
│   ├── components/
│   │   ├── Lobby.tsx            # Matchmaking UI
│   │   ├── HUD.tsx              # Health, items, score overlay
│   │   ├── Leaderboard.tsx      # Post-match results
│   │   ├── NonceLaneViz.tsx     # Live 2D nonce lane visualizer
│   │   └── WalletConnect.tsx    # Privy login button
│   │
│   ├── game/                    # Phaser 3 game code
│   │   ├── config.ts            # Phaser game config
│   │   ├── scenes/
│   │   │   ├── BootScene.ts     # Asset loading
│   │   │   ├── ArenaScene.ts    # Main game scene
│   │   │   └── UIScene.ts       # HUD overlay scene
│   │   ├── entities/
│   │   │   ├── Kart.ts          # Player kart sprite
│   │   │   ├── Weapon.ts        # Projectile base class
│   │   │   ├── Missile.ts       # Missile projectile
│   │   │   ├── Bomb.ts          # Bomb projectile
│   │   │   └── ItemCrate.ts     # Pickup crate
│   │   ├── systems/
│   │   │   ├── InputSystem.ts   # Keyboard/mouse handling
│   │   │   ├── WeaponSystem.ts  # Fire, damage, cooldowns
│   │   │   └── ItemSystem.ts    # Pickup, inventory, use
│   │   └── assets/              # Sprites, sounds, tilemaps
│   │       ├── kart-red.png
│   │       ├── kart-blue.png
│   │       ├── missile.png
│   │       ├── explosion.png
│   │       ├── arena-tilemap.json
│   │       └── arena-tileset.png
│   │
│   ├── lib/
│   │   ├── tempo.ts             # Tempo client setup
│   │   ├── lanes.ts             # 2D nonce lane manager
│   │   ├── memo.ts              # Memo encoder/decoder
│   │   ├── constants.ts         # Addresses, chain config
│   │   └── socket.ts            # Socket.io client wrapper
│   │
│   └── styles/
│       └── globals.css          # Dark mode, gaming aesthetic
│
├── server/                      # Game server
│   ├── index.ts                 # Express + Socket.io entry
│   ├── rooms/
│   │   ├── GameRoom.ts          # Match state machine
│   │   └── Lobby.ts             # Waiting room logic
│   ├── game/
│   │   ├── GameState.ts         # Authoritative game state
│   │   ├── PhysicsValidator.ts  # Server-side validation
│   │   └── Ticker.ts            # Server tick loop (20Hz)
│   └── chain/
│       ├── settlement.ts        # Batch payout logic
│       ├── escrow.ts            # Stake management
│       └── events.ts            # On-chain event watcher
│
└── contracts/                   # Solidity (optional)
    ├── Escrow.sol               # Match stake escrow
    └── deploy.ts                # Foundry/Hardhat deploy script
```

---

## Network Protocol (Client ↔ Server)

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant T as Tempo

    Note over C,S: Join Phase
    C->>S: join_lobby(email, wallet)
    S->>C: lobby_state(players, countdown)
    
    Note over C,T: Staking Phase
    C->>T: stake $1 AlphaUSD → Escrow
    C->>S: stake_confirmed(txHash)
    S->>C: all_staked → countdown_start

    Note over C,S: Game Phase (2 min)
    loop Every 50ms (20Hz server tick)
        C->>S: input(keys, mouseAngle, actions)
        S->>S: validate + simulate physics
        S->>C: game_state(all positions, HP, items)
    end

    Note over C,T: On-Chain Actions (parallel lanes)
    par Lane 0
        C->>T: drive_action(memo)
    and Lane 1
        C->>T: combat_action(memo)
    and Lane 2
        C->>T: item_action(memo)
    end

    Note over S,T: Kill Event
    S->>T: kill($0.25 → killer, memo: kill details)
    S->>C: kill_event(killer, victim, weapon)

    Note over S,T: Settlement
    S->>T: batch_settle(winner payouts)
    S->>C: match_results(standings, txHashes)
```

---

## Deployment & Demo Plan

| Step | How |
|------|-----|
| **Frontend** | Vercel (auto-deploy from Git) |
| **Game Server** | Railway.app or Render (free tier WebSocket support) |
| **Chain** | Tempo Testnet (public RPC) |
| **Wallets** | Hackathon test wallets (pre-funded 1M AlphaUSD each) |

### Demo Script (5 min)

1. **"Every on-chain game feels broken."** Show 1D nonce mode — laggy, queued.
2. **"One primitive changes everything."** Switch to 2D nonce lanes — smooth.
3. **"Let's play."** 4 judges join via email. $1 stake each.
4. **2-minute battle.** Missiles flying, kills scoring, items popping.
5. Match ends. Winner gets $3. Show Tempo Explorer — all txs verified.
6. **"47 on-chain transactions. 4 parallel lanes. 0.5s blocks. $0.04 total fees."**
7. **"This game can't exist on any other chain."**
