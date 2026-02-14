import type { Socket } from 'socket.io-client';

export type Vec2 = {
    x: number;
    y: number;
};

export type WeaponType = 'rocket' | 'bomb' | 'bullet';

export type PlayerState = {
    id: string;
    name: string;
    walletAddress?: string;
    position: Vec2;
    velocity: Vec2;
    rotation: number;
    hp: number;
    isAlive: boolean;
    respawnAt: number | null;
    kills: number;
    deaths: number;
    activeWeaponType: WeaponType | null;
    activeWeaponGrantedAt: number | null;
    activeWeaponExpiresAt: number | null;
    updatedAt: number;
};

export type CrateSlotState = {
    id: string;
    position: Vec2;
    isAvailable: boolean;
    weaponType: WeaponType;
    respawnAt: number | null;
    updatedAt: number;
};

export type RoomState = {
    code: string;
    hostPlayerId: string;
    maxPlayers: number;
    status: 'lobby' | 'in-progress' | 'finished';
    players: PlayerState[];
    crateSlots: CrateSlotState[];
    spectators: number;
    lastUpdatedAt: number;
};

export type JoinPayload = {
    roomCode: string;
    role?: 'player' | 'spectator';
    playerName?: string;
    walletAddress?: string;
    playerId?: string;
};

export type LeavePayload = {
    roomCode: string;
    playerId?: string;
};

export type PositionPayload = {
    roomCode: string;
    playerId: string;
    position: Vec2;
    velocity?: Vec2;
    rotation?: number;
    ts?: number;
};

export type AttackPayload = {
    roomCode: string;
    playerId: string;
    weaponType: WeaponType | 'unknown';
    position: Vec2;
    direction: Vec2;
    payload?: Record<string, unknown>;
    ts?: number;
};

export type ItemPayload = {
    roomCode: string;
    playerId: string;
    kind: 'pickup' | 'use';
    itemType: string;
    slotId?: string;
    targetId?: string;
    payload?: Record<string, unknown>;
    ts?: number;
};

export type ItemEvent = {
    id: string;
    roomCode: string;
    playerId: string;
    kind: 'pickup' | 'use';
    itemType: string;
    slotId?: string;
    targetId?: string;
    createdAt: number;
    payload?: Record<string, unknown>;
};

export type AttackEvent = {
    id: string;
    roomCode: string;
    playerId: string;
    weaponType: WeaponType | 'unknown';
    position: Vec2;
    direction: Vec2;
    createdAt: number;
    payload?: Record<string, unknown>;
};

export type AckError = {
    ok: false;
    error: string;
    details?: unknown;
};

export type AckJoinSuccess = {
    ok: true;
    room: RoomState;
    role: 'player' | 'spectator';
    player?: PlayerState;
    playerId?: string;
};

export type AckLeaveSuccess = {
    ok: true;
};

export type JoinAckResponse = AckJoinSuccess | AckError;
export type LeaveAckResponse = AckLeaveSuccess | AckError;

export interface ClientToServerEvents {
    'room:join': (payload: JoinPayload, ack?: (response: JoinAckResponse) => void) => void;
    'room:leave': (payload: LeavePayload, ack?: (response: LeaveAckResponse) => void) => void;
    'player:position': (payload: PositionPayload) => void;
    'player:attack': (payload: AttackPayload) => void;
    'player:item': (payload: ItemPayload) => void;
}

export interface ServerToClientEvents {
    'room:joined': (payload: { room: RoomState; role: 'player' | 'spectator'; player?: PlayerState; playerId?: string }) => void;
    'room:player_joined': (payload: { roomCode: string; player?: PlayerState; playerId?: string }) => void;
    'room:player_left': (payload: { roomCode: string; playerId: string }) => void;
    'room:position': (payload: PositionPayload) => void;
    'room:attack': (payload: AttackEvent & { ts: number }) => void;
    'room:item': (payload: ItemEvent & { ts: number }) => void;
    'room:state': (payload: { room: RoomState; serverTime: number; tickRate: number }) => void;
}

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type MultiplayerSession = {
    socket: GameSocket;
    roomCode: string;
    playerId: string;
    room: RoomState;
};
