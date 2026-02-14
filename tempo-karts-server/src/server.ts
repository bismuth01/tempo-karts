import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import { z } from 'zod';
import { RoomManager } from './room/RoomManager.js';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData
} from './socket.js';

const port = Number(process.env.PORT ?? 4000);
const clientOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:8080,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isOriginAllowed = (origin?: string) => {
  if (!origin) {
    return true;
  }

  return clientOrigins.includes(origin);
};

const app = express();
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin ?? 'unknown'}`));
    },
    credentials: true
  })
);
app.use(express.json());

const roomManager = new RoomManager();
const positionLogEveryMs = 500;
const lastPositionLogAt = new Map<string, number>();

const logServer = (event: string, details: Record<string, unknown>) => {
  console.log(`[${new Date().toISOString()}] [${event}]`, details);
};

app.get('/', (_req, res) => {
  res.json({ service: 'tempo-karts-server', status: 'ok' });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, now: Date.now() });
});

app.get('/api/rooms', (_req, res) => {
  res.json({ rooms: roomManager.listRooms() });
});

app.get('/api/rooms/:code', (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  return res.json({ room });
});

const createRoomSchema = z.object({
  hostName: z.string().min(2).max(24).default('Host'),
  walletAddress: z.string().optional(),
  maxPlayers: z.number().min(2).max(8).optional().default(4)
});

app.post('/api/rooms', (req, res) => {
  const parsed = createRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { hostName, walletAddress, maxPlayers } = parsed.data;
  const { room, hostPlayer } = roomManager.createRoom(hostName, walletAddress, maxPlayers);
  logServer('room:create', {
    roomCode: room.code,
    hostPlayerId: hostPlayer.id,
    hostName,
    maxPlayers,
    walletAddress: walletAddress ?? null
  });

  return res.status(201).json({ room, hostPlayer });
});

const startRoomSchema = z.object({
  hostPlayerId: z.string().min(1)
});

app.post('/api/rooms/:code/start', (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const parsed = startRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (room.hostPlayerId !== parsed.data.hostPlayerId) {
    return res.status(403).json({ error: 'Only host can start the game' });
  }

  const updated = roomManager.startGame(room.code);
  io.to(room.code).emit('room:game_started', { room: updated });
  return res.json({ room: updated });
});

const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(server, {
  cors: {
    origin: clientOrigins,
    credentials: true
  }
});

const joinSchema = z.object({
  roomCode: z.string().min(6),
  role: z.enum(['player', 'spectator']).default('player'),
  playerName: z.string().min(2).max(24).optional(),
  walletAddress: z.string().optional(),
  playerId: z.string().optional()
});

const positionSchema = z.object({
  roomCode: z.string().min(6),
  playerId: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }),
  velocity: z.object({ x: z.number(), y: z.number() }).optional(),
  rotation: z.number().optional(),
  hp: z.number().int().min(0).max(100).optional(),
  ts: z.number().optional()
});

const attackSchema = z.object({
  roomCode: z.string().min(6),
  playerId: z.string().min(1),
  weaponType: z.enum(['rocket', 'bomb', 'bullet', 'unknown']).default('unknown'),
  position: z.object({ x: z.number(), y: z.number() }),
  direction: z.object({ x: z.number(), y: z.number() }),
  payload: z.record(z.unknown()).optional(),
  ts: z.number().optional()
});

const itemSchema = z.object({
  roomCode: z.string().min(6),
  playerId: z.string().min(1),
  kind: z.enum(['pickup', 'use']),
  itemType: z.string().min(1),
  slotId: z.string().optional(),
  targetId: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  ts: z.number().optional()
});

io.on('connection', (socket) => {
  socket.on('room:join', (raw, ack) => {
    const parsed = joinSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'Invalid join payload', details: parsed.error.flatten() });
      return;
    }

    const data = parsed.data;
    const roomCode = data.roomCode.toUpperCase();

    if (data.role === 'spectator') {
      const joined = roomManager.joinRoomAsSpectator(roomCode, socket.id);
      if ('error' in joined && joined.error) {
        ack?.({ ok: false, error: joined.error });
        return;
      }

      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      socket.data.role = 'spectator';
      logServer('room:join_spectator', {
        roomCode,
        socketId: socket.id,
        spectators: joined.room.spectators
      });

      ack?.({ ok: true, room: joined.room, role: 'spectator' });
      socket.emit('room:joined', { room: joined.room, role: 'spectator' });
      return;
    }

    if (data.playerId) {
      const ok = roomManager.attachHostSocket(roomCode, socket.id, data.playerId);
      if (ok) {
        const room = roomManager.getRoom(roomCode);
        if (!room) {
          ack?.({ ok: false, error: 'Room not found' });
          return;
        }

        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.role = 'player';
        socket.data.playerId = data.playerId;
        logServer('room:join_host', {
          roomCode,
          socketId: socket.id,
          playerId: data.playerId,
          players: room.players.length
        });

        ack?.({ ok: true, room, playerId: data.playerId, role: 'player' });
        socket.emit('room:joined', { room, playerId: data.playerId, role: 'player' });
        io.to(roomCode).emit('room:player_joined', { playerId: data.playerId, roomCode });
        return;
      }
    }

    const joined = roomManager.joinRoomAsPlayer(
      roomCode,
      socket.id,
      data.playerName ?? 'Player',
      data.walletAddress
    );

    if ('error' in joined && joined.error) {
      ack?.({ ok: false, error: joined.error });
      return;
    }

    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.role = 'player';
    socket.data.playerId = joined.player.id;
    logServer('room:join_player', {
      roomCode,
      socketId: socket.id,
      playerId: joined.player.id,
      playerName: joined.player.name,
      players: joined.room.players.length
    });

    ack?.({ ok: true, room: joined.room, player: joined.player, role: 'player' });
    socket.emit('room:joined', { room: joined.room, player: joined.player, role: 'player' });
    io.to(roomCode).emit('room:player_joined', {
      roomCode,
      player: joined.player
    });
  });

  socket.on('room:leave', (raw, ack) => {
    const payload = z
      .object({ roomCode: z.string(), playerId: z.string().optional() })
      .safeParse(raw);

    if (!payload.success) {
      ack?.({ ok: false, error: 'Invalid leave payload' });
      return;
    }

    const roomCode = payload.data.roomCode.toUpperCase();
    const leave = roomManager.leaveRoom(roomCode, payload.data.playerId ?? '', socket.id);

    socket.leave(roomCode);

    if (!leave.ok) {
      ack?.({ ok: false, error: 'Leave failed' });
      return;
    }

    if (leave.playerId) {
      io.to(roomCode).emit('room:player_left', { roomCode, playerId: leave.playerId });
    }
    logServer('room:leave', {
      roomCode,
      socketId: socket.id,
      playerId: leave.playerId ?? null
    });

    ack?.({ ok: true });
  });

  socket.on('player:position', (raw) => {
    const parsed = positionSchema.safeParse(raw);
    if (!parsed.success) {
      return;
    }

    const { roomCode, playerId, position, velocity, rotation, hp, ts } = parsed.data;
    const updated = roomManager.updatePosition(roomCode, playerId, {
      position,
      velocity,
      rotation,
      hp
    });

    if (!updated) {
      return;
    }

    socket.to(updated.roomCode).emit('room:position', {
      roomCode: updated.roomCode,
      playerId,
      position,
      velocity,
      rotation,
      hp,
      ts: ts ?? Date.now()
    });

    const now = Date.now();
    const logKey = `${updated.roomCode}:${playerId}`;
    const lastLogAt = lastPositionLogAt.get(logKey) ?? 0;
    if (now - lastLogAt >= positionLogEveryMs) {
      lastPositionLogAt.set(logKey, now);
      logServer('player:position', {
        roomCode: updated.roomCode,
        playerId,
        x: Math.round(position.x),
        y: Math.round(position.y),
        vx: Math.round((velocity?.x ?? 0) * 10) / 10,
        vy: Math.round((velocity?.y ?? 0) * 10) / 10
      });
    }
  });

  socket.on('player:attack', (raw) => {
    const parsed = attackSchema.safeParse(raw);
    if (!parsed.success) {
      return;
    }

    const { roomCode, playerId, weaponType, position, direction, payload, ts } = parsed.data;
    const used = roomManager.useWeapon(roomCode, playerId, weaponType, position, direction, payload);
    if ('error' in used) {
      logServer('weapon:use_rejected', {
        roomCode: roomCode.toUpperCase(),
        playerId,
        weaponType,
        reason: used.error
      });
      return;
    }

    io.to(used.itemEvent.roomCode).emit('room:item', {
      ...used.itemEvent,
      ts: ts ?? Date.now()
    });

    used.attackEvents.forEach((event) => {
      io.to(event.roomCode).emit('room:attack', {
        ...event,
        ts: event.createdAt
      });
    });

    logServer('weapon:use', {
      roomCode: used.itemEvent.roomCode,
      playerId,
      weaponType: used.weaponType,
      attackEvents: used.attackEvents.length
    });
  });

  socket.on('player:item', (raw) => {
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) {
      return;
    }

    const { roomCode, playerId, kind, itemType, slotId, targetId, payload, ts } = parsed.data;

    if (kind === 'pickup') {
      if (!slotId) {
        return;
      }

      const picked = roomManager.pickupCrate(roomCode, playerId, slotId, payload);
      if ('error' in picked) {
        return;
      }

      io.to(picked.event.roomCode).emit('room:item', {
        ...picked.event,
        ts: ts ?? Date.now()
      });

      logServer('item:pickup', {
        roomCode: picked.event.roomCode,
        playerId,
        slotId,
        weaponType: picked.event.itemType,
        weaponExpiresAt: picked.player.activeWeaponExpiresAt,
        crateRespawnAt: picked.slot.respawnAt
      });
      return;
    }

    const event = roomManager.createItemEvent(roomCode, playerId, kind, itemType, targetId, payload, slotId);

    if (!event) {
      return;
    }

    io.to(event.roomCode).emit('room:item', {
      ...event,
      ts: ts ?? Date.now()
    });
  });

  socket.on('disconnect', () => {
    const result = roomManager.removeSocket(socket.id);
    if (!result || !result.playerId) {
      logServer('socket:disconnect', { socketId: socket.id, reason: 'no-player' });
      return;
    }

    io.to(result.roomCode).emit('room:player_left', {
      roomCode: result.roomCode,
      playerId: result.playerId
    });
    logServer('socket:disconnect', {
      socketId: socket.id,
      roomCode: result.roomCode,
      playerId: result.playerId
    });
  });
});

setInterval(() => {
  const now = Date.now();
  const tickResult = roomManager.tick(now, true);

  tickResult.attackEvents.forEach((event) => {
    io.to(event.roomCode).emit('room:attack', {
      ...event,
      ts: event.createdAt
    });
  });

  const rooms = roomManager.listRooms();
  for (const room of rooms) {
    io.to(room.code).emit('room:state', {
      room,
      serverTime: now,
      tickRate: 20
    });
  }
}, 50);

server.listen(port, () => {
  console.log(`Tempo Karts server running on http://localhost:${port}`);
});
