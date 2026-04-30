// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {AgentAdapterEscrow} from "../src/AgentAdapterEscrow.sol";

contract DeployEscrow is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        AgentAdapterEscrow escrow = new AgentAdapterEscrow();
        vm.stopBroadcast();
        console.log("AgentAdapterEscrow deployed to:", address(escrow));
    }
}
