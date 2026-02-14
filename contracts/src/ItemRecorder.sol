// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "./common.sol";

contract ItemRecorder {
    struct ItemEvent {
        address player;
        Item itemUsed;
        uint256 direction;
        uint256 usedTime;
    }

    ItemEvent[] public eventsRecorded;
    GameState public gameState;
    address public owner;
    address public gameManager;

    event EventRecorded(address indexed player, Item itemUsed, uint256 direction, uint256 usedTime);

    error GameNotRunning();

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

    /// @notice Record an item usage event. Called by the backend during the game.
    function addEvent(ItemEvent memory _event) external isOwner {
        if (gameState != GameState.Running) revert GameNotRunning();
        eventsRecorded.push(_event);
        emit EventRecorded(_event.player, _event.itemUsed, _event.direction, _event.usedTime);
    }

    /// @notice Called by GameManager when the game ends.
    function endGame() external isGameManager {
        gameState = GameState.Ended;
    }

    /// @notice Returns the total number of recorded item events.
    function getEventCount() external view returns (uint256) {
        return eventsRecorded.length;
    }
}