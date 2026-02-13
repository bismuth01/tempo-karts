// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract LivePredictionMarket {
    enum MarketType { Attacker, Attacked }

    struct Market {
        uint256 totalAmount;
        mapping(address => mapping(address => uint256)) bets;
        address[] bettors;
    }

    bool gameEnded;
    mapping(MarketType => Market) liveMarkets;

    event ResolvingMarket(MarketType marketType, address winningChoice);
}