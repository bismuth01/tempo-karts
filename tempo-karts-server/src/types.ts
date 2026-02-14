export type Role = 'player' | 'spectator';

export type Vec2 = {
  x: number;
  y: number;
};

export type WeaponType = 'rocket' | 'bomb' | 'bullet';

export type PlayerState = {
  id: string;
  name: string;
  walletAddress?: string;
  socketId: string;
  position: Vec2;
  velocity: Vec2;
  rotation: number;
  hp: number;
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
