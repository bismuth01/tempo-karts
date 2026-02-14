import { ethers } from 'ethers';

export type ChainConfig = {
  enabled: boolean;
  reason: string;
  rpcUrl: string | null;
  chainId: number;
  ownerPrivateKey: string | null;
  ownerAddress: string | null;
  gameFactoryAddress: string | null;
  stakeTokenAddress: string | null;
  stakeAmountWei: bigint | null;
  defaultPlayerCap: number;
};

function parseNumber(input: string | undefined, fallback: number): number {
  if (!input) {
    return fallback;
  }

  const normalized = input.trim().toLowerCase();
  const value = normalized.startsWith('0x')
    ? Number.parseInt(normalized, 16)
    : Number.parseInt(normalized, 10);

  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function parseBigIntValue(input?: string): bigint | null {
  if (!input) {
    return null;
  }

  try {
    const parsed = BigInt(input.trim());
    if (parsed <= 0n) {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}

function parseAddress(input?: string): string | null {
  if (!input) {
    return null;
  }

  try {
    return ethers.getAddress(input.trim());
  } catch (_error) {
    return null;
  }
}

function parseOwnerAddress(privateKey?: string): string | null {
  if (!privateKey) {
    return null;
  }

  try {
    return ethers.getAddress(new ethers.Wallet(privateKey.trim()).address);
  } catch (_error) {
    return null;
  }
}

export function loadChainConfig(env = process.env): ChainConfig {
  const rpcUrl = env.TEMPO_RPC_URL?.trim() || null;
  const chainId = parseNumber(env.CHAIN_ID, 42431);
  const ownerPrivateKey = env.OWNER_PRIVATE_KEY?.trim() || null;
  const ownerAddress = parseOwnerAddress(ownerPrivateKey ?? undefined);
  const gameFactoryAddress = parseAddress(env.GAME_FACTORY_ADDRESS);
  const stakeTokenAddress = parseAddress(env.STAKE_TOKEN_ADDRESS);
  const stakeAmountWei = parseBigIntValue(env.STAKE_AMOUNT_WEI);
  const defaultPlayerCap = Math.min(8, Math.max(2, parseNumber(env.DEFAULT_PLAYER_CAP, 4)));

  const missing: string[] = [];
  if (!rpcUrl) missing.push('TEMPO_RPC_URL');
  if (!ownerPrivateKey || !ownerAddress) missing.push('OWNER_PRIVATE_KEY');
  if (!gameFactoryAddress) missing.push('GAME_FACTORY_ADDRESS');
  if (!stakeTokenAddress) missing.push('STAKE_TOKEN_ADDRESS');
  if (!stakeAmountWei) missing.push('STAKE_AMOUNT_WEI');

  return {
    enabled: missing.length === 0,
    reason: missing.length > 0 ? `Missing/invalid chain env: ${missing.join(', ')}` : 'Ready',
    rpcUrl,
    chainId,
    ownerPrivateKey,
    ownerAddress,
    gameFactoryAddress,
    stakeTokenAddress,
    stakeAmountWei,
    defaultPlayerCap
  };
}
