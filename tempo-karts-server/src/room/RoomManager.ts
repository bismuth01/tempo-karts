import { randomUUID } from 'node:crypto';
import type {
  AttackEvent,
  CrateSlotState,
  ItemEvent,
  PlayerState,
  RoomState,
  Vec2,
  WeaponType
} from '../types.js';

type RoomRecord = {
  code: string;
  hostPlayerId: string;
  maxPlayers: number;
  status: 'lobby' | 'in-progress' | 'finished';
  players: Map<string, PlayerState>;
  crateSlots: Map<string, CrateSlotState>;
  activeBombs: Map<string, ActiveBombState>;
  activeBulletStreams: Map<string, ActiveBulletStreamState>;
  spectators: Set<string>; // socket ids
  lastUpdatedAt: number;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ActiveBombState = {
  id: string;
  ownerPlayerId: string;
  position: Vec2;
  placedAt: number;
  explodeAt: number;
  radius: number;
  touchRadius: number;
};

type ActiveBulletStreamState = {
  id: string;
  ownerPlayerId: string;
  startedAt: number;
  endsAt: number;
  nextShotAt: number;
  shotIntervalMs: number;
  range: number;
  damage: number;
  fallbackDirection: Vec2;
};

type TraceResult = {
  end: Vec2;
  hitType: 'none' | 'wall' | 'player';
  hitPlayerId: string | null;
};

type TickResult = {
  attackEvents: AttackEvent[];
};

const PLAYER_SPAWN: Vec2 = { x: 800, y: 600 };
const CRATE_RESPAWN_MS = 60_000;
const WEAPON_DURATION_MS = 40_000;
const BOMB_TIMER_MS = 5_000;
const BULLET_STREAM_MS = 6_000;
const WEAPON_POOL: WeaponType[] = ['rocket', 'bomb', 'bullet'];

const ROCKET_DAMAGE = 100;
const BULLET_DAMAGE = 20;
const BOMB_DAMAGE = 70;
const BOMB_TOUCH_DAMAGE = 100;

const ROCKET_RANGE = 1800;
const BULLET_RANGE = 920;
const BULLET_INTERVAL_MS = 130;
const ROCKET_TRAVEL_SPEED = 980;

const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 2000;
const PLAYER_HIT_RADIUS = 36;
const BOMB_RADIUS = 152;
const BOMB_TOUCH_RADIUS = 64;

const CRATE_SPAWN_POINTS: Array<{ id: string; position: Vec2 }> = [
  { id: 'crate-1', position: { x: 1600, y: 600 } },
  { id: 'crate-2', position: { x: 1080, y: 760 } },
  { id: 'crate-3', position: { x: 2120, y: 760 } },
  { id: 'crate-4', position: { x: 960, y: 1000 } },
  { id: 'crate-5', position: { x: 2240, y: 1000 } },
  { id: 'crate-6', position: { x: 1080, y: 1240 } },
  { id: 'crate-7', position: { x: 2120, y: 1240 } },
  { id: 'crate-8', position: { x: 1600, y: 1400 } }
];

const toRectBounds = (rect: Rect) => ({
  minX: rect.x - rect.width / 2,
  maxX: rect.x + rect.width / 2,
  minY: rect.y - rect.height / 2,
  maxY: rect.y + rect.height / 2
});

const MAP_BLOCKERS = (() => {
  const arena = {
    x: 360,
    y: 220,
    width: 2480,
    height: 1560
  };

  const blockers: Rect[] = [];
  const t = 60;

  blockers.push({ x: arena.x + arena.width / 2, y: arena.y + t / 2, width: arena.width, height: t });
  blockers.push({ x: arena.x + arena.width / 2, y: arena.y + arena.height - t / 2, width: arena.width, height: t });
  blockers.push({ x: arena.x + t / 2, y: arena.y + arena.height / 2, width: t, height: arena.height });
  blockers.push({ x: arena.x + arena.width - t / 2, y: arena.y + arena.height / 2, width: t, height: arena.height });

  const cornerSize = 210;
  blockers.push({ x: arena.x + 250, y: arena.y + 250, width: cornerSize, height: cornerSize });
  blockers.push({ x: arena.x + arena.width - 250, y: arena.y + 250, width: cornerSize, height: cornerSize });
  blockers.push({ x: arena.x + 250, y: arena.y + arena.height - 250, width: cornerSize, height: cornerSize });
  blockers.push({ x: arena.x + arena.width - 250, y: arena.y + arena.height - 250, width: cornerSize, height: cornerSize });

  const cx = arena.x + arena.width / 2;
  const cy = arena.y + arena.height / 2;
  const leftX = cx - 340;
  const rightX = cx + 340;
  const topY = cy - 260;
  const bottomY = cy + 260;
  const arm = 240;
  const wallT = 58;

  blockers.push({ x: leftX + arm / 2, y: topY, width: arm, height: wallT });
  blockers.push({ x: leftX, y: topY + arm / 2, width: wallT, height: arm });
  blockers.push({ x: rightX - arm / 2, y: topY, width: arm, height: wallT });
  blockers.push({ x: rightX, y: topY + arm / 2, width: wallT, height: arm });
  blockers.push({ x: leftX, y: bottomY - arm / 2, width: wallT, height: arm });
  blockers.push({ x: leftX + arm / 2, y: bottomY, width: arm, height: wallT });
  blockers.push({ x: rightX, y: bottomY - arm / 2, width: wallT, height: arm });
  blockers.push({ x: rightX - arm / 2, y: bottomY, width: arm, height: wallT });

  return blockers.map(toRectBounds);
})();

export class RoomManager {
  private rooms = new Map<string, RoomRecord>();

  createRoom(hostName: string, walletAddress?: string, maxPlayers = 4) {
    const code = this.generateCode();
    const hostPlayerId = randomUUID();
    const now = Date.now();

    const room: RoomRecord = {
      code,
      hostPlayerId,
      maxPlayers,
      status: 'lobby',
      players: new Map(),
      crateSlots: this.createInitialCrateSlots(now),
      activeBombs: new Map(),
      activeBulletStreams: new Map(),
      spectators: new Set(),
      lastUpdatedAt: now
    };

    const hostPlayer = this.createPlayerState(hostPlayerId, hostName, '', walletAddress, now);

    room.players.set(hostPlayerId, hostPlayer);
    this.rooms.set(code, room);

    return {
      room: this.toRoomState(room),
      hostPlayer
    };
  }

  getRoom(code: string) {
    this.tick(Date.now(), false);
    const room = this.rooms.get(code.toUpperCase());
    return room ? this.toRoomState(room) : null;
  }

  listRooms() {
    this.tick(Date.now(), false);
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

    const now = Date.now();
    this.advanceRoomTimers(room, now);
    const player = this.createPlayerState(randomUUID(), name, socketId, walletAddress, now);

    room.players.set(player.id, player);
    room.lastUpdatedAt = now;

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
    this.advanceRoomTimers(room, Date.now());

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
    this.advanceRoomTimers(room, Date.now());

    room.spectators.add(socketId);
    room.lastUpdatedAt = Date.now();

    return {
      room: this.toRoomState(room)
    };
  }

  removeSocket(socketId: string) {
    for (const room of this.rooms.values()) {
      this.advanceRoomTimers(room, Date.now());

      if (room.spectators.delete(socketId)) {
        room.lastUpdatedAt = Date.now();
        return { roomCode: room.code, playerId: null as string | null };
      }

      for (const [playerId, player] of room.players.entries()) {
        if (player.socketId === socketId) {
          room.players.delete(playerId);
          this.removePlayerCombatState(room, playerId);
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
    this.advanceRoomTimers(room, Date.now());

    if (playerId && room.players.has(playerId)) {
      room.players.delete(playerId);
      this.removePlayerCombatState(room, playerId);
      room.lastUpdatedAt = Date.now();
      if (room.players.size === 0 && room.spectators.size === 0) {
        this.rooms.delete(room.code);
      }
      return { ok: true, playerId };
    }

    if (room.spectators.delete(socketId)) {
      room.lastUpdatedAt = Date.now();
      if (room.players.size === 0 && room.spectators.size === 0) {
        this.rooms.delete(room.code);
      }
      return { ok: true, playerId: null as string | null };
    }

    return { ok: false };
  }

  updatePosition(code: string, playerId: string, patch: Partial<Pick<PlayerState, 'position' | 'velocity' | 'rotation' | 'hp'>>) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      return null;
    }
    this.advanceRoomTimers(room, Date.now());

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
    this.tick(Date.now(), false);
    const room = this.rooms.get(code.toUpperCase());
    return room ? this.toRoomState(room) : null;
  }

  startGame(code: string) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      return null;
    }
    this.advanceRoomTimers(room, Date.now());

    room.status = 'in-progress';
    room.lastUpdatedAt = Date.now();
    return this.toRoomState(room);
  }

  useWeapon(
    code: string,
    playerId: string,
    requestedWeaponType: AttackEvent['weaponType'],
    position: Vec2,
    direction: Vec2,
    payload?: Record<string, unknown>
  ) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      return { error: 'Room not found' as const };
    }

    const now = Date.now();
    this.advanceRoomTimers(room, now);

    const player = room.players.get(playerId);
    if (!player) {
      return { error: 'Player not found' as const };
    }

    const activeWeapon = player.activeWeaponType;
    if (!activeWeapon) {
      return { error: 'No active weapon' as const };
    }

    if (requestedWeaponType !== 'unknown' && requestedWeaponType !== activeWeapon) {
      return { error: 'Weapon mismatch' as const };
    }

    if (player.activeWeaponExpiresAt !== null && now >= player.activeWeaponExpiresAt) {
      player.activeWeaponType = null;
      player.activeWeaponGrantedAt = null;
      player.activeWeaponExpiresAt = null;
      player.updatedAt = now;
      room.lastUpdatedAt = now;
      return { error: 'Weapon expired' as const };
    }

    player.activeWeaponType = null;
    player.activeWeaponGrantedAt = null;
    player.activeWeaponExpiresAt = null;
    player.updatedAt = now;
    room.lastUpdatedAt = now;

    const itemEvent = {
      id: randomUUID(),
      roomCode: room.code,
      playerId: player.id,
      kind: 'use',
      itemType: activeWeapon,
      createdAt: now,
      payload: {
        ...(payload ?? {}),
        consumedAt: now
      }
    } satisfies ItemEvent;

    const origin = { ...player.position };
    const aim = this.resolveDirection(direction, player.velocity);
    const attackEvents: AttackEvent[] = [];

    if (activeWeapon === 'rocket') {
      attackEvents.push(this.fireRocket(room, player, origin, aim, now));
    } else if (activeWeapon === 'bomb') {
      attackEvents.push(this.placeBomb(room, player, origin, now));
    } else if (activeWeapon === 'bullet') {
      attackEvents.push(this.startBulletStream(room, player, origin, aim, now));
    }

    return {
      itemEvent,
      attackEvents,
      weaponType: activeWeapon
    };
  }

  createItemEvent(
    code: string,
    playerId: string,
    kind: ItemEvent['kind'],
    itemType: string,
    targetId?: string,
    payload?: Record<string, unknown>,
    slotId?: string
  ) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room || !room.players.has(playerId)) {
      return null;
    }
    this.advanceRoomTimers(room, Date.now());

    room.lastUpdatedAt = Date.now();

    return {
      id: randomUUID(),
      roomCode: room.code,
      playerId,
      kind,
      itemType,
      slotId,
      targetId,
      createdAt: Date.now(),
      payload
    } satisfies ItemEvent;
  }

  pickupCrate(code: string, playerId: string, slotId: string, payload?: Record<string, unknown>) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      return { error: 'Room not found' as const };
    }

    const now = Date.now();
    this.advanceRoomTimers(room, now);

    const player = room.players.get(playerId);
    if (!player) {
      return { error: 'Player not found' as const };
    }

    if (player.activeWeaponType !== null) {
      return { error: 'Player already has an active weapon' as const };
    }

    const slot = room.crateSlots.get(slotId);
    if (!slot) {
      return { error: 'Crate slot not found' as const };
    }

    if (!slot.isAvailable) {
      return { error: 'Crate not available' as const };
    }

    slot.isAvailable = false;
    slot.respawnAt = now + CRATE_RESPAWN_MS;
    slot.updatedAt = now;

    player.activeWeaponType = slot.weaponType;
    player.activeWeaponGrantedAt = now;
    player.activeWeaponExpiresAt = now + WEAPON_DURATION_MS;
    player.updatedAt = now;

    room.lastUpdatedAt = now;

    const event = {
      id: randomUUID(),
      roomCode: room.code,
      playerId,
      kind: 'pickup',
      itemType: slot.weaponType,
      slotId: slot.id,
      createdAt: now,
      payload: {
        ...(payload ?? {}),
        respawnAt: slot.respawnAt,
        weaponExpiresAt: player.activeWeaponExpiresAt
      }
    } satisfies ItemEvent;

    return {
      event,
      slot,
      player
    };
  }

  tick(now = Date.now(), includeCombat = true): TickResult {
    const attackEvents: AttackEvent[] = [];

    for (const room of this.rooms.values()) {
      this.advanceRoomTimers(room, now);
      if (!includeCombat) {
        continue;
      }

      this.advanceBombs(room, now, attackEvents);
      this.advanceBulletStreams(room, now, attackEvents);
    }

    return { attackEvents };
  }

  private toRoomState(room: RoomRecord): RoomState {
    return {
      code: room.code,
      hostPlayerId: room.hostPlayerId,
      maxPlayers: room.maxPlayers,
      status: room.status,
      players: [...room.players.values()].map((player) => ({
        ...player,
        position: { ...player.position },
        velocity: { ...player.velocity }
      })),
      crateSlots: [...room.crateSlots.values()].map((slot) => ({
        ...slot,
        position: { ...slot.position }
      })),
      spectators: room.spectators.size,
      lastUpdatedAt: room.lastUpdatedAt
    };
  }

  private createPlayerState(id: string, name: string, socketId: string, walletAddress?: string, now = Date.now()): PlayerState {
    return {
      id,
      name,
      walletAddress,
      socketId,
      position: { ...PLAYER_SPAWN },
      velocity: { x: 0, y: 0 },
      rotation: 0,
      hp: 100,
      kills: 0,
      deaths: 0,
      activeWeaponType: null,
      activeWeaponGrantedAt: null,
      activeWeaponExpiresAt: null,
      updatedAt: now
    };
  }

  private createInitialCrateSlots(now: number) {
    const slots = new Map<string, CrateSlotState>();

    CRATE_SPAWN_POINTS.forEach((spawn) => {
      slots.set(spawn.id, {
        id: spawn.id,
        position: { ...spawn.position },
        isAvailable: true,
        weaponType: this.randomWeaponType(),
        respawnAt: null,
        updatedAt: now
      });
    });

    return slots;
  }

  private randomWeaponType(): WeaponType {
    return WEAPON_POOL[Math.floor(Math.random() * WEAPON_POOL.length)];
  }

  private advanceRoomTimers(room: RoomRecord, now: number) {
    let changed = false;

    for (const slot of room.crateSlots.values()) {
      if (!slot.isAvailable && slot.respawnAt !== null && now >= slot.respawnAt) {
        slot.isAvailable = true;
        slot.respawnAt = null;
        slot.weaponType = this.randomWeaponType();
        slot.updatedAt = now;
        changed = true;
      }
    }

    for (const player of room.players.values()) {
      if (player.activeWeaponExpiresAt !== null && now >= player.activeWeaponExpiresAt) {
        player.activeWeaponType = null;
        player.activeWeaponGrantedAt = null;
        player.activeWeaponExpiresAt = null;
        player.updatedAt = now;
        changed = true;
      }
    }

    if (changed) {
      room.lastUpdatedAt = now;
    }
  }

  private removePlayerCombatState(room: RoomRecord, playerId: string) {
    for (const [bombId, bomb] of room.activeBombs.entries()) {
      if (bomb.ownerPlayerId === playerId) {
        room.activeBombs.delete(bombId);
      }
    }

    for (const [streamId, stream] of room.activeBulletStreams.entries()) {
      if (stream.ownerPlayerId === playerId) {
        room.activeBulletStreams.delete(streamId);
      }
    }
  }

  private fireRocket(room: RoomRecord, shooter: PlayerState, origin: Vec2, direction: Vec2, now: number): AttackEvent {
    const trace = this.traceShot(room, shooter.id, origin, direction, ROCKET_RANGE, PLAYER_HIT_RADIUS);
    if (trace.hitPlayerId) {
      this.applyDamage(room, shooter.id, trace.hitPlayerId, ROCKET_DAMAGE, 'rocket', now);
    }

    const distance = Math.hypot(trace.end.x - origin.x, trace.end.y - origin.y);
    const travelMs = Math.max(120, Math.min(920, Math.round((distance / ROCKET_TRAVEL_SPEED) * 1000)));

    return this.makeAttackEvent(
      room.code,
      shooter.id,
      'rocket',
      origin,
      direction,
      {
        phase: 'rocket_fire',
        start: { ...origin },
        end: { ...trace.end },
        hitType: trace.hitType,
        hitPlayerId: trace.hitPlayerId,
        travelMs
      },
      now
    );
  }

  private placeBomb(room: RoomRecord, shooter: PlayerState, origin: Vec2, now: number): AttackEvent {
    const bomb: ActiveBombState = {
      id: randomUUID(),
      ownerPlayerId: shooter.id,
      position: { ...origin },
      placedAt: now,
      explodeAt: now + BOMB_TIMER_MS,
      radius: BOMB_RADIUS,
      touchRadius: BOMB_TOUCH_RADIUS
    };

    room.activeBombs.set(bomb.id, bomb);
    room.lastUpdatedAt = now;

    return this.makeAttackEvent(
      room.code,
      shooter.id,
      'bomb',
      bomb.position,
      { x: 0, y: 1 },
      {
        phase: 'bomb_place',
        bombId: bomb.id,
        position: { ...bomb.position },
        explodeAt: bomb.explodeAt,
        radius: bomb.radius,
        touchRadius: bomb.touchRadius
      },
      now
    );
  }

  private startBulletStream(room: RoomRecord, shooter: PlayerState, origin: Vec2, direction: Vec2, now: number): AttackEvent {
    const stream: ActiveBulletStreamState = {
      id: randomUUID(),
      ownerPlayerId: shooter.id,
      startedAt: now,
      endsAt: now + BULLET_STREAM_MS,
      nextShotAt: now,
      shotIntervalMs: BULLET_INTERVAL_MS,
      range: BULLET_RANGE,
      damage: BULLET_DAMAGE,
      fallbackDirection: { ...direction }
    };

    room.activeBulletStreams.set(stream.id, stream);
    room.lastUpdatedAt = now;

    return this.makeAttackEvent(
      room.code,
      shooter.id,
      'bullet',
      origin,
      direction,
      {
        phase: 'bullet_start',
        burstId: stream.id,
        startedAt: stream.startedAt,
        endsAt: stream.endsAt
      },
      now
    );
  }

  private advanceBombs(room: RoomRecord, now: number, attackEvents: AttackEvent[]) {
    for (const [bombId, bomb] of room.activeBombs.entries()) {
      if (!room.players.has(bomb.ownerPlayerId)) {
        room.activeBombs.delete(bombId);
        continue;
      }

      let toucherId: string | null = null;
      const touchRadiusSq = bomb.touchRadius * bomb.touchRadius;

      for (const player of room.players.values()) {
        if (player.id === bomb.ownerPlayerId) {
          continue;
        }

        const dx = player.position.x - bomb.position.x;
        const dy = player.position.y - bomb.position.y;
        if ((dx * dx) + (dy * dy) <= touchRadiusSq) {
          toucherId = player.id;
          break;
        }
      }

      if (toucherId || now >= bomb.explodeAt) {
        this.explodeBomb(room, bomb, now, toucherId, attackEvents);
        room.activeBombs.delete(bombId);
      }
    }
  }

  private explodeBomb(
    room: RoomRecord,
    bomb: ActiveBombState,
    now: number,
    toucherId: string | null,
    attackEvents: AttackEvent[]
  ) {
    const hitPlayerIds = new Set<string>();

    if (toucherId) {
      const touchDamage = this.applyDamage(room, bomb.ownerPlayerId, toucherId, BOMB_TOUCH_DAMAGE, 'bomb', now);
      if (touchDamage.applied) {
        hitPlayerIds.add(toucherId);
      }
    }

    const radiusSq = bomb.radius * bomb.radius;
    for (const player of room.players.values()) {
      if (player.id === bomb.ownerPlayerId || player.id === toucherId) {
        continue;
      }

      const dx = player.position.x - bomb.position.x;
      const dy = player.position.y - bomb.position.y;
      if ((dx * dx) + (dy * dy) > radiusSq) {
        continue;
      }

      const blastDamage = this.applyDamage(room, bomb.ownerPlayerId, player.id, BOMB_DAMAGE, 'bomb', now);
      if (blastDamage.applied) {
        hitPlayerIds.add(player.id);
      }
    }

    attackEvents.push(this.makeAttackEvent(
      room.code,
      bomb.ownerPlayerId,
      'bomb',
      bomb.position,
      { x: 0, y: 1 },
      {
        phase: 'bomb_explode',
        bombId: bomb.id,
        position: { ...bomb.position },
        radius: bomb.radius,
        trigger: toucherId ? 'touch' : 'timer',
        hitPlayerIds: [...hitPlayerIds]
      },
      now
    ));
  }

  private advanceBulletStreams(room: RoomRecord, now: number, attackEvents: AttackEvent[]) {
    for (const [streamId, stream] of room.activeBulletStreams.entries()) {
      const owner = room.players.get(stream.ownerPlayerId);
      if (!owner) {
        room.activeBulletStreams.delete(streamId);
        continue;
      }

      while (stream.nextShotAt <= now && stream.nextShotAt <= stream.endsAt) {
        const direction = this.resolveDirection(owner.velocity, stream.fallbackDirection);
        stream.fallbackDirection = { ...direction };
        const origin = { ...owner.position };
        const trace = this.traceShot(room, owner.id, origin, direction, stream.range, PLAYER_HIT_RADIUS - 4);

        if (trace.hitPlayerId) {
          this.applyDamage(room, owner.id, trace.hitPlayerId, stream.damage, 'bullet', now);
        }

        attackEvents.push(this.makeAttackEvent(
          room.code,
          owner.id,
          'bullet',
          origin,
          direction,
          {
            phase: 'bullet_trace',
            burstId: stream.id,
            from: { ...origin },
            to: { ...trace.end },
            hitType: trace.hitType,
            hitPlayerId: trace.hitPlayerId
          },
          now
        ));

        stream.nextShotAt += stream.shotIntervalMs;
      }

      if (stream.nextShotAt > stream.endsAt && now >= stream.endsAt) {
        attackEvents.push(this.makeAttackEvent(
          room.code,
          owner.id,
          'bullet',
          { ...owner.position },
          { ...stream.fallbackDirection },
          {
            phase: 'bullet_end',
            burstId: stream.id
          },
          now
        ));

        room.activeBulletStreams.delete(streamId);
      }
    }
  }

  private traceShot(
    room: RoomRecord,
    shooterId: string,
    origin: Vec2,
    direction: Vec2,
    maxDistance: number,
    hitRadius: number
  ): TraceResult {
    const step = 12;
    let end = {
      x: origin.x + direction.x * maxDistance,
      y: origin.y + direction.y * maxDistance
    };

    for (let distance = step; distance <= maxDistance; distance += step) {
      const point = {
        x: origin.x + direction.x * distance,
        y: origin.y + direction.y * distance
      };

      if (!this.isInsideWorld(point.x, point.y) || this.isBlockedPoint(point.x, point.y)) {
        return { end: point, hitType: 'wall', hitPlayerId: null };
      }

      const hitPlayer = this.findPlayerHitAtPoint(room, shooterId, point.x, point.y, hitRadius);
      if (hitPlayer) {
        return { end: point, hitType: 'player', hitPlayerId: hitPlayer.id };
      }

      end = point;
    }

    return {
      end,
      hitType: 'none',
      hitPlayerId: null
    };
  }

  private findPlayerHitAtPoint(
    room: RoomRecord,
    shooterId: string,
    x: number,
    y: number,
    radius: number
  ) {
    const radiusSq = radius * radius;

    for (const player of room.players.values()) {
      if (player.id === shooterId) {
        continue;
      }

      const dx = player.position.x - x;
      const dy = player.position.y - y;
      if ((dx * dx) + (dy * dy) <= radiusSq) {
        return player;
      }
    }

    return null;
  }

  private applyDamage(
    room: RoomRecord,
    sourcePlayerId: string,
    targetPlayerId: string,
    damage: number,
    _weaponType: WeaponType,
    now: number
  ) {
    if (damage <= 0 || sourcePlayerId === targetPlayerId) {
      return { applied: false, killed: false, hpAfter: 0 };
    }

    const target = room.players.get(targetPlayerId);
    if (!target) {
      return { applied: false, killed: false, hpAfter: 0 };
    }

    target.hp = Math.max(0, target.hp - damage);
    target.updatedAt = now;

    let killed = false;
    if (target.hp <= 0) {
      killed = true;
      target.deaths += 1;
      target.hp = 100;
      target.activeWeaponType = null;
      target.activeWeaponGrantedAt = null;
      target.activeWeaponExpiresAt = null;

      const source = room.players.get(sourcePlayerId);
      if (source && source.id !== target.id) {
        source.kills += 1;
        source.updatedAt = now;
      }
    }

    room.lastUpdatedAt = now;
    return { applied: true, killed, hpAfter: target.hp };
  }

  private resolveDirection(preferred: Vec2, fallback: Vec2): Vec2 {
    const preferredDirection = this.normalize(preferred);
    if (preferredDirection) {
      return preferredDirection;
    }

    const fallbackDirection = this.normalize(fallback);
    if (fallbackDirection) {
      return fallbackDirection;
    }

    return { x: 0, y: 1 };
  }

  private normalize(vector: Vec2): Vec2 | null {
    const length = Math.hypot(vector.x, vector.y);
    if (length < 0.00001) {
      return null;
    }

    return {
      x: vector.x / length,
      y: vector.y / length
    };
  }

  private isInsideWorld(x: number, y: number) {
    return x >= 0 && x <= WORLD_WIDTH && y >= 0 && y <= WORLD_HEIGHT;
  }

  private isBlockedPoint(x: number, y: number) {
    for (const blocker of MAP_BLOCKERS) {
      if (x >= blocker.minX && x <= blocker.maxX && y >= blocker.minY && y <= blocker.maxY) {
        return true;
      }
    }

    return false;
  }

  private makeAttackEvent(
    roomCode: string,
    playerId: string,
    weaponType: AttackEvent['weaponType'],
    position: Vec2,
    direction: Vec2,
    payload: Record<string, unknown>,
    now: number
  ) {
    return {
      id: randomUUID(),
      roomCode,
      playerId,
      weaponType,
      position: { ...position },
      direction: { ...direction },
      createdAt: now,
      payload
    } satisfies AttackEvent;
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
