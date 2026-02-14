import { readFile } from 'node:fs/promises';
import { Contract, ContractFactory, ethers, JsonRpcProvider, Wallet } from 'ethers';
import type { InterfaceAbi } from 'ethers';
import type { RoomOnChainContracts } from '../types.js';
import { GAME_FACTORY_ABI, GAME_MANAGER_ABI } from './abis.js';
import type { ChainConfig } from './config.js';

type ContractArtifact = {
  abi: InterfaceAbi;
  bytecode: string;
};

type ArtifactJson = {
  abi?: InterfaceAbi;
  bytecode?: string | { object?: string };
};

export type ChainHealthStatus = {
  configured: boolean;
  reason: string;
  chainId: number;
  ownerAddress: string | null;
  factoryAddress: string | null;
  stakeTokenAddress: string | null;
  stakeAmountWei: string | null;
  defaultPlayerCap: number;
};

export type CreateGameOnChainResult = {
  gameId: string;
  gameManagerAddress: string;
  txHash: string;
  chainId: number;
  playerCap: number;
  stakeTokenAddress: string;
  stakeAmountWei: string;
};

export type StartGameOnChainResult = {
  startTxHash: string;
  setContractsTxHash: string;
  contracts: RoomOnChainContracts;
};

export type EndGameOnChainResult = {
  endGameTxHash: string;
};

const ROOT_ARTIFACT_DIR = new URL('../../../contracts/out/', import.meta.url);

export class ChainService {
  private readonly provider: JsonRpcProvider;
  private readonly signer: Wallet;
  private readonly factory: Contract;

  constructor(private readonly config: ChainConfig) {
    if (!config.enabled || !config.rpcUrl || !config.ownerPrivateKey || !config.gameFactoryAddress) {
      throw new Error(config.reason || 'Chain config is not ready');
    }

    this.provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
    this.signer = new Wallet(config.ownerPrivateKey, this.provider);
    this.factory = new Contract(config.gameFactoryAddress, GAME_FACTORY_ABI, this.signer);
  }

  getStatus(): ChainHealthStatus {
    return {
      configured: this.config.enabled,
      reason: this.config.reason,
      chainId: this.config.chainId,
      ownerAddress: this.config.ownerAddress,
      factoryAddress: this.config.gameFactoryAddress,
      stakeTokenAddress: this.config.stakeTokenAddress,
      stakeAmountWei: this.config.stakeAmountWei ? this.config.stakeAmountWei.toString() : null,
      defaultPlayerCap: this.config.defaultPlayerCap
    };
  }

  async createGameOnChain(maxPlayers?: number): Promise<CreateGameOnChainResult> {
    if (!this.config.stakeTokenAddress || !this.config.stakeAmountWei) {
      throw new Error('Chain stake configuration is missing');
    }

    const playerCap = this.normalizePlayerCap(maxPlayers);
    const tx = await this.factory.createGame(playerCap, this.config.stakeTokenAddress, this.config.stakeAmountWei);
    const receipt = await tx.wait();

    if (!receipt) {
      throw new Error('createGame transaction receipt is missing');
    }

    let gameId: string | null = null;
    let gameManagerAddress: string | null = null;

    for (const log of receipt.logs) {
      try {
        const parsed = this.factory.interface.parseLog(log);
        if (parsed?.name !== 'GameCreated') {
          continue;
        }

        gameId = String(parsed.args.gameId);
        gameManagerAddress = ethers.getAddress(String(parsed.args.gameAddress));
        break;
      } catch (_error) {
        continue;
      }
    }

    if (!gameId || !gameManagerAddress) {
      throw new Error('createGame succeeded but GameCreated event was not found');
    }

    return {
      gameId,
      gameManagerAddress,
      txHash: tx.hash,
      chainId: this.config.chainId,
      playerCap,
      stakeTokenAddress: this.config.stakeTokenAddress,
      stakeAmountWei: this.config.stakeAmountWei.toString()
    };
  }

  async startGameOnChain(gameManagerAddress: string): Promise<StartGameOnChainResult> {
    const gmAddress = ethers.getAddress(gameManagerAddress);
    const gm = new Contract(gmAddress, GAME_MANAGER_ABI, this.signer);

    const startTx = await gm.startGame();
    await startTx.wait();

    const playersRaw = await (gm.getPlayers() as Promise<string[]>);
    const players = playersRaw.map((address) => ethers.getAddress(address));
    const stakeToken = ethers.getAddress(await (gm.stakeToken() as Promise<string>));

    const itemRecorder = await this.deployContract('ItemRecorder', [this.signer.address, gmAddress]);
    const killRecorder = await this.deployContract('KillRecorder', [this.signer.address, gmAddress]);
    const positionRecorder = await this.deployContract('PositionRecorder', [this.signer.address, gmAddress]);
    const livePredictionMarket = await this.deployContract('LivePredictionMarket', [stakeToken, killRecorder, gmAddress, players]);
    const staticPredictionMarket = await this.deployContract('StaticPredictionMarket', [stakeToken, gmAddress, players]);

    const setContractsTx = await gm.setContracts(
      itemRecorder,
      killRecorder,
      positionRecorder,
      livePredictionMarket,
      staticPredictionMarket
    );
    await setContractsTx.wait();

    return {
      startTxHash: startTx.hash,
      setContractsTxHash: setContractsTx.hash,
      contracts: {
        itemRecorder,
        killRecorder,
        positionRecorder,
        livePredictionMarket,
        staticPredictionMarket
      }
    };
  }

  async endGameOnChain(
    gameManagerAddress: string,
    winnerWalletAddress: string,
    mostDeathsWalletAddress: string
  ): Promise<EndGameOnChainResult> {
    const gmAddress = ethers.getAddress(gameManagerAddress);
    const gm = new Contract(gmAddress, GAME_MANAGER_ABI, this.signer);

    const winner = ethers.getAddress(winnerWalletAddress);
    const mostDeaths = ethers.getAddress(mostDeathsWalletAddress);

    const endTx = await gm.endGame(winner, mostDeaths);
    await endTx.wait();

    return {
      endGameTxHash: endTx.hash
    };
  }

  private normalizePlayerCap(rawMaxPlayers?: number) {
    const source = typeof rawMaxPlayers === 'number' && Number.isFinite(rawMaxPlayers)
      ? rawMaxPlayers
      : this.config.defaultPlayerCap;

    return Math.min(8, Math.max(2, Math.round(source)));
  }

  private async deployContract(name: string, args: unknown[]): Promise<string> {
    const artifact = await this.loadArtifact(name);
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, this.signer);
    const deployed = await factory.deploy(...args);
    await deployed.waitForDeployment();
    return ethers.getAddress(await deployed.getAddress());
  }

  private async loadArtifact(name: string): Promise<ContractArtifact> {
    const artifactPath = new URL(`${name}.sol/${name}.json`, ROOT_ARTIFACT_DIR);

    let raw: string;
    try {
      raw = await readFile(artifactPath, 'utf8');
    } catch (_error) {
      throw new Error(`Missing artifact for ${name}. Run 'cd contracts && forge build' first`);
    }

    const parsed = JSON.parse(raw) as ArtifactJson;
    const abi = parsed.abi;
    const bytecodeRaw = typeof parsed.bytecode === 'string' ? parsed.bytecode : parsed.bytecode?.object;
    const bytecode = typeof bytecodeRaw === 'string' && bytecodeRaw.trim() ? bytecodeRaw.trim() : '';

    if (!abi || !bytecode || bytecode === '0x' || bytecode === '0x0') {
      throw new Error(`Invalid artifact for ${name}. Build contracts and verify bytecode output`);
    }

    return {
      abi,
      bytecode: bytecode.startsWith('0x') ? bytecode : `0x${bytecode}`
    };
  }
}
