// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {GameFactory} from "../src/GameFactory.sol";

contract DeployGameFactory is Script {
    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        GameFactory factory = new GameFactory();
        console.log("GameFactory deployed at:", address(factory));
        console.log("Owner:", factory.owner());

        vm.stopBroadcast();
    }
}
