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
2. Start dev server

The API listens on `PORT` (default `4000`).

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
