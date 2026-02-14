export const GAME_FACTORY_ABI = [
  'event GameCreated(string gameId, address gameAddress)',
  'function createGame(uint256 playerCap, address stakeToken, uint256 stakeAmount) returns (address)'
] as const;

export const GAME_MANAGER_ABI = [
  'function gameId() view returns (string)',
  'function gameState() view returns (uint8)',
  'function stakeToken() view returns (address)',
  'function getPlayers() view returns (address[])',
  'function startGame()',
  'function endGame(address winner, address mostDeaths)',
  'function setContracts(address itemRecorder,address killRecorder,address positionRecorder,address livePredictionMarket,address staticPredictionMarket)'
] as const;
