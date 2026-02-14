# Tempo Karts Server (Socket.IO)

Basic backend scaffold for room-based multiplayer sync.

## What it has

- Express health + room endpoints
- Socket.IO realtime rooms by game code
- Player join/leave
- Position sync
- Attack and item events
- 20Hz state broadcast per active room

## Run

1. Install dependencies
2. Configure `.env` values for chain integration
3. Start dev server

The API listens on `PORT` (default `4000`).

## Chain Env Vars

- `TEMPO_RPC_URL`
- `CHAIN_ID` (default `42431`)
- `OWNER_PRIVATE_KEY`
- `GAME_FACTORY_ADDRESS`
- `STAKE_TOKEN_ADDRESS`
- `STAKE_AMOUNT_WEI`
- `DEFAULT_PLAYER_CAP` (default `4`)

Before calling `POST /api/rooms/:code/start`, build the contracts so runtime artifacts exist:

```bash
cd contracts
forge build
```

## HTTP Endpoints

- `GET /health`
- `GET /api/rooms`
- `POST /api/rooms`
- `GET /api/rooms/:code`

## Socket Events

Client -> Server:

- `room:join`
- `room:leave`
- `player:position`
- `player:attack`
- `player:item`

Server -> Client:

- `room:joined`
- `room:player_joined`
- `room:player_left`
- `room:position`
- `room:attack`
- `room:item`
- `room:state`
