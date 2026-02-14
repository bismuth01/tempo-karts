/**
 * RecorderService – records gameplay events on-chain during a running game.
 *
 * - ItemRecorder.addEvent() on item use
 * - KillRecorder.addEvent() on damage / kill
 * - PositionRecorder.addRecord() every ~1 second with all player positions
 */
import {
    createPublicClient,
    createWalletClient,
    http,
    type Address,
    type Abi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { tempoChain, TEMPO_RPC_URL, BACKEND_PRIVATE_KEY } from './config.js';
import {
    ItemRecorderArtifact,
    KillRecorderArtifact,
    PositionRecorderArtifact,
} from './artifacts.js';
import type { AttackEvent, ItemEvent, PlayerState } from '../types.js';

// Solidity Item enum: 0 = Bullets, 1 = Boost
const weaponToItemEnum: Record<string, number> = {
    bullet: 0,
    bullets: 0,
    rocket: 0,
    bomb: 0,
    unknown: 0,
    boost: 1,
};

const log = (msg: string, data?: Record<string, unknown>) =>
    console.log(`[RecorderService] ${msg}`, data ? JSON.stringify(data) : '');

export type RecorderAddresses = {
    itemRecorderAddress: Address;
    killRecorderAddress: Address;
    positionRecorderAddress: Address;
};

export class RecorderService {
    private walletClient;
    private publicClient;
    private account;

    private positionInterval: ReturnType<typeof setInterval> | null = null;
    private getPlayersSnapshot: (() => PlayerState[]) | null = null;
    private addresses: RecorderAddresses | null = null;

    /** Queue for tx submissions to avoid nonce collisions */
    private txQueue: Array<() => Promise<void>> = [];
    private processing = false;

    /** Common params injected into every writeContract call */
    private get txDefaults() {
        return { chain: tempoChain, account: this.account } as const;
    }

    constructor() {
        if (!BACKEND_PRIVATE_KEY) {
            throw new Error('BACKEND_PRIVATE_KEY not set');
        }

        this.account = privateKeyToAccount(BACKEND_PRIVATE_KEY as `0x${string}`);

        this.publicClient = createPublicClient({
            chain: tempoChain,
            transport: http(TEMPO_RPC_URL),
        });

        this.walletClient = createWalletClient({
            chain: tempoChain,
            transport: http(TEMPO_RPC_URL),
            account: this.account,
        });
    }

    /** Start periodic position recording.  Call this once when the game starts. */
    start(
        addresses: RecorderAddresses,
        getPlayersSnapshot: () => PlayerState[],
    ) {
        this.addresses = addresses;
        this.getPlayersSnapshot = getPlayersSnapshot;

        // Record positions every 1 second
        this.positionInterval = setInterval(() => {
            this.recordPositions().catch((err) =>
                log('Position recording failed', { error: String(err) }),
            );
        }, 1000);

        log('Started position recording');
    }

    /** Stop periodic recording (call on game end). */
    stop() {
        if (this.positionInterval) {
            clearInterval(this.positionInterval);
            this.positionInterval = null;
        }
        this.getPlayersSnapshot = null;
        log('Stopped recording');
    }

    /** Record an item usage event (called on player:item socket event) */
    async recordItem(
        playerAddress: Address | undefined,
        itemType: string,
        direction: number,
    ): Promise<void> {
        if (!this.addresses?.itemRecorderAddress || !playerAddress) return;

        const itemEnum = weaponToItemEnum[itemType.toLowerCase()] ?? 0;

        this.enqueue(async () => {
            const hash = await this.walletClient.writeContract({
                ...this.txDefaults,
                address: this.addresses!.itemRecorderAddress,
                abi: ItemRecorderArtifact.abi as Abi,
                functionName: 'addEvent',
                args: [
                    {
                        player: playerAddress,
                        itemUsed: itemEnum,
                        direction: BigInt(Math.round(direction)),
                        usedTime: BigInt(Math.floor(Date.now() / 1000)),
                    },
                ],
            });

            await this.publicClient.waitForTransactionReceipt({ hash });
            log('Item recorded', { player: playerAddress, itemType, txHash: hash });
        });
    }

    /** Record a kill / damage event (called when damage or kill happens) */
    async recordKill(
        attackerAddress: Address | undefined,
        attackedAddress: Address | undefined,
        weaponType: string,
        healthDepleted: number,
        killed: boolean,
    ): Promise<void> {
        if (
            !this.addresses?.killRecorderAddress ||
            !attackerAddress ||
            !attackedAddress
        )
            return;

        const itemEnum = weaponToItemEnum[weaponType.toLowerCase()] ?? 0;

        this.enqueue(async () => {
            const hash = await this.walletClient.writeContract({
                ...this.txDefaults,
                address: this.addresses!.killRecorderAddress,
                abi: KillRecorderArtifact.abi as Abi,
                functionName: 'addEvent',
                args: [
                    {
                        attackingPlayer: attackerAddress,
                        attackedPlayer: attackedAddress,
                        itemUsed: itemEnum,
                        healthDepleted,
                        killed,
                    },
                ],
            });

            await this.publicClient.waitForTransactionReceipt({ hash });
            log(killed ? 'Kill recorded' : 'Damage recorded', {
                attacker: attackerAddress,
                attacked: attackedAddress,
                txHash: hash,
            });
        });
    }

    /** Record all player positions at the current tick */
    private async recordPositions(): Promise<void> {
        if (!this.addresses?.positionRecorderAddress || !this.getPlayersSnapshot)
            return;

        const players = this.getPlayersSnapshot();
        if (players.length === 0) return;

        const events = players
            .filter((p) => p.walletAddress)
            .map((p) => ({
                xPos: BigInt(Math.round(p.position.x)),
                yPos: BigInt(Math.round(p.position.y)),
                angle: BigInt(Math.round(((p.rotation % 360) + 360) % 360)),
                playerAddress: p.walletAddress as Address,
            }));

        if (events.length === 0) return;

        this.enqueue(async () => {
            const hash = await this.walletClient.writeContract({
                ...this.txDefaults,
                address: this.addresses!.positionRecorderAddress,
                abi: PositionRecorderArtifact.abi as Abi,
                functionName: 'addRecord',
                args: [events],
            });

            await this.publicClient.waitForTransactionReceipt({ hash });
            log('Positions recorded', { players: events.length, txHash: hash });
        });
    }

    /** Simple sequential queue to prevent nonce collisions */
    private enqueue(fn: () => Promise<void>) {
        this.txQueue.push(fn);
        if (!this.processing) {
            this.processQueue();
        }
    }

    private async processQueue() {
        this.processing = true;
        while (this.txQueue.length > 0) {
            const fn = this.txQueue.shift()!;
            try {
                await fn();
            } catch (err) {
                log('Queue item failed', { error: String(err) });
            }
        }
        this.processing = false;
    }
}
