import { randomUUID } from 'node:crypto';
import type { AttackEvent, ItemEvent, PlayerState, RoomState, Vec2 } from '../types.js';

type RoomRecord = {
  code: string;
  hostPlayerId: string;
  maxPlayers: number;
  status: 'lobby' | 'in-progress' | 'finished';
  players: Map<string, PlayerState>;
  spectators: Set<string>; // socket ids
  lastUpdatedAt: number;
};

const PLAYER_SPAWN: Vec2 = { x: 800, y: 600 };

export class RoomManager {
  private rooms = new Map<string, RoomRecord>();

  createRoom(hostName: string, walletAddress?: string, maxPlayers = 4) {
    const code = this.generateCode();
    const hostPlayerId = randomUUID();

    const room: RoomRecord = {
      code,
      hostPlayerId,
      maxPlayers,
      status: 'lobby',
      players: new Map(),
      spectators: new Set(),
      lastUpdatedAt: Date.now()
    };

    const hostPlayer: PlayerState = {
      id: hostPlayerId,
      name: hostName,
      walletAddress,
      socketId: '',
      position: { ...PLAYER_SPAWN },
      velocity: { x: 0, y: 0 },
      rotation: 0,
      hp: 100,
      kills: 0,
      deaths: 0,
      updatedAt: Date.now()
    };

    room.players.set(hostPlayerId, hostPlayer);
    this.rooms.set(code, room);

    return {
      room: this.toRoomState(room),
      hostPlayer
    };
  }

  getRoom(code: string) {
    const room = this.rooms.get(code.toUpperCase());
    return room ? this.toRoomState(room) : null;
  }

  listRooms() {
    return [...this.rooms.values()].map((room) => this.toRoomState(room));
  }

  joinRoomAsPlayer(code: string, socketId: string, name: string, walletAddress?: string) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      return { error: 'Room not found' as const };
    }

    if (room.players.size >= room.maxPlayers) {
      return { error: 'Room is full' as const };
    }

    const player: PlayerState = {
      id: randomUUID(),
      name,
      walletAddress,
      socketId,
      position: { ...PLAYER_SPAWN },
      velocity: { x: 0, y: 0 },
      rotation: 0,
      hp: 100,
      kills: 0,
      deaths: 0,
      updatedAt: Date.now()
    };

    room.players.set(player.id, player);
    room.lastUpdatedAt = Date.now();

    return {
      room: this.toRoomState(room),
      player
    };
  }

  attachHostSocket(code: string, socketId: string, hostPlayerId: string) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      return false;
    }

    const host = room.players.get(hostPlayerId);
    if (!host) {
      return false;
    }

    host.socketId = socketId;
    host.updatedAt = Date.now();
    room.lastUpdatedAt = Date.now();
    return true;
  }

  joinRoomAsSpectator(code: string, socketId: string) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      return { error: 'Room not found' as const };
    }

    room.spectators.add(socketId);
    room.lastUpdatedAt = Date.now();

    return {
      room: this.toRoomState(room)
    };
  }

  removeSocket(socketId: string) {
    for (const room of this.rooms.values()) {
      if (room.spectators.delete(socketId)) {
        room.lastUpdatedAt = Date.now();
        return { roomCode: room.code, playerId: null as string | null };
      }

      for (const [playerId, player] of room.players.entries()) {
        if (player.socketId === socketId) {
          room.players.delete(playerId);
          room.lastUpdatedAt = Date.now();

          if (room.players.size === 0 && room.spectators.size === 0) {
            this.rooms.delete(room.code);
          }

          return { roomCode: room.code, playerId };
        }
      }
    }

    return null;
  }

  leaveRoom(code: string, playerId: string, socketId: string) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      return { ok: false };
    }

    if (playerId && room.players.has(playerId)) {
      room.players.delete(playerId);
      room.lastUpdatedAt = Date.now();
      return { ok: true, playerId };
    }

    if (room.spectators.delete(socketId)) {
      room.lastUpdatedAt = Date.now();
      return { ok: true, playerId: null as string | null };
    }

    return { ok: false };
  }

  updatePosition(code: string, playerId: string, patch: Partial<Pick<PlayerState, 'position' | 'velocity' | 'rotation' | 'hp'>>) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      return null;
    }

    const player = room.players.get(playerId);
    if (!player) {
      return null;
    }

    if (patch.position) player.position = patch.position;
    if (patch.velocity) player.velocity = patch.velocity;
    if (typeof patch.rotation === 'number') player.rotation = patch.rotation;
    if (typeof patch.hp === 'number') player.hp = patch.hp;

    player.updatedAt = Date.now();
    room.lastUpdatedAt = Date.now();

    return { player, roomCode: room.code };
  }

  getRoomSnapshot(code: string) {
    const room = this.rooms.get(code.toUpperCase());
    return room ? this.toRoomState(room) : null;
  }

  startGame(code: string) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      return null;
    }

    room.status = 'in-progress';
    room.lastUpdatedAt = Date.now();
    return this.toRoomState(room);
  }

  createAttackEvent(code: string, playerId: string, weaponType: AttackEvent['weaponType'], position: Vec2, direction: Vec2, payload?: Record<string, unknown>) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room || !room.players.has(playerId)) {
      return null;
    }

    room.lastUpdatedAt = Date.now();

    return {
      id: randomUUID(),
      roomCode: room.code,
      playerId,
      weaponType,
      position,
      direction,
      createdAt: Date.now(),
      payload
    } satisfies AttackEvent;
  }

  createItemEvent(code: string, playerId: string, kind: ItemEvent['kind'], itemType: string, targetId?: string, payload?: Record<string, unknown>) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room || !room.players.has(playerId)) {
      return null;
    }

    room.lastUpdatedAt = Date.now();

    return {
      id: randomUUID(),
      roomCode: room.code,
      playerId,
      kind,
      itemType,
      targetId,
      createdAt: Date.now(),
      payload
    } satisfies ItemEvent;
  }

  private toRoomState(room: RoomRecord): RoomState {
    return {
      code: room.code,
      hostPlayerId: room.hostPlayerId,
      maxPlayers: room.maxPlayers,
      status: room.status,
      players: [...room.players.values()],
      spectators: room.spectators.size,
      lastUpdatedAt: room.lastUpdatedAt
    };
  }

  private generateCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    while (true) {
      let code = '';
      for (let i = 0; i < 4; i += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }

      const formatted = `KART-${code}`;
      if (!this.rooms.has(formatted)) {
        return formatted;
      }
    }
  }
}
