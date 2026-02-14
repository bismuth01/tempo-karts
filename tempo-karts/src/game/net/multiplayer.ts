import type { Socket } from 'socket.io-client';

export type Vec2 = {
    x: number;
    y: number;
};

export type PlayerState = {
    id: string;
    name: string;
    walletAddress?: string;
    position: Vec2;
    velocity: Vec2;
    rotation: number;
    hp: number;
    kills: number;
    deaths: number;
    updatedAt: number;
};

export type PredictionBetInfo = {
    bettor: string;
    marketType: number;
    playerChoice: string;
    amount: string;
    round?: number;
    ts: number;
};

export type PredictionOdds = {
    playerTotals: Record<string, string>;
    totalPool: string;
    round?: number;
};

export type PredictionMarketState = {
    liveAttacker: PredictionOdds;
    liveAttacked: PredictionOdds;
    staticWinner: PredictionOdds;
    staticMostDeaths: PredictionOdds;
    currentRound: number;
};

export type ChainRoomData = {
    chainGameId?: string;
    gameManagerAddress?: string;
    stakeTokenAddress?: string;
    stakeAmount?: string;
    livePredictionMarketAddress?: string;
    staticPredictionMarketAddress?: string;
    itemRecorderAddress?: string;
    killRecorderAddress?: string;
    positionRecorderAddress?: string;
};

export type KillEvent = {
    roomCode: string;
    attackerId: string;
    attackerName: string;
    victimId: string;
    victimName: string;
    weaponType: string;
    ts: number;
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
    hp?: number;
    ts?: number;
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
    'player:attack': (payload: {
        roomCode: string;
        playerId: string;
        weaponType: string;
        position: Vec2;
        direction: Vec2;
        ts?: number;
    }) => void;
    'player:item': (payload: {
        roomCode: string;
        playerId: string;
        kind: 'pickup' | 'use';
        itemType: string;
        targetId?: string;
        ts?: number;
    }) => void;
    'spectator:bet_placed': (payload: PredictionBetInfo) => void;
}

export interface ServerToClientEvents {
    'room:joined': (payload: { room: RoomState; role: 'player' | 'spectator'; player?: PlayerState; playerId?: string }) => void;
    'room:player_joined': (payload: { roomCode: string; player?: PlayerState; playerId?: string }) => void;
    'room:player_left': (payload: { roomCode: string; playerId: string }) => void;
    'room:position': (payload: PositionPayload) => void;
    'room:state': (payload: { room: RoomState; serverTime: number; tickRate: number }) => void;
    'room:game_started': (payload: { room: RoomState | null }) => void;
    'room:game_ended': (payload: { room: RoomState; winner?: string; mostDeaths?: string }) => void;
    'room:kill': (payload: KillEvent) => void;
    'room:prediction_update': (payload: PredictionMarketState) => void;
    'room:bet_placed': (payload: PredictionBetInfo) => void;
}

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type MultiplayerSession = {
    socket: GameSocket;
    roomCode: string;
    playerId: string;
    room: RoomState;
    role: 'player' | 'spectator';
};
