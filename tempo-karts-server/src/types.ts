export type Role = 'player' | 'spectator';

export type Vec2 = {
  x: number;
  y: number;
};

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
  updatedAt: number;
};

export type AttackEvent = {
  id: string;
  roomCode: string;
  playerId: string;
  weaponType: 'rocket' | 'bomb' | 'bullet' | 'unknown';
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
  targetId?: string;
  createdAt: number;
  payload?: Record<string, unknown>;
};

export type ChainRoomData = {
  gameManagerAddress: string;
  stakeTokenAddress: string;
  stakeAmount: string;
  itemRecorderAddress?: string;
  killRecorderAddress?: string;
  positionRecorderAddress?: string;
  livePredictionMarketAddress?: string;
  staticPredictionMarketAddress?: string;
  players?: string[];
};

export type KillEvent = {
  roomCode: string;
  attackerId: string;
  attackerName: string;
  attackerWallet?: string;
  victimId: string;
  victimName: string;
  victimWallet?: string;
  weaponType: string;
  healthDepleted: number;
  killed: boolean;
  timestamp: number;
};

export type RoomState = {
  code: string;
  hostPlayerId: string;
  maxPlayers: number;
  status: 'lobby' | 'in-progress' | 'finished';
  players: PlayerState[];
  spectators: number;
  lastUpdatedAt: number;
  chain?: ChainRoomData;
  gameStartedAt?: number;
  gameDurationSeconds?: number;
};
