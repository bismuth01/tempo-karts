import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import { z } from 'zod';
import { RoomManager } from './room/RoomManager.js';
import { ChainService, type GameChainState } from './chain/ChainService.js';
import { RecorderService } from './chain/RecorderService.js';
import { BACKEND_PRIVATE_KEY, STAKE_TOKEN_ADDRESS, DEFAULT_STAKE_AMOUNT, DEFAULT_PLAYER_CAP } from './chain/config.js';
import type { KillEvent } from './types.js';
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

// Chain services — optional: only active when BACKEND_PRIVATE_KEY is set
let chainService: ChainService | null = null;
const recorderServices = new Map<string, RecorderService>(); // roomCode → RecorderService

try {
    if (BACKEND_PRIVATE_KEY) {
        chainService = new ChainService();
        console.log('[Server] ChainService initialized');
    } else {
        console.log('[Server] No BACKEND_PRIVATE_KEY — running without chain features');
    }
} catch (err) {
    console.warn('[Server] ChainService init failed:', err);
}

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

app.post('/api/rooms', async (req, res) => {
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

  // Create on-chain game via GameFactory (synchronous – room response must include chain data
  // so the frontend can trigger TIP20 approval + registerPlayer)
  if (chainService) {
    try {
      const { gameManagerAddress } = await chainService.createGame(
        maxPlayers,
        STAKE_TOKEN_ADDRESS as `0x${string}`,
        BigInt(DEFAULT_STAKE_AMOUNT),
      );
      roomManager.setChainData(room.code, {
        gameManagerAddress,
        stakeTokenAddress: STAKE_TOKEN_ADDRESS,
        stakeAmount: DEFAULT_STAKE_AMOUNT,
      });
      logServer('chain:game_created', { roomCode: room.code, gameManagerAddress });
    } catch (err) {
      logServer('chain:game_create_failed', { roomCode: room.code, error: String(err) });
    }
  }

  // Re-fetch room so response includes chain data
  const updatedRoom = roomManager.getRoom(room.code) ?? room;
  return res.status(201).json({ room: updatedRoom, hostPlayer });
});

const startRoomSchema = z.object({
  hostPlayerId: z.string().min(1)
});

app.post('/api/rooms/:code/start', async (req, res) => {
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

  // Start on-chain game + deploy sub-contracts (non-blocking)
  const chainData = roomManager.getChainData(room.code);
  if (chainService && chainData?.gameManagerAddress) {
    (async () => {
      try {
        const players = await chainService!.getRegisteredPlayers(
          chainData.gameManagerAddress as `0x${string}`,
        );

        const chainState = await chainService!.startAndInitialize(
          chainData.gameManagerAddress as `0x${string}`,
          chainData.stakeTokenAddress as `0x${string}`,
          players,
        );

        roomManager.setChainData(room.code, {
          ...chainData,
          itemRecorderAddress: chainState.itemRecorderAddress,
          killRecorderAddress: chainState.killRecorderAddress,
          positionRecorderAddress: chainState.positionRecorderAddress,
          livePredictionMarketAddress: chainState.livePredictionMarketAddress,
          staticPredictionMarketAddress: chainState.staticPredictionMarketAddress,
          players: players as string[],
        });

        // Start recording
        const recorder = new RecorderService();
        recorder.start(
          {
            itemRecorderAddress: chainState.itemRecorderAddress!,
            killRecorderAddress: chainState.killRecorderAddress!,
            positionRecorderAddress: chainState.positionRecorderAddress!,
          },
          () => roomManager.getPlayersSnapshot(room.code),
        );
        recorderServices.set(room.code, recorder);

        logServer('chain:game_started', {
          roomCode: room.code,
          ...chainState,
        });
      } catch (err) {
        logServer('chain:game_start_failed', {
          roomCode: room.code,
          error: String(err),
        });
      }
    })();
  }

  io.to(room.code).emit('room:game_started', { room: updated });
  return res.json({ room: updated });
});

// End a game — determines winner (most kills) and most deaths, resolves on-chain
const endRoomSchema = z.object({
  hostPlayerId: z.string().min(1),
});

app.post('/api/rooms/:code/end', async (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const parsed = endRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (room.hostPlayerId !== parsed.data.hostPlayerId) {
    return res.status(403).json({ error: 'Only host can end the game' });
  }

  // Determine winner (most kills) and most deaths
  const players = room.players;
  const sortedByKills = [...players].sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0));
  const sortedByDeaths = [...players].sort((a, b) => (b.deaths ?? 0) - (a.deaths ?? 0));
  const winner = sortedByKills[0];
  const mostDeathsPlayer = sortedByDeaths[0];

  // Stop recorder
  const recorder = recorderServices.get(room.code);
  if (recorder) {
    recorder.stop();
    recorderServices.delete(room.code);
  }

  const updated = roomManager.endGame(room.code);

  // End on-chain
  const chainData = roomManager.getChainData(room.code);
  if (chainService && chainData?.gameManagerAddress) {
    chainService
      .endGame(
        chainData.gameManagerAddress as `0x${string}`,
        (winner?.walletAddress ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
        (mostDeathsPlayer?.walletAddress ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
      )
      .then(() => logServer('chain:game_ended', { roomCode: room.code }))
      .catch((err) => logServer('chain:game_end_failed', { roomCode: room.code, error: String(err) }));
  }

  // Broadcast game ended
  io.to(room.code).emit('room:game_ended', {
    roomCode: room.code,
    winner: winner?.id,
    winnerName: winner?.name,
    mostDeaths: mostDeathsPlayer?.id,
  });

  return res.json({ room: updated, winner: winner?.id, mostDeaths: mostDeathsPlayer?.id });
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
    const event = roomManager.createAttackEvent(roomCode, playerId, weaponType, position, direction, payload);

    if (!event) {
      return;
    }

    io.to(event.roomCode).emit('room:attack', {
      ...event,
      ts: ts ?? Date.now()
    });
  });

  socket.on('player:item', (raw) => {
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) {
      return;
    }

    const { roomCode, playerId, kind, itemType, targetId, payload, ts } = parsed.data;
    const event = roomManager.createItemEvent(roomCode, playerId, kind, itemType, targetId, payload);

    if (!event) {
      return;
    }

    io.to(event.roomCode).emit('room:item', {
      ...event,
      ts: ts ?? Date.now()
    });

    // Record item usage on-chain
    if (kind === 'use') {
      const recorder = recorderServices.get(roomCode.toUpperCase());
      if (recorder) {
        const player = roomManager.getPlayersSnapshot(roomCode).find((p) => p.id === playerId);
        const dir = Math.round(Math.atan2(payload?.dirY as number ?? 0, payload?.dirX as number ?? 1) * (180 / Math.PI));
        recorder.recordItem(
          player?.walletAddress as `0x${string}` | undefined,
          itemType,
          dir,
        ).catch((err) => logServer('chain:item_record_failed', { error: String(err) }));
      }
    }
  });

  // Handle damage / kill events — these come from the game client when a hit is confirmed
  const damageSchema = z.object({
    roomCode: z.string().min(6),
    attackerId: z.string().min(1),
    victimId: z.string().min(1),
    weaponType: z.string().default('unknown'),
    healthDepleted: z.number().int().min(0).max(100),
    killed: z.boolean(),
  });

  socket.on('player:damage', (raw) => {
    const parsed = damageSchema.safeParse(raw);
    if (!parsed.success) return;

    const { roomCode, attackerId, victimId, weaponType, healthDepleted, killed } = parsed.data;
    const roomCodeUp = roomCode.toUpperCase();
    const players = roomManager.getPlayersSnapshot(roomCodeUp);
    const attacker = players.find((p) => p.id === attackerId);
    const victim = players.find((p) => p.id === victimId);

    if (!attacker || !victim) return;

    // Update kill/death counters in RoomManager
    if (killed) {
      attacker.kills = (attacker.kills ?? 0) + 1;
      victim.deaths = (victim.deaths ?? 0) + 1;
    }

    // Broadcast kill event to room (for spectator kill feed and prediction panel)
    const killEvent: KillEvent = {
      roomCode: roomCodeUp,
      attackerId,
      attackerName: attacker.name,
      attackerWallet: attacker.walletAddress,
      victimId,
      victimName: victim.name,
      victimWallet: victim.walletAddress,
      weaponType,
      healthDepleted,
      killed,
      timestamp: Date.now(),
    };

    io.to(roomCodeUp).emit('room:kill', killEvent);

    // Record on-chain
    const recorder = recorderServices.get(roomCodeUp);
    if (recorder) {
      recorder.recordKill(
        attacker.walletAddress as `0x${string}` | undefined,
        victim.walletAddress as `0x${string}` | undefined,
        weaponType,
        healthDepleted,
        killed,
      ).catch((err) => logServer('chain:kill_record_failed', { error: String(err) }));
    }

    logServer('player:damage', {
      roomCode: roomCodeUp,
      attacker: attackerId,
      victim: victimId,
      damage: healthDepleted,
      killed,
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
  const rooms = roomManager.listRooms();
  for (const room of rooms) {
    io.to(room.code).emit('room:state', {
      room,
      serverTime: Date.now(),
      tickRate: 20
    });
  }
}, 50);

server.listen(port, () => {
  console.log(`Tempo Karts server running on http://localhost:${port}`);
});
