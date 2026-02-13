// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract KillRecorder {
    enum Item { Bullets }

    struct KillEvent {
        address attackingPlayer;
        address attackedPlayer;
        Item itemUsed;
        uint8 healthDepleted;
        bool killed;
    }

    KillEvent[] killRecords;
    address livePredictionMarket;

    event KillRecorded(KillEvent killEvent);
}