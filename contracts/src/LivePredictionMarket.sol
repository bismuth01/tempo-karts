// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "../lib/tempo-std/src/interfaces/ITIP20.sol";
import "./common.sol";

/// @title LivePredictionMarket
/// @notice Round-based live prediction markets resolved in realtime on each kill.
///         Two markets per round: "Who will kill next" (Attacker) and "Who will be killed next" (Attacked).
///         When a kill occurs, KillRecorder triggers resolution, winners split the pot, and a new round begins.
contract LivePredictionMarket {
    struct RoundData {
        uint256 totalAmount;
        address[] bettors;
        mapping(address => uint256) totalBetByBettor;
        mapping(address => mapping(address => uint256)) bets; // bettor => choice => amount
        bool resolved;
    }

    uint256 public currentRound;
    GameState public gameState;
    ITIP20 public marketToken;
    address public gameManagerAddress;
    address public killRecorderAddress;
    mapping(address => bool) public registeredPlayers;
    mapping(MarketType => mapping(uint256 => RoundData)) rounds;

    event BetPlaced(address indexed bettor, MarketType marketType, address indexed choice, uint256 amount, uint256 round);
    event MarketResolved(MarketType marketType, address winningChoice, uint256 round);
    event WinningsDistributed(address indexed winner, uint256 amount, uint256 round);
    event BetRefunded(address indexed bettor, uint256 amount, uint256 round);
    event GameEndedRefund(uint256 round);

    error GameNotRunning();
    error PlayerNotRegistered();
    error InvalidBetAmount();
    error OnlyKillRecorder();
    error OnlyGameManager();

    constructor(address _marketToken, address _killRecorder, address _gameManager, address[] memory _players) {
        marketToken = ITIP20(_marketToken);
        killRecorderAddress = _killRecorder;
        gameManagerAddress = _gameManager;
        gameState = GameState.Running;
        currentRound = 0;

        for (uint i = 0; i < _players.length; i++) {
            registeredPlayers[_players[i]] = true;
        }
    }

    modifier isKillRecorder() {
        if (msg.sender != killRecorderAddress) revert OnlyKillRecorder();
        _;
    }

    modifier isGameManager() {
        if (msg.sender != gameManagerAddress) revert OnlyGameManager();
        _;
    }

    /// @notice Place a bet on a player for the current round.
    /// @param marketType Attacker (who kills next) or Attacked (who dies next)
    /// @param choice The player address being bet on
    /// @param amount The TIP20 token amount to bet
    function putBet(MarketType marketType, address choice, uint256 amount) external {
        if (gameState != GameState.Running) revert GameNotRunning();
        if (!registeredPlayers[choice]) revert PlayerNotRegistered();
        if (amount == 0) revert InvalidBetAmount();

        require(marketToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        RoundData storage roundData = rounds[marketType][currentRound];

        // Track new bettor
        if (roundData.totalBetByBettor[msg.sender] == 0) {
            roundData.bettors.push(msg.sender);
        }

        roundData.bets[msg.sender][choice] += amount;
        roundData.totalBetByBettor[msg.sender] += amount;
        roundData.totalAmount += amount;

        emit BetPlaced(msg.sender, marketType, choice, amount, currentRound);
    }

    /// @notice Called by KillRecorder when a kill occurs — resolves both markets and advances round.
    /// @param attacker The player who made the kill
    /// @param attacked The player who was killed
    function resolveKill(address attacker, address attacked) external isKillRecorder {
        if (gameState != GameState.Running) revert GameNotRunning();

        _resolveMarket(MarketType.Attacker, attacker);
        _resolveMarket(MarketType.Attacked, attacked);
        currentRound++;
    }

    /// @notice Called by GameManager when the game ends — refunds any unresolved bets.
    function endGame() external isGameManager {
        gameState = GameState.Ended;
        _refundRound(MarketType.Attacker);
        _refundRound(MarketType.Attacked);
        emit GameEndedRefund(currentRound);
    }

    function _resolveMarket(MarketType marketType, address winningChoice) internal {
        RoundData storage roundData = rounds[marketType][currentRound];

        if (roundData.totalAmount == 0) {
            roundData.resolved = true;
            return;
        }

        uint256 totalPot = roundData.totalAmount;
        uint256 totalWinningBets = 0;

        for (uint i = 0; i < roundData.bettors.length; i++) {
            totalWinningBets += roundData.bets[roundData.bettors[i]][winningChoice];
        }

        if (totalWinningBets == 0) {
            // No correct bets — refund all bettors
            _refundRound(marketType);
            return;
        }

        // Distribute entire pot proportionally among winners
        for (uint i = 0; i < roundData.bettors.length; i++) {
            address bettor = roundData.bettors[i];
            uint256 betAmount = roundData.bets[bettor][winningChoice];

            if (betAmount > 0) {
                uint256 winnings = (betAmount * totalPot) / totalWinningBets;
                require(marketToken.transfer(bettor, winnings), "Transfer failed");
                emit WinningsDistributed(bettor, winnings, currentRound);
            }
        }

        roundData.resolved = true;
        emit MarketResolved(marketType, winningChoice, currentRound);
    }

    function _refundRound(MarketType marketType) internal {
        RoundData storage roundData = rounds[marketType][currentRound];
        if (roundData.totalAmount == 0 || roundData.resolved) return;

        for (uint i = 0; i < roundData.bettors.length; i++) {
            address bettor = roundData.bettors[i];
            uint256 totalBet = roundData.totalBetByBettor[bettor];

            if (totalBet > 0) {
                require(marketToken.transfer(bettor, totalBet), "Transfer failed");
                emit BetRefunded(bettor, totalBet, currentRound);
            }
        }

        roundData.resolved = true;
    }

    /// @notice Returns the current betting round number.
    function getCurrentRound() external view returns (uint256) {
        return currentRound;
    }
}