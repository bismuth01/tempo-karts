// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract GameManager {
    string gameId;
    address[] players;
    address itemRecorder;
    address killRecorder;
    address positionRecorder;
    bool gameStarted;
    bool gameEnded;
    uint256 playerCap;

    event GameStarted(string gameId, uint256 startTime);
    event GameEnded(string gameId, uint256 endTime);
    event RewardsDistributed(string gameId, uint256 distributeTime);
    event PlayerJoined(string gameId, address playerAddress);
    event PlayerLeft(string gameId, address playerAddress);
}
