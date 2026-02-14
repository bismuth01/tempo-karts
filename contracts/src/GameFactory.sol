// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {GameManager} from "./GameManager.sol";

contract GameFactory {
    uint256 private gameSequence;
    mapping(string => address) games;
    address public owner;

    event GameCreated(string gameId, address gameAddress);

    constructor() {
        owner = msg.sender;
        gameSequence = 0;
    }

    modifier isOwner() {
        require(owner == msg.sender, "Only Owner is allowed to execute");
        _;
    }

    function createGame(uint playerCap, address stakeToken, uint256 stakeAmount) external isOwner returns (address) {
        string memory gameId = _generateId();
        require(games[gameId] == address(0), "ID collision, try again");
        GameManager newGame = new GameManager(gameId, owner, playerCap, stakeToken, stakeAmount);
        games[gameId] = address(newGame);
        gameSequence += 1;
        emit GameCreated(gameId, address(newGame));
        return address(newGame);
    }

    function _generateId() private view returns (string memory) {
        bytes32 hash = keccak256(abi.encodePacked(msg.sender, block.timestamp, gameSequence));
        return _toShortHexString(hash);
    }

    function _toShortHexString(bytes32 data) private pure returns (string memory) {
        bytes memory s = new bytes(6);
        bytes memory alphabet = "0123456789abcdef";
        
        for(uint i = 0; i < 3; i++){
            s[i*2] = alphabet[uint(uint8(data[i] >> 4))];
            s[i*2 + 1] = alphabet[uint(uint8(data[i] & 0x0f))];
        }
        return string(s);
    }
}
