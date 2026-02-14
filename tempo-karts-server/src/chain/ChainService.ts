/**
 * ChainService – full game lifecycle on-chain via the backend wallet.
 *
 * Flow:
 *   1. createGame() → calls GameFactory.createGame() → returns GameManager address
 *   2. (players register on-chain from their own wallets via frontend)
 *   3. startGame() → calls GameManager.startGame()
 *   4. deploySubContracts() → deploys all 5 sub-contracts
 *   5. setContracts() → links sub-contracts in GameManager
 *   6. (game runs: RecorderService records events)
 *   7. endGame() → calls GameManager.endGame(winner, mostDeaths)
 */
import {
    createPublicClient,
    createWalletClient,
    decodeAbiParameters,
    http,
    type Address,
    type PublicClient,
    type WalletClient,
    type Abi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    tempoChain,
    TEMPO_RPC_URL,
    BACKEND_PRIVATE_KEY,
    GAME_FACTORY_ADDRESS,
    STAKE_TOKEN_ADDRESS,
    DEFAULT_STAKE_AMOUNT,
    DEFAULT_PLAYER_CAP,
} from './config.js';
import {
    GameFactoryArtifact,
    GameManagerArtifact,
    ItemRecorderArtifact,
    KillRecorderArtifact,
    PositionRecorderArtifact,
    LivePredictionMarketArtifact,
    StaticPredictionMarketArtifact,
} from './artifacts.js';

export type GameChainState = {
    gameManagerAddress: Address;
    itemRecorderAddress?: Address;
    killRecorderAddress?: Address;
    positionRecorderAddress?: Address;
    livePredictionMarketAddress?: Address;
    staticPredictionMarketAddress?: Address;
    stakeTokenAddress: Address;
    stakeAmount: string;
    players: Address[];
};

const log = (msg: string, data?: Record<string, unknown>) =>
    console.log(`[ChainService] ${msg}`, data ? JSON.stringify(data) : '');

export class ChainService {
    private publicClient: PublicClient;
    private walletClient: WalletClient;
    private account: ReturnType<typeof privateKeyToAccount>;
    private factoryAddress: Address;

    /** Common params injected into every writeContract / deployContract call */
    private get txDefaults() {
        return { chain: tempoChain, account: this.account } as const;
    }

    constructor() {
        if (!BACKEND_PRIVATE_KEY) {
            throw new Error('BACKEND_PRIVATE_KEY not set – chain features disabled');
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

        this.factoryAddress = GAME_FACTORY_ADDRESS as Address;
        log('Initialized', {
            wallet: this.account.address,
            factory: this.factoryAddress,
        });
    }

    get ownerAddress(): Address {
        return this.account.address;
    }

    /** Step 1 – Call GameFactory.createGame(..) to deploy a new GameManager */
    async createGame(
        playerCap = DEFAULT_PLAYER_CAP,
        stakeToken = STAKE_TOKEN_ADDRESS as Address,
        stakeAmount = BigInt(DEFAULT_STAKE_AMOUNT),
    ): Promise<{ gameManagerAddress: Address }> {
        log('createGame', {
            playerCap,
            stakeToken,
            stakeAmount: stakeAmount.toString(),
        });

        const hash = await this.walletClient.writeContract({
            ...this.txDefaults,
            address: this.factoryAddress,
            abi: GameFactoryArtifact.abi as Abi,
            functionName: 'createGame',
            args: [BigInt(playerCap), stakeToken, stakeAmount],
        });

        const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

        // Parse the GameCreated event to find the new GameManager address
        const gameCreatedEvent = receipt.logs.find(
            (l) => l.address.toLowerCase() === this.factoryAddress.toLowerCase(),
        );

        if (!gameCreatedEvent) {
            throw new Error('Failed to parse GameCreated event from receipt');
        }

        // GameCreated(string gameId, address gameAddress)
        // ABI-decode the non-indexed event data to get the address
        const [_gameId, gameManagerAddress] = decodeAbiParameters(
            [{ type: 'string', name: 'gameId' }, { type: 'address', name: 'gameAddress' }],
            gameCreatedEvent.data,
        );

        log('Game created', { gameManagerAddress, txHash: hash });
        return { gameManagerAddress: gameManagerAddress as Address };
    }

    /** Step 3 – Call GameManager.startGame() */
    async startGame(gameManagerAddress: Address): Promise<void> {
        log('startGame', { gameManagerAddress });

        const hash = await this.walletClient.writeContract({
            ...this.txDefaults,
            address: gameManagerAddress,
            abi: GameManagerArtifact.abi as Abi,
            functionName: 'startGame',
            args: [],
        });

        await this.publicClient.waitForTransactionReceipt({ hash });
        log('Game started', { txHash: hash });
    }

    /** Step 4 – Deploy all sub-contracts and return their addresses */
    async deploySubContracts(
        gameManagerAddress: Address,
        stakeToken: Address,
        players: Address[],
    ): Promise<{
        itemRecorder: Address;
        killRecorder: Address;
        positionRecorder: Address;
        livePredictionMarket: Address;
        staticPredictionMarket: Address;
    }> {
        log('Deploying sub-contracts...', { gameManagerAddress, players });

        const owner = this.account.address;
        const d = this.txDefaults;

        // Deploy ItemRecorder(owner, gameManager)
        const itemRecorderHash = await this.walletClient.deployContract({
            ...d,
            abi: ItemRecorderArtifact.abi as Abi,
            bytecode: ItemRecorderArtifact.bytecode,
            args: [owner, gameManagerAddress],
        });
        const itemRecorderReceipt = await this.publicClient.waitForTransactionReceipt({ hash: itemRecorderHash });
        const itemRecorder = itemRecorderReceipt.contractAddress!;
        log('ItemRecorder deployed', { address: itemRecorder });

        // Deploy KillRecorder(owner, gameManager)
        const killRecorderHash = await this.walletClient.deployContract({
            ...d,
            abi: KillRecorderArtifact.abi as Abi,
            bytecode: KillRecorderArtifact.bytecode,
            args: [owner, gameManagerAddress],
        });
        const killRecorderReceipt = await this.publicClient.waitForTransactionReceipt({ hash: killRecorderHash });
        const killRecorder = killRecorderReceipt.contractAddress!;
        log('KillRecorder deployed', { address: killRecorder });

        // Deploy PositionRecorder(owner, gameManager)
        const positionRecorderHash = await this.walletClient.deployContract({
            ...d,
            abi: PositionRecorderArtifact.abi as Abi,
            bytecode: PositionRecorderArtifact.bytecode,
            args: [owner, gameManagerAddress],
        });
        const positionRecorderReceipt = await this.publicClient.waitForTransactionReceipt({ hash: positionRecorderHash });
        const positionRecorder = positionRecorderReceipt.contractAddress!;
        log('PositionRecorder deployed', { address: positionRecorder });

        // Deploy LivePredictionMarket(marketToken, killRecorder, gameManager, players[])
        const livePredictionMarketHash = await this.walletClient.deployContract({
            ...d,
            abi: LivePredictionMarketArtifact.abi as Abi,
            bytecode: LivePredictionMarketArtifact.bytecode,
            args: [stakeToken, killRecorder, gameManagerAddress, players],
        });
        const livePredictionMarketReceipt = await this.publicClient.waitForTransactionReceipt({ hash: livePredictionMarketHash });
        const livePredictionMarket = livePredictionMarketReceipt.contractAddress!;
        log('LivePredictionMarket deployed', { address: livePredictionMarket });

        // Deploy StaticPredictionMarket(marketToken, gameManager, players[])
        const staticPredictionMarketHash = await this.walletClient.deployContract({
            ...d,
            abi: StaticPredictionMarketArtifact.abi as Abi,
            bytecode: StaticPredictionMarketArtifact.bytecode,
            args: [stakeToken, gameManagerAddress, players],
        });
        const staticPredictionMarketReceipt = await this.publicClient.waitForTransactionReceipt({ hash: staticPredictionMarketHash });
        const staticPredictionMarket = staticPredictionMarketReceipt.contractAddress!;
        log('StaticPredictionMarket deployed', { address: staticPredictionMarket });

        return {
            itemRecorder,
            killRecorder,
            positionRecorder,
            livePredictionMarket,
            staticPredictionMarket,
        };
    }

    /** Step 5 – Call GameManager.setContracts() to link sub-contracts */
    async setContracts(
        gameManagerAddress: Address,
        itemRecorder: Address,
        killRecorder: Address,
        positionRecorder: Address,
        livePredictionMarket: Address,
        staticPredictionMarket: Address,
    ): Promise<void> {
        log('setContracts', { gameManagerAddress });

        const hash = await this.walletClient.writeContract({
            ...this.txDefaults,
            address: gameManagerAddress,
            abi: GameManagerArtifact.abi as Abi,
            functionName: 'setContracts',
            args: [
                itemRecorder,
                killRecorder,
                positionRecorder,
                livePredictionMarket,
                staticPredictionMarket,
            ],
        });

        await this.publicClient.waitForTransactionReceipt({ hash });
        log('Contracts set', { txHash: hash });
    }

    /** Steps 3+4+5 in one call – start game, deploy sub-contracts, link them */
    async startAndInitialize(
        gameManagerAddress: Address,
        stakeToken: Address,
        players: Address[],
    ): Promise<GameChainState> {
        await this.startGame(gameManagerAddress);

        const subs = await this.deploySubContracts(
            gameManagerAddress,
            stakeToken,
            players,
        );

        await this.setContracts(
            gameManagerAddress,
            subs.itemRecorder,
            subs.killRecorder,
            subs.positionRecorder,
            subs.livePredictionMarket,
            subs.staticPredictionMarket,
        );

        return {
            gameManagerAddress,
            ...subs,
            itemRecorderAddress: subs.itemRecorder,
            killRecorderAddress: subs.killRecorder,
            positionRecorderAddress: subs.positionRecorder,
            livePredictionMarketAddress: subs.livePredictionMarket,
            staticPredictionMarketAddress: subs.staticPredictionMarket,
            stakeTokenAddress: stakeToken,
            stakeAmount: DEFAULT_STAKE_AMOUNT,
            players,
        };
    }

    /** Step 7 – Call GameManager.endGame(winner, mostDeaths) */
    async endGame(
        gameManagerAddress: Address,
        winner: Address,
        mostDeaths: Address,
    ): Promise<void> {
        log('endGame', { gameManagerAddress, winner, mostDeaths });

        const hash = await this.walletClient.writeContract({
            ...this.txDefaults,
            address: gameManagerAddress,
            abi: GameManagerArtifact.abi as Abi,
            functionName: 'endGame',
            args: [winner, mostDeaths],
        });

        await this.publicClient.waitForTransactionReceipt({ hash });
        log('Game ended', { txHash: hash });
    }

    /** Read the list of registered players from GameManager */
    async getRegisteredPlayers(gameManagerAddress: Address): Promise<Address[]> {
        const players = await this.publicClient.readContract({
            address: gameManagerAddress,
            abi: GameManagerArtifact.abi as Abi,
            functionName: 'getPlayers',
        });
        return players as Address[];
    }
}
