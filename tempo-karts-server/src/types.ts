export type Role = 'player' | 'spectator';

export type Vec2 = {
  x: number;
  y: number;
};

export type WeaponType = 'rocket' | 'bomb' | 'bullet';

export type RoomOnChainContracts = {
  itemRecorder: string;
  killRecorder: string;
  positionRecorder: string;
  livePredictionMarket: string;
  staticPredictionMarket: string;
};

export type RoomOnChainState = {
  chainId: number;
  gameId: string;
  gameManagerAddress: string;
  createTxHash: string;
  startTxHash: string | null;
  contracts: RoomOnChainContracts | null;
};

export type MatchEndReason = 'time_elapsed' | 'manual' | 'server_error';

export type MatchLeaderboardEntry = {
  playerId: string;
  name: string;
  walletAddress: string | null;
  kills: number;
  deaths: number;
};

export type RoomMatchState = {
  durationSeconds: number;
  startedAt: number | null;
  endsAt: number | null;
  remainingSeconds: number;
  finishedAt: number | null;
  winnerPlayerId: string | null;
  winnerWalletAddress: string | null;
  mostDeathsPlayerId: string | null;
  mostDeathsWalletAddress: string | null;
  endReason: MatchEndReason | null;
  payoutTxHash: string | null;
  payoutError: string | null;
  leaderboard: MatchLeaderboardEntry[];
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
  onChain: RoomOnChainState | null;
  match: RoomMatchState;
  players: PlayerState[];
  crateSlots: CrateSlotState[];
  spectators: number;
  lastUpdatedAt: number;
};
