/** Human-readable ABIs for viem — derived from Solidity contract sources */

export const TIP20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
    'function transfer(address to, uint256 amount) external returns (bool)',
    'function transferFrom(address from, address to, uint256 amount) external returns (bool)',
    'function decimals() external view returns (uint8)',
    'function symbol() external view returns (string)',
] as const;

export const GAME_FACTORY_ABI = [
    'function createGame(uint256 playerCap, address stakeToken, uint256 stakeAmount) external returns (address)',
    'function games(string gameId) external view returns (address)',
    'function owner() external view returns (address)',
    'event GameCreated(string gameId, address gameAddress)',
] as const;

export const GAME_MANAGER_ABI = [
    'function registerPlayer() external',
    'function deregisterPlayer() external',
    'function startGame() external',
    'function setContracts(address _itemRecorder, address _killRecorder, address _positionRecorder, address _livePredictionMarket, address _staticPredictionMarket) external',
    'function endGame(address winner, address mostDeaths) external',
    'function getPlayers() external view returns (address[])',
    'function gameId() external view returns (string)',
    'function gameState() external view returns (uint8)',
    'function playerCap() external view returns (uint256)',
    'function playerNumber() external view returns (uint256)',
    'function totalStake() external view returns (uint256)',
    'function stakeAmount() external view returns (uint256)',
    'function stakeToken() external view returns (address)',
    'function registeredPlayers(address player) external view returns (bool)',
    'function owner() external view returns (address)',
    'event GameStarted(string gameId, uint256 startTime)',
    'event GameEnded(string gameId, uint256 endTime)',
    'event RewardsDistributed(string gameId, address winner, uint256 amount)',
    'event PlayerJoined(string gameId, address playerAddress)',
    'event PlayerLeft(string gameId, address playerAddress)',
    'event ContractsInitialized(string gameId, address itemRecorder, address killRecorder, address positionRecorder, address livePredictionMarket, address staticPredictionMarket)',
] as const;

export const ITEM_RECORDER_ABI = [
    'function addEvent((address player, uint8 itemUsed, uint256 direction, uint256 usedTime) _event) external',
    'function endGame() external',
    'function getEventCount() external view returns (uint256)',
    'function gameState() external view returns (uint8)',
] as const;

export const KILL_RECORDER_ABI = [
    'function addEvent((address attackingPlayer, address attackedPlayer, uint8 itemUsed, uint8 healthDepleted, bool killed) _event) external',
    'function setLivePredictionMarket(address _livePredictionMarket) external',
    'function endGame() external',
    'function killCount(address player) external view returns (uint256)',
    'function deathCount(address player) external view returns (uint256)',
    'function getRecordCount() external view returns (uint256)',
    'function gameState() external view returns (uint8)',
    'event KillRecorded(address indexed attacker, address indexed victim, uint8 itemUsed)',
    'event DamageRecorded(address indexed attacker, address indexed victim, uint8 healthDepleted)',
] as const;

export const POSITION_RECORDER_ABI = [
    'function addRecord((uint256 xPos, uint256 yPos, uint256 angle, address playerAddress)[] events) external',
    'function endGame() external',
    'function matchDuration() external view returns (uint256)',
    'function getPositionsAtTick(uint256 tick) external view returns ((uint256 xPos, uint256 yPos, uint256 angle, address playerAddress)[])',
    'function gameState() external view returns (uint8)',
    'event PositionsRecorded(uint256 indexed tick, uint256 playerCount)',
] as const;

export const LIVE_PREDICTION_MARKET_ABI = [
    'function putBet(uint8 marketType, address choice, uint256 amount) external',
    'function getCurrentRound() external view returns (uint256)',
    'function currentRound() external view returns (uint256)',
    'function gameState() external view returns (uint8)',
    'function registeredPlayers(address player) external view returns (bool)',
    'function marketToken() external view returns (address)',
    'event BetPlaced(address indexed bettor, uint8 marketType, address indexed choice, uint256 amount, uint256 round)',
    'event MarketResolved(uint8 marketType, address winningChoice, uint256 round)',
    'event WinningsDistributed(address indexed winner, uint256 amount, uint256 round)',
    'event BetRefunded(address indexed bettor, uint256 amount, uint256 round)',
] as const;

export const STATIC_PREDICTION_MARKET_ABI = [
    'function putBet(uint8 marketType, address choice, uint256 amount) external',
    'function gameState() external view returns (uint8)',
    'function registeredPlayers(address player) external view returns (bool)',
    'function marketToken() external view returns (address)',
    'event BetPlaced(address indexed bettor, uint8 marketType, address indexed choice, uint256 amount)',
    'event MarketResolved(uint8 marketType, address winningChoice)',
    'event WinningsDistributed(address indexed winner, uint256 amount)',
    'event BetRefunded(address indexed bettor, uint256 amount)',
] as const;
