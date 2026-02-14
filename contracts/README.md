# Temp Karts — On-Chain Game Contracts

A set of Solidity smart contracts for managing a multiplayer kart game with player staking and on-chain prediction markets. All internal game handling is done by the backend (contract owner). All token exchanges use **TIP20 tokens only** — no native token exchanges.

---

## Contract Overview

### `common.sol`

Shared enums used across all contracts:

| Enum | Values | Usage |
|------|--------|-------|
| `MarketType` | `Attacker`, `Attacked` | Live prediction market categories |
| `StaticMarketType` | `Winner`, `MostDeaths` | Static prediction market categories |
| `GameState` | `NotStarted`, `Running`, `Ended` | Game lifecycle state enforced across all contracts |
| `Item` | `Bullets`, `Boost`, … | Extensible enum of in-game damage-dealing items |

### `GameFactory.sol`

Factory contract that mints new `GameManager` instances. Deployed once by the backend.

- Generates a unique 6-character hex game ID per game.
- Stores a mapping of `gameId → GameManager address`.
- Only the owner (backend) can create games.

### `GameManager.sol`

Central coordinator for a single game. Created by `GameFactory`.

- **Registration phase** (`NotStarted`): Players register by staking TIP20 tokens. Players can deregister to reclaim their stake before the game starts.
- **Start game** (`Running`): Backend calls `startGame()` which transitions the game state. Then the backend separately deploys all 5 sub-contracts, links them via `setContracts()`, which also wires the KillRecorder to the LivePredictionMarket.
- **End game** (`Ended`): Backend calls `endGame(winner, mostDeaths)` which stops all recorders, refunds unresolved live bets, resolves static prediction markets, and distributes the total stake to the winner.

### `ItemRecorder.sol`

Records item usage events during the game.

- Each event stores: `player`, `itemUsed` (from `Item` enum), `direction`, `usedTime`.
- Only the backend (owner) can record events.
- Enforces `GameState.Running` — no events after game ends.

### `KillRecorder.sol`

Records damage and kill events during the game.

- Each event stores: `attackingPlayer`, `attackedPlayer`, `itemUsed`, `healthDepleted`, `killed` flag.
- Tracks per-player `killCount` and `deathCount`.
- **On a kill (`killed = true`)**: Automatically calls `LivePredictionMarket.resolveKill()` to resolve both live markets and advance the betting round.
- Only the backend (owner) can record events.

### `PositionRecorder.sol`

Records player positions every tick (~1 second) during the game.

- Stores position snapshots per tick: `xPos`, `yPos`, `angle`, `playerAddress`.
- `matchDuration` auto-increments on each tick.
- Backend calls `addRecord()` with all player positions each second.

### `LivePredictionMarket.sol`

Round-based live prediction markets resolved in realtime.

**Two markets per round:**
| Market | Question | Resolved with |
|--------|----------|---------------|
| `Attacker` | Who will **kill** next? | The player who made the kill |
| `Attacked` | Who will **be killed** next? | The player who was killed |

**Mechanics:**
- Anyone can bet TIP20 tokens on a registered player during `GameState.Running`.
- Each kill event triggers `resolveKill()` → both markets resolve → round advances.
- Winners split the entire pot proportionally based on their bet size.
- If nobody bet on the correct player, all bettors are refunded.
- When the game ends, any unresolved bets in the current round are refunded.

### `StaticPredictionMarket.sol`

Prediction markets resolved once after the game ends.

**Two markets:**
| Market | Question | Resolved with |
|--------|----------|---------------|
| `Winner` | Who will **win** the game? | The game winner (passed by backend) |
| `MostDeaths` | Who will have the **most deaths**? | The player with most deaths (passed by backend) |

**Mechanics:**
- Anyone can bet TIP20 tokens during `GameState.Running`.
- After the game ends, `GameManager` calls `resolveMarket()` for each market type.
- Pot distribution logic is identical to LivePredictionMarket.
- If nobody bet on the correct player, all bettors are refunded.

---

## Deployment Sequence

### 1. Deploy `GameFactory`

```
GameFactory is deployed by the backend account.
The deployer becomes the owner.
```

### 2. Create a Game

```
Backend calls: GameFactory.createGame(playerCap, stakeTokenAddress, stakeAmount)
→ Deploys a new GameManager
→ Returns the GameManager address
→ Emits GameCreated(gameId, gameManagerAddress)
```

### 3. Player Registration

```
Players call: GameManager.registerPlayer()
→ Transfers stakeAmount of TIP20 tokens from player to GameManager
→ Player is now registered
```

### 4. Start the Game

```
Backend calls: GameManager.startGame()
→ State transitions to Running
→ Emits GameStarted
```

### 5. Deploy Sub-Contracts and Link

```
Backend deploys independently:
  - ItemRecorder(owner, gameManagerAddress)
  - KillRecorder(owner, gameManagerAddress)
  - PositionRecorder(owner, gameManagerAddress)
  - LivePredictionMarket(stakeTokenAddress, killRecorderAddress, gameManagerAddress, players)
  - StaticPredictionMarket(stakeTokenAddress, gameManagerAddress, players)

Backend calls: GameManager.setContracts(
    itemRecorderAddr, killRecorderAddr, positionRecorderAddr,
    livePredictionMarketAddr, staticPredictionMarketAddr
)
→ Stores all contract references
→ Internally links KillRecorder → LivePredictionMarket
→ Emits ContractsInitialized
```

### 6. End the Game

```
Backend calls: GameManager.endGame(winnerAddress, mostDeathsAddress)
→ Ends all recorders (no more data recording)
→ Refunds unresolved live prediction bets
→ Resolves both static prediction markets
→ Transfers totalStake to the winner
→ Emits GameEnded
```

---

## User Interaction Guide

### As a Player

1. **Approve TIP20 tokens**: Before registering, approve the `GameManager` contract to spend `stakeAmount` of your TIP20 tokens.
2. **Register**: Call `GameManager.registerPlayer()`. Your tokens are transferred as stake.
3. **Deregister (optional)**: Before the game starts, call `GameManager.deregisterPlayer()` to reclaim your stake.
4. **Play**: Once the backend starts the game, play through the game client. All in-game actions are recorded by the backend.
5. **Win**: If you win, the total stake pool is transferred to you when the game ends.

### As a Bettor (Prediction Markets)

1. **Approve TIP20 tokens**: Approve the prediction market contract to spend tokens.
2. **Live Bets**: Call `LivePredictionMarket.putBet(marketType, playerChoice, amount)` during the game.
   - Bet on `MarketType.Attacker` to predict who will get the next kill.
   - Bet on `MarketType.Attacked` to predict who will die next.
   - Bets are per-round. Each kill resolves the round and starts a new one.
3. **Static Bets**: Call `StaticPredictionMarket.putBet(marketType, playerChoice, amount)` during the game.
   - Bet on `StaticMarketType.Winner` to predict the game winner.
   - Bet on `StaticMarketType.MostDeaths` to predict who will die the most.
4. **Collect Winnings**: Winnings are automatically distributed when markets resolve. No claim step needed.
5. **Refunds**: If nobody bet correctly, you receive a full refund automatically.

---

## Backend Interaction Guide

The backend is the `owner` of all contracts and is responsible for game lifecycle and data recording.

### Game Lifecycle

| Step | Contract | Function | Access |
|------|----------|----------|--------|
| Create game | `GameFactory` | `createGame(playerCap, stakeToken, stakeAmount)` | Owner |
| Start game | `GameManager` | `startGame()` | Owner |
| Deploy sub-contracts | Backend deploys each contract individually | — | Owner |
| Link contracts | `GameManager` | `setContracts(...)` | Owner |
| End game | `GameManager` | `endGame(winner, mostDeaths)` | Owner |

### During the Game (Recording)

| Data | Contract | Function | Frequency |
|------|----------|----------|-----------|
| Item usage | `ItemRecorder` | `addEvent(ItemEvent)` | On each item use |
| Damage/Kill | `KillRecorder` | `addEvent(KillEvent)` | On each hit/kill |
| Positions | `PositionRecorder` | `addRecord(PositionEvent[])` | Every 1 second |

### Kill Event Flow (Automatic)

```
Backend → KillRecorder.addEvent({..., killed: true})
    → killCount[attacker]++
    → deathCount[victim]++
    → LivePredictionMarket.resolveKill(attacker, victim)
        → Resolves Attacker market (attacker wins)
        → Resolves Attacked market (victim wins)
        → Advances to next round
```

### End Game Flow (Automatic)

```
Backend → GameManager.endGame(winner, mostDeaths)
    → ItemRecorder.endGame()          // Stop recording items
    → KillRecorder.endGame()          // Stop recording kills
    → PositionRecorder.endGame()      // Stop recording positions
    → LivePredictionMarket.endGame()  // Refund unresolved live bets
    → StaticPredictionMarket.endGame()          // Stop accepting static bets
    → StaticPredictionMarket.resolveMarket(Winner, winner)      // Resolve winner market
    → StaticPredictionMarket.resolveMarket(MostDeaths, mostDeaths)  // Resolve deaths market
    → stakeToken.transfer(winner, totalStake)   // Pay winner
```

### Access Control Summary

| Contract | `owner` (backend) | `gameManager` (GameManager contract) |
|----------|-------------------|--------------------------------------|
| `GameFactory` | `createGame()` | — |
| `GameManager` | `startGame()`, `setContracts()`, `endGame()` | — |
| `ItemRecorder` | `addEvent()` | `endGame()` |
| `KillRecorder` | `addEvent()` | `setLivePredictionMarket()`, `endGame()` |
| `PositionRecorder` | `addRecord()` | `endGame()` |
| `LivePredictionMarket` | — | `endGame()` |
| `StaticPredictionMarket` | — | `endGame()`, `resolveMarket()` |

> `KillRecorder` additionally has permission to call `LivePredictionMarket.resolveKill()`.

---

## Build & Test

```shell
cd contracts
forge build
forge test
```

## Deployment (Tempo Testnet)

```shell
export TEMPO_RPC_URL=https://rpc.moderato.tempo.xyz
export PRIVATE_KEY=<your_private_key>

# Fund wallet
cast wallet new
cast rpc tempo_fundAddress <YOUR_WALLET_ADDRESS> --rpc-url $TEMPO_RPC_URL

# Deploy GameFactory
forge create src/GameFactory.sol:GameFactory \
  --rpc-url $TEMPO_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast --verify
```
