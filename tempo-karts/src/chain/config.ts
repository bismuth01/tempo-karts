import { defineChain } from 'viem';

export const TEMPO_RPC_URL = process.env.NEXT_PUBLIC_TEMPO_RPC_URL ?? 'https://rpc.moderato.tempo.xyz';
export const TEMPO_CHAIN_ID = Number(process.env.NEXT_PUBLIC_TEMPO_CHAIN_ID ?? 62320);

export const tempoChain = defineChain({
    id: TEMPO_CHAIN_ID,
    name: 'Tempo Moderato',
    nativeCurrency: { name: 'TEMPO', symbol: 'TEMPO', decimals: 18 },
    rpcUrls: {
        default: { http: [TEMPO_RPC_URL] },
    },
    blockExplorers: {
        default: { name: 'Tempo Explorer', url: 'https://explorer.moderato.tempo.xyz' },
    },
});

/** Addresses set via environment variables or passed from the server room state */
export const GAME_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_GAME_FACTORY_ADDRESS as `0x${string}` | undefined;
export const STAKE_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_STAKE_TOKEN_ADDRESS as `0x${string}` | undefined;
export const DEFAULT_STAKE_AMOUNT = BigInt(process.env.NEXT_PUBLIC_STAKE_AMOUNT ?? '1000000000000000000'); // 1 token (18 decimals)
