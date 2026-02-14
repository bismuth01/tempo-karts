// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

/// @notice Live prediction market types — resolved in realtime on each kill
enum MarketType { Attacker, Attacked }

/// @notice Static prediction market types — resolved after game ends
enum StaticMarketType { Winner, MostDeaths }

/// @notice Game lifecycle state shared across all contracts
enum GameState { NotStarted, Running, Ended }

/// @notice Items that can be used in the game to damage other players.
/// Add new items as the game expands.
enum Item {
    Bullets,
    Boost
    // TODO: Add more items as needed
}