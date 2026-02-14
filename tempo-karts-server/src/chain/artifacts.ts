/**
 * Loads compiled Foundry artifacts (ABI + bytecode) for contract deployment.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONTRACTS_OUT_DIR } from './config.js';

type FoundryArtifact = {
    abi: unknown[];
    bytecode: { object: string };
};

function loadArtifact(contractName: string): FoundryArtifact {
    const dir = resolve(import.meta.dirname ?? process.cwd(), CONTRACTS_OUT_DIR);
    const filePath = resolve(dir, `${contractName}.sol`, `${contractName}.json`);
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as FoundryArtifact;
}

function getAbiAndBytecode(contractName: string) {
    const artifact = loadArtifact(contractName);
    const bytecode = artifact.bytecode.object.startsWith('0x')
        ? artifact.bytecode.object
        : `0x${artifact.bytecode.object}`;
    return { abi: artifact.abi, bytecode: bytecode as `0x${string}` };
}

/** Pre-load all needed contract artifacts */
export const GameFactoryArtifact = getAbiAndBytecode('GameFactory');
export const GameManagerArtifact = getAbiAndBytecode('GameManager');
export const ItemRecorderArtifact = getAbiAndBytecode('ItemRecorder');
export const KillRecorderArtifact = getAbiAndBytecode('KillRecorder');
export const PositionRecorderArtifact = getAbiAndBytecode('PositionRecorder');
export const LivePredictionMarketArtifact = getAbiAndBytecode('LivePredictionMarket');
export const StaticPredictionMarketArtifact = getAbiAndBytecode('StaticPredictionMarket');
