/**
 * Backend chain configuration for Tempo testnet.
 * Uses a server-controlled private key to deploy sub-contracts and record events.
 */
import { defineChain } from 'viem';

export const TEMPO_RPC_URL = process.env.TEMPO_RPC_URL ?? 'https://rpc.moderato.tempo.xyz';
export const BACKEND_PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY ?? '';
export const GAME_FACTORY_ADDRESS = process.env.GAME_FACTORY_ADDRESS ?? '';
export const STAKE_TOKEN_ADDRESS = process.env.STAKE_TOKEN_ADDRESS ?? '';
export const DEFAULT_STAKE_AMOUNT = process.env.DEFAULT_STAKE_AMOUNT ?? '1000000000000000000'; // 1 token (18 decimals)
export const DEFAULT_PLAYER_CAP = Number(process.env.DEFAULT_PLAYER_CAP ?? '4');
export const CONTRACTS_OUT_DIR = process.env.CONTRACTS_OUT_DIR ?? '../../../contracts/out';

export const tempoChain = defineChain({
    id: Number(process.env.TEMPO_CHAIN_ID ?? 698),
    name: 'Tempo Moderato Testnet',
    nativeCurrency: { name: 'Tempo', symbol: 'TEMPO', decimals: 18 },
    rpcUrls: {
        default: { http: [TEMPO_RPC_URL] },
    },
    testnet: true,
});
