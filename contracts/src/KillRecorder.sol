// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "./common.sol";
import {LivePredictionMarket} from "./LivePredictionMarket.sol";

contract KillRecorder {
    struct KillEvent {
        address attackingPlayer;
        address attackedPlayer;
        Item itemUsed;
        uint8 healthDepleted;
        bool killed;
    }

    KillEvent[] public killRecords;
    mapping(address => uint256) public killCount;
    mapping(address => uint256) public deathCount;

    LivePredictionMarket public livePredictionMarket;
    GameState public gameState;
    address public owner;
    address public gameManager;

    event KillRecorded(address indexed attacker, address indexed victim, Item itemUsed);
    event DamageRecorded(address indexed attacker, address indexed victim, uint8 healthDepleted);

    error GameNotRunning();
    error LivePredictionMarketAlreadySet();

    constructor(address _owner, address _gameManager) {
        owner = _owner;
        gameManager = _gameManager;
        gameState = GameState.Running;
    }

    modifier isOwner() {
        require(owner == msg.sender, "Only Owner is allowed to execute");
        _;
    }

    modifier isGameManager() {
        require(gameManager == msg.sender, "Only GameManager is allowed to execute");
        _;
    }

    /// @notice Link the LivePredictionMarket. Called once by GameManager after deployment.
    function setLivePredictionMarket(address _livePredictionMarket) external isGameManager {
        if (address(livePredictionMarket) != address(0)) revert LivePredictionMarketAlreadySet();
        livePredictionMarket = LivePredictionMarket(_livePredictionMarket);
    }

    /// @notice Record a damage or kill event. If a kill, auto-resolves live prediction markets.
    function addEvent(KillEvent memory _event) external isOwner {
        if (gameState != GameState.Running) revert GameNotRunning();

        killRecords.push(_event);

        if (_event.killed) {
            killCount[_event.attackingPlayer]++;
            deathCount[_event.attackedPlayer]++;

            // Resolve live prediction markets on kill
            if (address(livePredictionMarket) != address(0)) {
                livePredictionMarket.resolveKill(_event.attackingPlayer, _event.attackedPlayer);
            }

            emit KillRecorded(_event.attackingPlayer, _event.attackedPlayer, _event.itemUsed);
        } else {
            emit DamageRecorded(_event.attackingPlayer, _event.attackedPlayer, _event.healthDepleted);
        }
    }

    /// @notice Called by GameManager when the game ends.
    function endGame() external isGameManager {
        gameState = GameState.Ended;
    }

    /// @notice Returns the kill count for a player.
    function getKillCount(address player) external view returns (uint256) {
        return killCount[player];
    }

    /// @notice Returns the death count for a player.
    function getDeathCount(address player) external view returns (uint256) {
        return deathCount[player];
    }

    /// @notice Returns the total number of recorded events.
    function getRecordCount() external view returns (uint256) {
        return killRecords.length;
    }
}