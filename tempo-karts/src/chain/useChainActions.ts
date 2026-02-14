/**
 * React hook for all on-chain contract interactions.
 * Uses Privy's embedded wallet to sign and send transactions.
 */
import { useCallback, useRef } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import {
    createPublicClient,
    createWalletClient,
    custom,
    http,
    parseAbi,
    formatUnits,
    type PublicClient,
    type WalletClient,
    type Address,
} from 'viem';
import { tempoChain, TEMPO_RPC_URL } from './config';
import {
    TIP20_ABI,
    GAME_MANAGER_ABI,
    LIVE_PREDICTION_MARKET_ABI,
    STATIC_PREDICTION_MARKET_ABI,
} from './abis';

const tip20Abi = parseAbi(TIP20_ABI);
const gameManagerAbi = parseAbi(GAME_MANAGER_ABI);
const livePredictionMarketAbi = parseAbi(LIVE_PREDICTION_MARKET_ABI);
const staticPredictionMarketAbi = parseAbi(STATIC_PREDICTION_MARKET_ABI);

export type ChainActionResult = {
    success: boolean;
    txHash?: string;
    error?: string;
};

export function useChainActions() {
    const { ready, authenticated } = usePrivy();
    const { wallets } = useWallets();
    const publicClientRef = useRef<PublicClient | null>(null);

    const getPublicClient = useCallback((): PublicClient => {
        if (!publicClientRef.current) {
            publicClientRef.current = createPublicClient({
                chain: tempoChain,
                transport: http(TEMPO_RPC_URL),
            });
        }
        return publicClientRef.current;
    }, []);

    const getWalletClient = useCallback(async (): Promise<{ client: WalletClient; address: Address }> => {
        if (!ready || !authenticated) {
            throw new Error('Privy not ready or not authenticated');
        }

        const wallet = wallets.find((w) => w.walletClientType === 'privy') ?? wallets[0];
        if (!wallet) {
            throw new Error('No wallet available. Please connect your wallet first.');
        }

        try {
            await wallet.switchChain(tempoChain.id);
        } catch {
            // Chain switch may fail if not added; continue anyway
        }

        const provider = await wallet.getEthereumProvider();
        const client = createWalletClient({
            chain: tempoChain,
            transport: custom(provider),
        });

        const address = wallet.address as Address;
        return { client, address };
    }, [ready, authenticated, wallets]);

    /** Get TIP20 token balance */
    const getTokenBalance = useCallback(async (
        tokenAddress: Address,
        ownerAddress: Address,
    ): Promise<bigint> => {
        const pub = getPublicClient();
        return pub.readContract({
            address: tokenAddress,
            abi: tip20Abi,
            functionName: 'balanceOf',
            args: [ownerAddress],
        });
    }, [getPublicClient]);

    /** Approve TIP20 spending for a spender */
    const approveToken = useCallback(async (
        tokenAddress: Address,
        spender: Address,
        amount: bigint,
    ): Promise<ChainActionResult> => {
        try {
            const { client, address } = await getWalletClient();
            const pub = getPublicClient();

            // Check current allowance first
            const currentAllowance = await pub.readContract({
                address: tokenAddress,
                abi: tip20Abi,
                functionName: 'allowance',
                args: [address, spender],
            });

            if (currentAllowance >= amount) {
                return { success: true };
            }

            const hash = await client.writeContract({
                address: tokenAddress,
                abi: tip20Abi,
                functionName: 'approve',
                args: [spender, amount],
                account: address,
                chain: tempoChain,
            });

            await pub.waitForTransactionReceipt({ hash });
            return { success: true, txHash: hash };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Approval failed' };
        }
    }, [getWalletClient, getPublicClient]);

    /** Register as a player on GameManager (requires prior TIP20 approval) */
    const registerPlayer = useCallback(async (
        gameManagerAddress: Address,
    ): Promise<ChainActionResult> => {
        try {
            const { client, address } = await getWalletClient();
            const pub = getPublicClient();

            const hash = await client.writeContract({
                address: gameManagerAddress,
                abi: gameManagerAbi,
                functionName: 'registerPlayer',
                account: address,
                chain: tempoChain,
            });

            await pub.waitForTransactionReceipt({ hash });
            return { success: true, txHash: hash };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Registration failed' };
        }
    }, [getWalletClient, getPublicClient]);

    /** Deregister from a game and reclaim stake */
    const deregisterPlayer = useCallback(async (
        gameManagerAddress: Address,
    ): Promise<ChainActionResult> => {
        try {
            const { client, address } = await getWalletClient();
            const pub = getPublicClient();

            const hash = await client.writeContract({
                address: gameManagerAddress,
                abi: gameManagerAbi,
                functionName: 'deregisterPlayer',
                account: address,
                chain: tempoChain,
            });

            await pub.waitForTransactionReceipt({ hash });
            return { success: true, txHash: hash };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Deregistration failed' };
        }
    }, [getWalletClient, getPublicClient]);

    /** Approve + Register in one flow */
    const approveAndRegister = useCallback(async (
        stakeTokenAddress: Address,
        gameManagerAddress: Address,
        stakeAmount: bigint,
    ): Promise<ChainActionResult> => {
        const approveResult = await approveToken(stakeTokenAddress, gameManagerAddress, stakeAmount);
        if (!approveResult.success) {
            return { success: false, error: `Approval failed: ${approveResult.error}` };
        }

        return registerPlayer(gameManagerAddress);
    }, [approveToken, registerPlayer]);

    /** Place a live prediction market bet (approve + putBet) */
    const placeLiveBet = useCallback(async (
        marketAddress: Address,
        tokenAddress: Address,
        marketType: number,       // 0 = Attacker, 1 = Attacked
        playerChoice: Address,
        amount: bigint,
    ): Promise<ChainActionResult> => {
        try {
            // Approve the market contract to spend tokens
            const approveResult = await approveToken(tokenAddress, marketAddress, amount);
            if (!approveResult.success) {
                return { success: false, error: `Approval failed: ${approveResult.error}` };
            }

            const { client, address } = await getWalletClient();
            const pub = getPublicClient();

            const hash = await client.writeContract({
                address: marketAddress,
                abi: livePredictionMarketAbi,
                functionName: 'putBet',
                args: [marketType, playerChoice, amount],
                account: address,
                chain: tempoChain,
            });

            await pub.waitForTransactionReceipt({ hash });
            return { success: true, txHash: hash };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Bet failed' };
        }
    }, [approveToken, getWalletClient, getPublicClient]);

    /** Place a static prediction market bet (approve + putBet) */
    const placeStaticBet = useCallback(async (
        marketAddress: Address,
        tokenAddress: Address,
        marketType: number,       // 0 = Winner, 1 = MostDeaths
        playerChoice: Address,
        amount: bigint,
    ): Promise<ChainActionResult> => {
        try {
            const approveResult = await approveToken(tokenAddress, marketAddress, amount);
            if (!approveResult.success) {
                return { success: false, error: `Approval failed: ${approveResult.error}` };
            }

            const { client, address } = await getWalletClient();
            const pub = getPublicClient();

            const hash = await client.writeContract({
                address: marketAddress,
                abi: staticPredictionMarketAbi,
                functionName: 'putBet',
                args: [marketType, playerChoice, amount],
                account: address,
                chain: tempoChain,
            });

            await pub.waitForTransactionReceipt({ hash });
            return { success: true, txHash: hash };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Bet failed' };
        }
    }, [approveToken, getWalletClient, getPublicClient]);

    /** Read game manager info */
    const getGameInfo = useCallback(async (gameManagerAddress: Address) => {
        const pub = getPublicClient();

        const [gameState, stakeAmount, totalStake, playerCap, playerNumber, stakeToken] = await Promise.all([
            pub.readContract({ address: gameManagerAddress, abi: gameManagerAbi, functionName: 'gameState' }),
            pub.readContract({ address: gameManagerAddress, abi: gameManagerAbi, functionName: 'stakeAmount' }),
            pub.readContract({ address: gameManagerAddress, abi: gameManagerAbi, functionName: 'totalStake' }),
            pub.readContract({ address: gameManagerAddress, abi: gameManagerAbi, functionName: 'playerCap' }),
            pub.readContract({ address: gameManagerAddress, abi: gameManagerAbi, functionName: 'playerNumber' }),
            pub.readContract({ address: gameManagerAddress, abi: gameManagerAbi, functionName: 'stakeToken' }),
        ]);

        return {
            gameState: Number(gameState),
            stakeAmount,
            totalStake,
            playerCap: Number(playerCap),
            playerNumber: Number(playerNumber),
            stakeToken: stakeToken as Address,
        };
    }, [getPublicClient]);

    /** Check if player is registered on-chain */
    const isPlayerRegistered = useCallback(async (
        gameManagerAddress: Address,
        playerAddress: Address,
    ): Promise<boolean> => {
        const pub = getPublicClient();
        return pub.readContract({
            address: gameManagerAddress,
            abi: gameManagerAbi,
            functionName: 'registeredPlayers',
            args: [playerAddress],
        });
    }, [getPublicClient]);

    /** Helper to format token amounts for display */
    const formatTokenAmount = useCallback((amount: bigint, decimals = 18): string => {
        return formatUnits(amount, decimals);
    }, []);

    return {
        ready: ready && authenticated,
        getPublicClient,
        getTokenBalance,
        approveToken,
        registerPlayer,
        deregisterPlayer,
        approveAndRegister,
        placeLiveBet,
        placeStaticBet,
        getGameInfo,
        isPlayerRegistered,
        formatTokenAmount,
    };
}
