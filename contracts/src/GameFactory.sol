// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract GameFactory {
    uint256 gameSequence;
    mapping(string => address) games;

    event GameCreated(string gameId, address gameAddress);
}
