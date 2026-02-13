// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract ItemRecorder {
    enum Item { Bullets }

    struct ItemEvent {
        Item itemUsed;
        uint256 direction;
        uint256 usedTime;
    }

    ItemEvent[] eventsRecorded;

    bool initialised;
    address livePredictionMarket;

    event EventRecorded(ItemEvent itemEvent);
}