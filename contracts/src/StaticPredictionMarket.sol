// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "../lib/tempo-std/src/interfaces/ITIP20.sol";
import "./common.sol";

/// @title StaticPredictionMarket
/// @notice Prediction markets that are resolved after the game ends.
///         Two markets: "Who will win the game" (Winner) and "Who will have the most deaths" (MostDeaths).
///         Uses a simple pot-based system where winning bettors split the entire pot proportionally.
contract StaticPredictionMarket {
    struct Market {
        uint256 totalAmount;
        address[] bettors;
        mapping(address => uint256) totalBetByBettor;
        mapping(address => mapping(address => uint256)) bets; // bettor => choice => amount
        bool resolved;
    }

    GameState public gameState;
    ITIP20 public marketToken;
    address public gameManagerAddress;
    mapping(address => bool) public registeredPlayers;
    mapping(StaticMarketType => Market) markets;

    event BetPlaced(address indexed bettor, StaticMarketType marketType, address indexed choice, uint256 amount);
    event MarketResolved(StaticMarketType marketType, address winningChoice);
    event WinningsDistributed(address indexed winner, uint256 amount);
    event BetRefunded(address indexed bettor, uint256 amount);

    error GameNotRunning();
    error GameNotEnded();
    error PlayerNotRegistered();
    error InvalidBetAmount();
    error OnlyGameManager();
    error MarketAlreadyResolved();

    constructor(address _marketToken, address[] memory _players) {
        marketToken = ITIP20(_marketToken);
        gameManagerAddress = msg.sender;
        gameState = GameState.Running;

        for (uint i = 0; i < _players.length; i++) {
            registeredPlayers[_players[i]] = true;
        }
    }

    modifier isGameManager() {
        if (msg.sender != gameManagerAddress) revert OnlyGameManager();
        _;
    }

    /// @notice Place a bet on a player for a static market. Only allowed while game is running.
    /// @param marketType Winner or MostDeaths market
    /// @param choice The player address being bet on
    /// @param amount The TIP20 token amount to bet
    function putBet(StaticMarketType marketType, address choice, uint256 amount) external {
        if (gameState != GameState.Running) revert GameNotRunning();
        if (!registeredPlayers[choice]) revert PlayerNotRegistered();
        if (amount == 0) revert InvalidBetAmount();

        require(marketToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        Market storage market = markets[marketType];

        if (market.totalBetByBettor[msg.sender] == 0) {
            market.bettors.push(msg.sender);
        }

        market.bets[msg.sender][choice] += amount;
        market.totalBetByBettor[msg.sender] += amount;
        market.totalAmount += amount;

        emit BetPlaced(msg.sender, marketType, choice, amount);
    }

    /// @notice Called by GameManager to stop accepting bets when the game ends.
    function endGame() external isGameManager {
        gameState = GameState.Ended;
    }

    /// @notice Called by GameManager to resolve a market after game ends.
    ///         If no one bet on the winner, all bettors are refunded.
    /// @param marketType Winner or MostDeaths
    /// @param winningChoice The player who won the category
    function resolveMarket(StaticMarketType marketType, address winningChoice) external isGameManager {
        if (gameState != GameState.Ended) revert GameNotEnded();

        Market storage market = markets[marketType];
        if (market.resolved) revert MarketAlreadyResolved();

        if (market.totalAmount == 0) {
            market.resolved = true;
            return;
        }

        uint256 totalPot = market.totalAmount;
        uint256 totalWinningBets = 0;

        for (uint i = 0; i < market.bettors.length; i++) {
            totalWinningBets += market.bets[market.bettors[i]][winningChoice];
        }

        if (totalWinningBets == 0) {
            // No correct bets — refund all bettors
            for (uint i = 0; i < market.bettors.length; i++) {
                address bettor = market.bettors[i];
                uint256 totalBet = market.totalBetByBettor[bettor];

                if (totalBet > 0) {
                    require(marketToken.transfer(bettor, totalBet), "Transfer failed");
                    emit BetRefunded(bettor, totalBet);
                }
            }
        } else {
            // Distribute entire pot proportionally among winners
            for (uint i = 0; i < market.bettors.length; i++) {
                address bettor = market.bettors[i];
                uint256 betAmount = market.bets[bettor][winningChoice];

                if (betAmount > 0) {
                    uint256 winnings = (betAmount * totalPot) / totalWinningBets;
                    require(marketToken.transfer(bettor, winnings), "Transfer failed");
                    emit WinningsDistributed(bettor, winnings);
                }
            }
        }

        market.resolved = true;
        emit MarketResolved(marketType, winningChoice);
    }
}
