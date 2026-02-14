import { Contract, ethers } from 'ethers';
import type { Provider, Signer } from 'ethers';

const GAME_MANAGER_ABI = [
    'function gameId() view returns (string)',
    'function gameState() view returns (uint8)',
    'function playerCap() view returns (uint256)',
    'function playerNumber() view returns (uint256)',
    'function totalStake() view returns (uint256)',
    'function stakeAmount() view returns (uint256)',
    'function stakeToken() view returns (address)',
    'function registeredPlayers(address) view returns (bool)',
    'function registerPlayer()',
    'function deregisterPlayer()',
    'function getPlayers() view returns (address[])'
] as const;

const TIP20_ABI = [
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address owner) view returns (uint256)'
] as const;

export type OnChainAction = 'snapshot' | 'register-player' | 'deregister-player';

export type OnChainActionPayload = {
    playerAddress?: string;
    gameManagerAddress?: string;
};

export type OnChainActionRequest = {
    action: OnChainAction;
    payload?: OnChainActionPayload;
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
};

export type OnChainContractConfig = {
    enabled: boolean;
    gameManagerAddress: string | null;
    expectedChainId: number | null;
    reason: string;
};

export type OnChainContractStatus = {
    configured: boolean;
    ready: boolean;
    walletAddress: string | null;
    gameManagerAddress: string | null;
    expectedChainId: number | null;
    reason: string;
};

export type OnChainGameState = 'NotStarted' | 'Running' | 'Ended' | 'Unknown';

export type OnChainGameSnapshot = {
    gameManagerAddress: string;
    gameId: string;
    gameState: OnChainGameState;
    playerCap: number;
    playerNumber: number;
    totalStake: string;
    stakeAmount: string;
    stakeTokenAddress: string;
    players: string[];
    isRegistered: boolean | null;
    playerAddress: string | null;
};

export type EnsurePlayerRegisteredResult = {
    alreadyRegistered: boolean;
    playerAddress: string;
    gameManagerAddress: string;
    gameId: string;
    gameState: OnChainGameState;
    stakeTokenAddress: string;
    stakeAmount: string;
    allowanceBefore: string;
    balanceBefore: string;
    approvalTxHash?: string;
    registerTxHash?: string;
};

export type DeregisterPlayerResult = {
    alreadyDeregistered: boolean;
    playerAddress: string;
    gameManagerAddress: string;
    deregisterTxHash?: string;
};

type OnChainRequestOptions = {
    gameManagerAddress?: string;
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function parseAddress(input?: string | null): string | null
{
    if (!input)
    {
        return null;
    }

    try
    {
        return ethers.getAddress(input.trim());
    }
    catch (_error)
    {
        return null;
    }
}

function parseChainId(input?: string): number | null
{
    if (!input)
    {
        return null;
    }

    const trimmed = input.trim().toLowerCase();
    const parsed = trimmed.startsWith('0x') ? Number.parseInt(trimmed, 16) : Number.parseInt(trimmed, 10);

    if (!Number.isFinite(parsed) || parsed <= 0)
    {
        return null;
    }

    return parsed;
}

function resolveGameManagerAddress(config: OnChainContractConfig, overrideAddress?: string): string
{
    const payloadAddress = parseAddress(overrideAddress);
    if (payloadAddress)
    {
        return payloadAddress;
    }

    if (config.gameManagerAddress)
    {
        return config.gameManagerAddress;
    }

    throw new Error('GameManager address missing for this room');
}

function mapGameState(value: bigint | number): OnChainGameState
{
    const normalized = typeof value === 'bigint' ? Number(value) : value;

    if (normalized === 0)
    {
        return 'NotStarted';
    }

    if (normalized === 1)
    {
        return 'Running';
    }

    if (normalized === 2)
    {
        return 'Ended';
    }

    return 'Unknown';
}

function toLowerAddress(value: string | null): string | null
{
    return value ? value.toLowerCase() : null;
}

function clampMessage(message: string, maxLength = 190): string
{
    const normalized = message.trim();
    if (normalized.length <= maxLength)
    {
        return normalized;
    }

    return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function cleanMessage(rawMessage: string): string
{
    let message = rawMessage.replace(/\s+/g, ' ').trim();
    const cutMarkers = [' invocation=', ' transaction=', ' code=', ' action=', ' data=', ' info=', ' value='];

    for (const marker of cutMarkers)
    {
        const markerIndex = message.indexOf(marker);
        if (markerIndex > 0)
        {
            message = message.slice(0, markerIndex).trim();
        }
    }

    return message;
}

function readRecordMessage(record: Record<string, unknown>, key: string): string | null
{
    const value = record[key];
    if (typeof value === 'string' && value.trim())
    {
        return value;
    }

    return null;
}

function getRawErrorMessage(error: unknown): string
{
    if (error instanceof Error && error.message)
    {
        return error.message;
    }

    if (typeof error === 'object' && error !== null)
    {
        const record = error as Record<string, unknown>;

        const direct = readRecordMessage(record, 'reason')
            ?? readRecordMessage(record, 'shortMessage')
            ?? readRecordMessage(record, 'message');

        if (direct)
        {
            return direct;
        }

        const nestedError = record.error;
        if (typeof nestedError === 'object' && nestedError !== null)
        {
            const nested = nestedError as Record<string, unknown>;
            const nestedMessage = readRecordMessage(nested, 'reason')
                ?? readRecordMessage(nested, 'shortMessage')
                ?? readRecordMessage(nested, 'message');

            if (nestedMessage)
            {
                return nestedMessage;
            }
        }

        const info = record.info;
        if (typeof info === 'object' && info !== null)
        {
            const infoRecord = info as Record<string, unknown>;
            const nestedInfoError = infoRecord.error;
            if (typeof nestedInfoError === 'object' && nestedInfoError !== null)
            {
                const nestedErrorRecord = nestedInfoError as Record<string, unknown>;
                const nestedErrorMessage = readRecordMessage(nestedErrorRecord, 'reason')
                    ?? readRecordMessage(nestedErrorRecord, 'shortMessage')
                    ?? readRecordMessage(nestedErrorRecord, 'message');

                if (nestedErrorMessage)
                {
                    return nestedErrorMessage;
                }
            }

            const infoMessage = readRecordMessage(infoRecord, 'error')
                ?? readRecordMessage(infoRecord, 'message');

            if (infoMessage)
            {
                return infoMessage;
            }
        }
    }

    return 'Contract action failed';
}

function normalizeReadableError(rawErrorMessage: string): string
{
    const message = cleanMessage(rawErrorMessage);
    const lowered = message.toLowerCase();

    if (
        lowered.includes('user rejected')
        || lowered.includes('action_rejected')
        || lowered.includes('rejected the request')
        || lowered.includes('user denied')
    )
    {
        return 'Wallet transaction was rejected.';
    }

    if (lowered.includes('insufficient stake token balance') || lowered.includes('insufficient balance'))
    {
        return 'Insufficient stake token balance for registration.';
    }

    if (lowered.includes('insufficient allowance'))
    {
        return 'Token allowance is too low. Approve stake amount and retry.';
    }

    if (lowered.includes('playercapreached') || lowered.includes('player cap reached') || lowered.includes('room is full'))
    {
        return 'Room is full on-chain.';
    }

    if (lowered.includes('gamenotinstate') || lowered.includes('registration closed') || lowered.includes('notstarted'))
    {
        return 'Registration is closed because the game has already started.';
    }

    if (lowered.includes('unsupported chain') || lowered.includes('wrong network') || lowered.includes('chain mismatch'))
    {
        return 'Wrong wallet network selected. Switch chain and retry.';
    }

    if (!message)
    {
        return 'Contract action failed';
    }

    return message;
}

export function getOnChainContractConfig(): OnChainContractConfig
{
    const gameManagerAddress = parseAddress(process.env.NEXT_PUBLIC_GAME_MANAGER_ADDRESS);
    const expectedChainId = parseChainId(process.env.NEXT_PUBLIC_CHAIN_ID ?? process.env.NEXT_PUBLIC_TEMPO_CHAIN_ID);

    return {
        enabled: true,
        gameManagerAddress,
        expectedChainId,
        reason: gameManagerAddress
            ? 'Configured'
            : 'Using room-scoped GameManager (no default configured)'
    };
}

export async function readOnChainGameSnapshot(
    provider: Provider,
    options?: {
        playerAddress?: string;
        gameManagerAddress?: string;
    }
): Promise<OnChainGameSnapshot>
{
    const config = getOnChainContractConfig();
    const gameManagerAddress = resolveGameManagerAddress(config, options?.gameManagerAddress);
    const gm = new Contract(gameManagerAddress, GAME_MANAGER_ABI, provider);

    const normalizedPlayerAddress = parseAddress(options?.playerAddress);

    const [
        gameId,
        gameStateRaw,
        playerCapRaw,
        playerNumberRaw,
        totalStakeRaw,
        stakeAmountRaw,
        stakeTokenAddressRaw,
        players
    ] = await Promise.all([
        gm.gameId() as Promise<string>,
        gm.gameState() as Promise<bigint>,
        gm.playerCap() as Promise<bigint>,
        gm.playerNumber() as Promise<bigint>,
        gm.totalStake() as Promise<bigint>,
        gm.stakeAmount() as Promise<bigint>,
        gm.stakeToken() as Promise<string>,
        gm.getPlayers() as Promise<string[]>
    ]);

    const normalizedStakeToken = parseAddress(stakeTokenAddressRaw) ?? ZERO_ADDRESS;
    let isRegistered: boolean | null = null;

    if (normalizedPlayerAddress)
    {
        isRegistered = await (gm.registeredPlayers(normalizedPlayerAddress) as Promise<boolean>);
    }

    return {
        gameManagerAddress,
        gameId,
        gameState: mapGameState(gameStateRaw),
        playerCap: Number(playerCapRaw),
        playerNumber: Number(playerNumberRaw),
        totalStake: totalStakeRaw.toString(),
        stakeAmount: stakeAmountRaw.toString(),
        stakeTokenAddress: normalizedStakeToken,
        players: players.map((address) => parseAddress(address) ?? address),
        isRegistered,
        playerAddress: normalizedPlayerAddress
    };
}

export async function ensurePlayerRegistered(
    signer: Signer,
    options?: OnChainRequestOptions
): Promise<EnsurePlayerRegisteredResult>
{
    const config = getOnChainContractConfig();
    const gameManagerAddress = resolveGameManagerAddress(config, options?.gameManagerAddress);
    const gm = new Contract(gameManagerAddress, GAME_MANAGER_ABI, signer);

    const playerAddress = parseAddress(await signer.getAddress());
    if (!playerAddress)
    {
        throw new Error('Wallet address is unavailable');
    }

    const [
        gameId,
        gameStateRaw,
        alreadyRegistered,
        stakeTokenAddressRaw,
        stakeAmountRaw
    ] = await Promise.all([
        gm.gameId() as Promise<string>,
        gm.gameState() as Promise<bigint>,
        gm.registeredPlayers(playerAddress) as Promise<boolean>,
        gm.stakeToken() as Promise<string>,
        gm.stakeAmount() as Promise<bigint>
    ]);

    const gameState = mapGameState(gameStateRaw);
    const stakeTokenAddress = parseAddress(stakeTokenAddressRaw);
    if (!stakeTokenAddress || stakeTokenAddress === ZERO_ADDRESS)
    {
        throw new Error('GameManager stake token is not configured');
    }

    const token = new Contract(stakeTokenAddress, TIP20_ABI, signer);

    const [allowanceBefore, balanceBefore] = await Promise.all([
        token.allowance(playerAddress, gameManagerAddress) as Promise<bigint>,
        token.balanceOf(playerAddress) as Promise<bigint>
    ]);

    if (alreadyRegistered)
    {
        return {
            alreadyRegistered: true,
            playerAddress,
            gameManagerAddress,
            gameId,
            gameState,
            stakeTokenAddress,
            stakeAmount: stakeAmountRaw.toString(),
            allowanceBefore: allowanceBefore.toString(),
            balanceBefore: balanceBefore.toString()
        };
    }

    if (gameState !== 'NotStarted')
    {
        throw new Error(`Registration closed: game state is ${gameState}`);
    }

    if (balanceBefore < stakeAmountRaw)
    {
        throw new Error(
            `Insufficient stake token balance: need ${stakeAmountRaw.toString()}, have ${balanceBefore.toString()}`
        );
    }

    let approvalTxHash: string | undefined;
    if (allowanceBefore < stakeAmountRaw)
    {
        const approvalTx = await token.approve(gameManagerAddress, stakeAmountRaw);
        approvalTxHash = approvalTx.hash;
        await approvalTx.wait();
    }

    const registerTx = await gm.registerPlayer();
    await registerTx.wait();

    return {
        alreadyRegistered: false,
        playerAddress,
        gameManagerAddress,
        gameId,
        gameState,
        stakeTokenAddress,
        stakeAmount: stakeAmountRaw.toString(),
        allowanceBefore: allowanceBefore.toString(),
        balanceBefore: balanceBefore.toString(),
        approvalTxHash,
        registerTxHash: registerTx.hash
    };
}

export async function deregisterPlayerIfRegistered(
    signer: Signer,
    options?: OnChainRequestOptions
): Promise<DeregisterPlayerResult>
{
    const config = getOnChainContractConfig();
    const gameManagerAddress = resolveGameManagerAddress(config, options?.gameManagerAddress);
    const gm = new Contract(gameManagerAddress, GAME_MANAGER_ABI, signer);

    const playerAddress = parseAddress(await signer.getAddress());
    if (!playerAddress)
    {
        throw new Error('Wallet address is unavailable');
    }

    const isRegistered = await (gm.registeredPlayers(playerAddress) as Promise<boolean>);
    if (!isRegistered)
    {
        return {
            alreadyDeregistered: true,
            playerAddress,
            gameManagerAddress
        };
    }

    const tx = await gm.deregisterPlayer();
    await tx.wait();

    return {
        alreadyDeregistered: false,
        playerAddress,
        gameManagerAddress,
        deregisterTxHash: tx.hash
    };
}

export function toReadableError(error: unknown): string
{
    const rawMessage = getRawErrorMessage(error);
    const normalized = normalizeReadableError(rawMessage);
    return clampMessage(normalized);
}

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean
{
    return toLowerAddress(a ?? null) === toLowerAddress(b ?? null);
}
