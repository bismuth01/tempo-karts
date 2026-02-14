// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "./common.sol";

contract PositionRecorder {
    struct PositionEvent {
        uint xPos;
        uint yPos;
        uint angle;
        address playerAddress;
    }

    uint256 public matchDuration;
    mapping(uint256 => PositionEvent[]) positionRecords;
    GameState public gameState;
    address public owner;
    address public gameManager;

    event PositionsRecorded(uint256 indexed tick, uint256 playerCount);

    error GameNotRunning();

    constructor(address _owner) {
        owner = _owner;
        gameManager = msg.sender;
        gameState = GameState.Running;
        matchDuration = 0;
    }

    modifier isOwner() {
        require(owner == msg.sender, "Only Owner is allowed to execute");
        _;
    }

    modifier isGameManager() {
        require(gameManager == msg.sender, "Only GameManager is allowed to execute");
        _;
    }

    /// @notice Record positions for all players at the current tick. Called every 1 second by the backend.
    function addRecord(PositionEvent[] memory events) external isOwner {
        if (gameState != GameState.Running) revert GameNotRunning();
        for (uint i = 0; i < events.length; i++) {
            positionRecords[matchDuration].push(events[i]);
        }
        emit PositionsRecorded(matchDuration, events.length);
        matchDuration += 1;
    }

    /// @notice Called by GameManager when the game ends.
    function endGame() external isGameManager {
        gameState = GameState.Ended;
    }

    /// @notice Returns position snapshots for all players at a specific tick.
    function getPositionsAtTick(uint256 tick) external view returns (PositionEvent[] memory) {
        return positionRecords[tick];
    }
}