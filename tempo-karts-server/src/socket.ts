import type { AttackEvent, ItemEvent, PlayerState, RoomState, Vec2 } from './types.js';

export type JoinPayload = {
  roomCode: string;
  role?: 'player' | 'spectator';
  playerName?: string;
  walletAddress?: string;
  playerId?: string;
};

export type PositionPayload = {
  roomCode: string;
  playerId: string;
  position: Vec2;
  velocity?: Vec2;
  rotation?: number;
  hp?: number;
  ts?: number;
};

export type AttackPayload = {
  roomCode: string;
  playerId: string;
  weaponType: AttackEvent['weaponType'];
  position: Vec2;
  direction: Vec2;
  payload?: Record<string, unknown>;
  ts?: number;
};

export type ItemPayload = {
  roomCode: string;
  playerId: string;
  kind: ItemEvent['kind'];
  itemType: string;
  targetId?: string;
  payload?: Record<string, unknown>;
  ts?: number;
};

export type LeavePayload = {
  roomCode: string;
  playerId?: string;
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

export type AckLeaveSuccess = { ok: true };

export interface ClientToServerEvents {
  'room:join': (payload: JoinPayload, ack?: (response: AckJoinSuccess | AckError) => void) => void;
  'room:leave': (payload: LeavePayload, ack?: (response: AckLeaveSuccess | AckError) => void) => void;
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
  'room:game_started': (payload: { room: RoomState | null }) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  roomCode?: string;
  role?: 'player' | 'spectator';
  playerId?: string;
}
