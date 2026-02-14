// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {GameFactory} from "../src/GameFactory.sol";
import {GameManager} from "../src/GameManager.sol";
import {ItemRecorder} from "../src/ItemRecorder.sol";
import {KillRecorder} from "../src/KillRecorder.sol";
import {PositionRecorder} from "../src/PositionRecorder.sol";
import {LivePredictionMarket} from "../src/LivePredictionMarket.sol";
import {StaticPredictionMarket} from "../src/StaticPredictionMarket.sol";
import "../src/common.sol";
import "../lib/tempo-std/src/interfaces/ITIP20.sol";

/// @dev Mock TIP20 token for testing
contract MockTIP20 is ITIP20 {
    string public name = "MockUSD";
    string public symbol = "MUSD";
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function burn(uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    // Stub out remaining ITIP20 interface — not needed for game logic tests
    function decimals() external pure returns (uint8) { return 18; }
    function BURN_BLOCKED_ROLE() external pure returns (bytes32) { return bytes32(0); }
    function ISSUER_ROLE() external pure returns (bytes32) { return bytes32(0); }
    function PAUSE_ROLE() external pure returns (bytes32) { return bytes32(0); }
    function UNPAUSE_ROLE() external pure returns (bytes32) { return bytes32(0); }
    function burnBlocked(address, uint256) external {}
    function burnWithMemo(uint256, bytes32) external {}
    function changeTransferPolicyId(uint64) external {}
    function claimRewards() external returns (uint256) { return 0; }
    function completeQuoteTokenUpdate() external {}
    function currency() external pure returns (string memory) { return ""; }
    function globalRewardPerToken() external pure returns (uint256) { return 0; }
    function mintWithMemo(address, uint256, bytes32) external {}
    function nextQuoteToken() external pure returns (ITIP20) { return ITIP20(address(0)); }
    function optedInSupply() external pure returns (uint128) { return 0; }
    function pause() external {}
    function paused() external pure returns (bool) { return false; }
    function quoteToken() external pure returns (ITIP20) { return ITIP20(address(0)); }
    function setNextQuoteToken(ITIP20) external {}
    function setRewardRecipient(address) external {}
    function setSupplyCap(uint256) external {}
    function distributeReward(uint256) external {}
    function supplyCap() external pure returns (uint256) { return type(uint256).max; }
    function systemTransferFrom(address, address, uint256) external returns (bool) { return false; }
    function transferFeePostTx(address, uint256, uint256) external {}
    function transferFeePreTx(address, uint256) external {}
    function transferFromWithMemo(address, address, uint256, bytes32) external returns (bool) { return false; }
    function transferPolicyId() external pure returns (uint64) { return 0; }
    function transferWithMemo(address, uint256, bytes32) external {}
    function unpause() external {}
    function userRewardInfo(address) external pure returns (address, uint256, uint256) { return (address(0), 0, 0); }
    function getPendingRewards(address) external pure returns (uint256) { return 0; }
}

contract GameFlowTest is Test {
    GameFactory public factory;
    MockTIP20 public token;

    address public backend = address(0xBACE);
    address public player1 = address(0x1);
    address public player2 = address(0x2);
    address public player3 = address(0x3);
    address public bettor1 = address(0x4);
    address public bettor2 = address(0x5);

    uint256 public constant STAKE_AMOUNT = 100 ether;
    uint256 public constant BET_AMOUNT = 10 ether;
    uint256 public constant PLAYER_CAP = 4;

    function setUp() public {
        vm.startPrank(backend);
        factory = new GameFactory();
        token = new MockTIP20();
        vm.stopPrank();

        // Mint tokens to players and bettors
        token.mint(player1, 1000 ether);
        token.mint(player2, 1000 ether);
        token.mint(player3, 1000 ether);
        token.mint(bettor1, 1000 ether);
        token.mint(bettor2, 1000 ether);
    }

    // ===================== GameFactory Tests =====================

    function test_FactoryOwnership() public view {
        assertEq(factory.owner(), backend);
    }

    function test_CreateGame() public {
        vm.prank(backend);
        address gameAddr = factory.createGame(PLAYER_CAP, address(token), STAKE_AMOUNT);
        assertTrue(gameAddr != address(0));
    }

    function test_CreateGameOnlyOwner() public {
        vm.prank(player1);
        vm.expectRevert("Only Owner is allowed to execute");
        factory.createGame(PLAYER_CAP, address(token), STAKE_AMOUNT);
    }

    // ===================== Player Registration Tests =====================

    function _createGame() internal returns (GameManager) {
        vm.prank(backend);
        address gameAddr = factory.createGame(PLAYER_CAP, address(token), STAKE_AMOUNT);
        return GameManager(gameAddr);
    }

    function test_RegisterPlayer() public {
        GameManager game = _createGame();

        vm.startPrank(player1);
        token.approve(address(game), STAKE_AMOUNT);
        game.registerPlayer();
        vm.stopPrank();

        assertEq(game.playerNumber(), 1);
        assertTrue(game.registeredPlayers(player1));
        assertEq(token.balanceOf(address(game)), STAKE_AMOUNT);
    }

    function test_RegisterPlayerDuplicate() public {
        GameManager game = _createGame();

        vm.startPrank(player1);
        token.approve(address(game), STAKE_AMOUNT * 2);
        game.registerPlayer();
        vm.expectRevert(abi.encodeWithSelector(GameManager.PlayerAlreadyRegistered.selector, player1));
        game.registerPlayer();
        vm.stopPrank();
    }

    function test_DeregisterPlayer() public {
        GameManager game = _createGame();

        vm.startPrank(player1);
        token.approve(address(game), STAKE_AMOUNT);
        game.registerPlayer();
        game.deregisterPlayer();
        vm.stopPrank();

        assertEq(game.playerNumber(), 0);
        assertFalse(game.registeredPlayers(player1));
        assertEq(token.balanceOf(player1), 1000 ether); // got stake back
    }

    function test_DeregisterNotRegistered() public {
        GameManager game = _createGame();

        vm.prank(player1);
        vm.expectRevert(abi.encodeWithSelector(GameManager.PlayerNotRegistered.selector, player1));
        game.deregisterPlayer();
    }

    function test_PlayerCapReached() public {
        vm.prank(backend);
        address gameAddr = factory.createGame(2, address(token), STAKE_AMOUNT);
        GameManager game = GameManager(gameAddr);

        vm.startPrank(player1);
        token.approve(address(game), STAKE_AMOUNT);
        game.registerPlayer();
        vm.stopPrank();

        vm.startPrank(player2);
        token.approve(address(game), STAKE_AMOUNT);
        game.registerPlayer();
        vm.stopPrank();

        vm.startPrank(player3);
        token.approve(address(game), STAKE_AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(GameManager.PlayerCapReached.selector, 2));
        game.registerPlayer();
        vm.stopPrank();
    }

    // ===================== Game Lifecycle Tests =====================

    /// @dev Helper: after startGame(), deploy all sub-contracts and link them into the GameManager
    function _deployAndSetContracts(GameManager game) internal {
        address[] memory gamePlayers = game.getPlayers();
        address gameAddr = address(game);

        ItemRecorder ir = new ItemRecorder(backend, gameAddr);
        KillRecorder kr = new KillRecorder(backend, gameAddr);
        PositionRecorder pr = new PositionRecorder(backend, gameAddr);
        LivePredictionMarket lpm = new LivePredictionMarket(
            address(token), address(kr), gameAddr, gamePlayers
        );
        StaticPredictionMarket spm = new StaticPredictionMarket(
            address(token), gameAddr, gamePlayers
        );

        // setContracts also links KillRecorder → LivePredictionMarket internally
        game.setContracts(
            address(ir), address(kr), address(pr), address(lpm), address(spm)
        );
    }

    function _setupGameWithPlayers() internal returns (GameManager) {
        GameManager game = _createGame();

        vm.startPrank(player1);
        token.approve(address(game), STAKE_AMOUNT);
        game.registerPlayer();
        vm.stopPrank();

        vm.startPrank(player2);
        token.approve(address(game), STAKE_AMOUNT);
        game.registerPlayer();
        vm.stopPrank();

        vm.startPrank(player3);
        token.approve(address(game), STAKE_AMOUNT);
        game.registerPlayer();
        vm.stopPrank();

        return game;
    }

    function test_StartGame() public {
        GameManager game = _setupGameWithPlayers();

        vm.prank(backend);
        game.startGame();

        assertEq(uint(game.gameState()), uint(GameState.Running));
        // Contracts not yet set
        assertTrue(address(game.itemRecorder()) == address(0));

        // Now deploy and set contracts
        vm.startPrank(backend);
        _deployAndSetContracts(game);
        vm.stopPrank();

        assertTrue(address(game.itemRecorder()) != address(0));
        assertTrue(address(game.killRecorder()) != address(0));
        assertTrue(address(game.positionRecorder()) != address(0));
        assertTrue(address(game.livePredictionMarket()) != address(0));
        assertTrue(address(game.staticPredictionMarket()) != address(0));
    }

    function test_StartGameOnlyOwner() public {
        GameManager game = _setupGameWithPlayers();

        vm.prank(player1);
        vm.expectRevert("Only Owner is allowed to execute");
        game.startGame();
    }

    function test_StartGameNoPlayers() public {
        GameManager game = _createGame();

        vm.prank(backend);
        vm.expectRevert(GameManager.NoPlayersRegistered.selector);
        game.startGame();
    }

    function test_CannotRegisterAfterStart() public {
        GameManager game = _setupGameWithPlayers();

        vm.prank(backend);
        game.startGame();

        vm.startPrank(address(0x99));
        token.mint(address(0x99), 1000 ether);
        token.approve(address(game), STAKE_AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(GameManager.GameNotInState.selector, GameState.NotStarted, GameState.Running));
        game.registerPlayer();
        vm.stopPrank();
    }

    // ===================== Recorder Tests =====================

    function test_ItemRecorder() public {
        GameManager game = _setupGameWithPlayers();
        vm.startPrank(backend);
        game.startGame();
        _deployAndSetContracts(game);
        vm.stopPrank();

        ItemRecorder recorder = game.itemRecorder();

        vm.prank(backend);
        recorder.addEvent(ItemRecorder.ItemEvent({
            player: player1,
            itemUsed: Item.Bullets,
            direction: 90,
            usedTime: block.timestamp
        }));

        assertEq(recorder.getEventCount(), 1);
    }

    function test_ItemRecorderOnlyOwner() public {
        GameManager game = _setupGameWithPlayers();
        vm.startPrank(backend);
        game.startGame();
        _deployAndSetContracts(game);
        vm.stopPrank();

        ItemRecorder recorder = game.itemRecorder();

        vm.prank(player1);
        vm.expectRevert("Only Owner is allowed to execute");
        recorder.addEvent(ItemRecorder.ItemEvent({
            player: player1,
            itemUsed: Item.Bullets,
            direction: 90,
            usedTime: block.timestamp
        }));
    }

    function test_KillRecorder() public {
        GameManager game = _setupGameWithPlayers();
        vm.startPrank(backend);
        game.startGame();
        _deployAndSetContracts(game);
        vm.stopPrank();

        KillRecorder recorder = game.killRecorder();

        // Record damage (not a kill)
        vm.prank(backend);
        recorder.addEvent(KillRecorder.KillEvent({
            attackingPlayer: player1,
            attackedPlayer: player2,
            itemUsed: Item.Bullets,
            healthDepleted: 30,
            killed: false
        }));

        assertEq(recorder.getRecordCount(), 1);
        assertEq(recorder.getKillCount(player1), 0);
        assertEq(recorder.getDeathCount(player2), 0);

        // Record a kill
        vm.prank(backend);
        recorder.addEvent(KillRecorder.KillEvent({
            attackingPlayer: player1,
            attackedPlayer: player2,
            itemUsed: Item.Bullets,
            healthDepleted: 70,
            killed: true
        }));

        assertEq(recorder.getRecordCount(), 2);
        assertEq(recorder.getKillCount(player1), 1);
        assertEq(recorder.getDeathCount(player2), 1);
    }

    function test_PositionRecorder() public {
        GameManager game = _setupGameWithPlayers();
        vm.startPrank(backend);
        game.startGame();
        _deployAndSetContracts(game);
        vm.stopPrank();

        PositionRecorder recorder = game.positionRecorder();

        PositionRecorder.PositionEvent[] memory events = new PositionRecorder.PositionEvent[](3);
        events[0] = PositionRecorder.PositionEvent({xPos: 10, yPos: 20, angle: 45, playerAddress: player1});
        events[1] = PositionRecorder.PositionEvent({xPos: 30, yPos: 40, angle: 90, playerAddress: player2});
        events[2] = PositionRecorder.PositionEvent({xPos: 50, yPos: 60, angle: 180, playerAddress: player3});

        vm.prank(backend);
        recorder.addRecord(events);

        assertEq(recorder.matchDuration(), 1);

        PositionRecorder.PositionEvent[] memory result = recorder.getPositionsAtTick(0);
        assertEq(result.length, 3);
        assertEq(result[0].xPos, 10);
        assertEq(result[1].playerAddress, player2);
    }

    // ===================== Live Prediction Market Tests =====================

    function test_LivePredictionBetAndResolve() public {
        GameManager game = _setupGameWithPlayers();
        vm.startPrank(backend);
        game.startGame();
        _deployAndSetContracts(game);
        vm.stopPrank();

        LivePredictionMarket lpm = game.livePredictionMarket();
        KillRecorder kr = game.killRecorder();

        // Bettor1 bets on player1 as attacker
        vm.startPrank(bettor1);
        token.approve(address(lpm), BET_AMOUNT);
        lpm.putBet(MarketType.Attacker, player1, BET_AMOUNT);
        vm.stopPrank();

        // Bettor2 bets on player2 as attacker
        vm.startPrank(bettor2);
        token.approve(address(lpm), BET_AMOUNT);
        lpm.putBet(MarketType.Attacker, player2, BET_AMOUNT);
        vm.stopPrank();

        uint256 bettor1BalBefore = token.balanceOf(bettor1);
        uint256 bettor2BalBefore = token.balanceOf(bettor2);

        // Kill event: player1 kills player2 → player1 wins attacker market
        vm.prank(backend);
        kr.addEvent(KillRecorder.KillEvent({
            attackingPlayer: player1,
            attackedPlayer: player2,
            itemUsed: Item.Bullets,
            healthDepleted: 100,
            killed: true
        }));

        // Bettor1 should receive entire pot (20 ether) → net gain of 10
        assertEq(token.balanceOf(bettor1), bettor1BalBefore + BET_AMOUNT * 2);
        // Bettor2 gets nothing extra
        assertEq(token.balanceOf(bettor2), bettor2BalBefore);

        // Round should have advanced
        assertEq(lpm.getCurrentRound(), 1);
    }

    function test_LivePredictionRefundOnNoWinners() public {
        GameManager game = _setupGameWithPlayers();
        vm.startPrank(backend);
        game.startGame();
        _deployAndSetContracts(game);
        vm.stopPrank();

        LivePredictionMarket lpm = game.livePredictionMarket();
        KillRecorder kr = game.killRecorder();

        // Both bet on player3 as attacker, but player1 kills player2
        vm.startPrank(bettor1);
        token.approve(address(lpm), BET_AMOUNT);
        lpm.putBet(MarketType.Attacker, player3, BET_AMOUNT);
        vm.stopPrank();

        uint256 bettor1BalBefore = token.balanceOf(bettor1);

        vm.prank(backend);
        kr.addEvent(KillRecorder.KillEvent({
            attackingPlayer: player1,
            attackedPlayer: player2,
            itemUsed: Item.Bullets,
            healthDepleted: 100,
            killed: true
        }));

        // Should be refunded
        assertEq(token.balanceOf(bettor1), bettor1BalBefore + BET_AMOUNT);
    }

    function test_LivePredictionGameNotRunning() public {
        GameManager game = _setupGameWithPlayers();
        vm.startPrank(backend);
        game.startGame();
        _deployAndSetContracts(game);
        vm.stopPrank();

        LivePredictionMarket lpm = game.livePredictionMarket();

        // End the game
        vm.prank(backend);
        game.endGame(player1, player2);

        // Trying to bet after game ended
        vm.startPrank(bettor1);
        token.approve(address(lpm), BET_AMOUNT);
        vm.expectRevert(LivePredictionMarket.GameNotRunning.selector);
        lpm.putBet(MarketType.Attacker, player1, BET_AMOUNT);
        vm.stopPrank();
    }

    // ===================== Static Prediction Market Tests =====================

    function test_StaticPredictionBetAndResolve() public {
        GameManager game = _setupGameWithPlayers();
        vm.startPrank(backend);
        game.startGame();
        _deployAndSetContracts(game);
        vm.stopPrank();

        StaticPredictionMarket spm = game.staticPredictionMarket();

        // Bettor1 bets player1 wins
        vm.startPrank(bettor1);
        token.approve(address(spm), BET_AMOUNT);
        spm.putBet(StaticMarketType.Winner, player1, BET_AMOUNT);
        vm.stopPrank();

        // Bettor2 bets player2 wins
        vm.startPrank(bettor2);
        token.approve(address(spm), BET_AMOUNT);
        spm.putBet(StaticMarketType.Winner, player2, BET_AMOUNT);
        vm.stopPrank();

        uint256 bettor1BalBefore = token.balanceOf(bettor1);

        // End game — player1 wins, player2 has most deaths
        vm.prank(backend);
        game.endGame(player1, player2);

        // Bettor1 bet on the winner → gets entire pot
        assertEq(token.balanceOf(bettor1), bettor1BalBefore + BET_AMOUNT * 2);
    }

    function test_StaticPredictionMostDeaths() public {
        GameManager game = _setupGameWithPlayers();
        vm.startPrank(backend);
        game.startGame();
        _deployAndSetContracts(game);
        vm.stopPrank();

        StaticPredictionMarket spm = game.staticPredictionMarket();

        // Bettor1 bets player2 has most deaths
        vm.startPrank(bettor1);
        token.approve(address(spm), BET_AMOUNT);
        spm.putBet(StaticMarketType.MostDeaths, player2, BET_AMOUNT);
        vm.stopPrank();

        // Bettor2 bets player3 has most deaths
        vm.startPrank(bettor2);
        token.approve(address(spm), BET_AMOUNT);
        spm.putBet(StaticMarketType.MostDeaths, player3, BET_AMOUNT);
        vm.stopPrank();

        uint256 bettor1BalBefore = token.balanceOf(bettor1);

        // End game — player1 wins, player2 has most deaths
        vm.prank(backend);
        game.endGame(player1, player2);

        // Bettor1 correctly predicted most deaths
        assertEq(token.balanceOf(bettor1), bettor1BalBefore + BET_AMOUNT * 2);
    }

    function test_StaticPredictionRefundOnNoWinners() public {
        GameManager game = _setupGameWithPlayers();
        vm.startPrank(backend);
        game.startGame();
        _deployAndSetContracts(game);
        vm.stopPrank();

        StaticPredictionMarket spm = game.staticPredictionMarket();

        // Everyone bets on player3 winning, but player1 wins
        vm.startPrank(bettor1);
        token.approve(address(spm), BET_AMOUNT);
        spm.putBet(StaticMarketType.Winner, player3, BET_AMOUNT);
        vm.stopPrank();

        vm.startPrank(bettor2);
        token.approve(address(spm), BET_AMOUNT);
        spm.putBet(StaticMarketType.Winner, player3, BET_AMOUNT);
        vm.stopPrank();

        uint256 bettor1BalBefore = token.balanceOf(bettor1);
        uint256 bettor2BalBefore = token.balanceOf(bettor2);

        vm.prank(backend);
        game.endGame(player1, player2);

        // Both should be refunded
        assertEq(token.balanceOf(bettor1), bettor1BalBefore + BET_AMOUNT);
        assertEq(token.balanceOf(bettor2), bettor2BalBefore + BET_AMOUNT);
    }

    // ===================== End Game Tests =====================

    function test_EndGameDistributesStake() public {
        GameManager game = _setupGameWithPlayers();
        vm.startPrank(backend);
        game.startGame();
        _deployAndSetContracts(game);
        vm.stopPrank();

        uint256 player1BalBefore = token.balanceOf(player1);

        vm.prank(backend);
        game.endGame(player1, player2);

        // Winner gets total stake (3 * 100 = 300)
        assertEq(token.balanceOf(player1), player1BalBefore + STAKE_AMOUNT * 3);
        assertEq(uint(game.gameState()), uint(GameState.Ended));
    }

    function test_EndGameRefundsUnresolvedLiveBets() public {
        GameManager game = _setupGameWithPlayers();
        vm.startPrank(backend);
        game.startGame();
        _deployAndSetContracts(game);
        vm.stopPrank();

        LivePredictionMarket lpm = game.livePredictionMarket();

        // Place bets that won't be resolved before game ends
        vm.startPrank(bettor1);
        token.approve(address(lpm), BET_AMOUNT);
        lpm.putBet(MarketType.Attacker, player1, BET_AMOUNT);
        vm.stopPrank();

        uint256 bettor1BalBefore = token.balanceOf(bettor1);

        vm.prank(backend);
        game.endGame(player1, player2);

        // Bettor should get refund
        assertEq(token.balanceOf(bettor1), bettor1BalBefore + BET_AMOUNT);
    }

    function test_RecordersStopAfterEnd() public {
        GameManager game = _setupGameWithPlayers();
        vm.startPrank(backend);
        game.startGame();
        _deployAndSetContracts(game);
        vm.stopPrank();

        // Store recorder references before ending the game
        ItemRecorder ir = game.itemRecorder();
        KillRecorder kr = game.killRecorder();
        PositionRecorder pr = game.positionRecorder();

        vm.prank(backend);
        game.endGame(player1, player2);

        // ItemRecorder should reject events
        vm.prank(backend);
        vm.expectRevert(ItemRecorder.GameNotRunning.selector);
        ir.addEvent(ItemRecorder.ItemEvent({
            player: player1,
            itemUsed: Item.Bullets,
            direction: 90,
            usedTime: block.timestamp
        }));

        // KillRecorder should reject events
        vm.prank(backend);
        vm.expectRevert(KillRecorder.GameNotRunning.selector);
        kr.addEvent(KillRecorder.KillEvent({
            attackingPlayer: player1,
            attackedPlayer: player2,
            itemUsed: Item.Bullets,
            healthDepleted: 100,
            killed: true
        }));

        // PositionRecorder should reject events
        PositionRecorder.PositionEvent[] memory events = new PositionRecorder.PositionEvent[](1);
        events[0] = PositionRecorder.PositionEvent({xPos: 10, yPos: 20, angle: 45, playerAddress: player1});

        vm.prank(backend);
        vm.expectRevert(PositionRecorder.GameNotRunning.selector);
        pr.addRecord(events);
    }

    // ===================== Full Game Flow Integration Test =====================

    function test_FullGameFlow() public {
        // 1. Create game
        vm.prank(backend);
        address gameAddr = factory.createGame(PLAYER_CAP, address(token), STAKE_AMOUNT);
        GameManager game = GameManager(gameAddr);

        // 2. Register players
        vm.startPrank(player1);
        token.approve(address(game), STAKE_AMOUNT);
        game.registerPlayer();
        vm.stopPrank();

        vm.startPrank(player2);
        token.approve(address(game), STAKE_AMOUNT);
        game.registerPlayer();
        vm.stopPrank();

        vm.startPrank(player3);
        token.approve(address(game), STAKE_AMOUNT);
        game.registerPlayer();
        vm.stopPrank();

        // 3. Start game
        vm.startPrank(backend);
        game.startGame();
        _deployAndSetContracts(game);
        vm.stopPrank();

        LivePredictionMarket lpm = game.livePredictionMarket();
        StaticPredictionMarket spm = game.staticPredictionMarket();
        KillRecorder kr = game.killRecorder();
        PositionRecorder pr = game.positionRecorder();
        ItemRecorder ir = game.itemRecorder();

        // 4. Place static bets
        vm.startPrank(bettor1);
        token.approve(address(spm), BET_AMOUNT * 2);
        spm.putBet(StaticMarketType.Winner, player1, BET_AMOUNT);
        spm.putBet(StaticMarketType.MostDeaths, player2, BET_AMOUNT);
        vm.stopPrank();

        vm.startPrank(bettor2);
        token.approve(address(spm), BET_AMOUNT * 2);
        spm.putBet(StaticMarketType.Winner, player2, BET_AMOUNT);
        spm.putBet(StaticMarketType.MostDeaths, player3, BET_AMOUNT);
        vm.stopPrank();

        // 5. Place live bets (round 0)
        vm.startPrank(bettor1);
        token.approve(address(lpm), BET_AMOUNT);
        lpm.putBet(MarketType.Attacker, player1, BET_AMOUNT);
        vm.stopPrank();

        vm.startPrank(bettor2);
        token.approve(address(lpm), BET_AMOUNT);
        lpm.putBet(MarketType.Attacked, player2, BET_AMOUNT);
        vm.stopPrank();

        // 6. Record game events
        vm.startPrank(backend);

        // Record item use
        ir.addEvent(ItemRecorder.ItemEvent({
            player: player1,
            itemUsed: Item.Bullets,
            direction: 90,
            usedTime: block.timestamp
        }));

        // Record positions tick 0
        PositionRecorder.PositionEvent[] memory pos = new PositionRecorder.PositionEvent[](3);
        pos[0] = PositionRecorder.PositionEvent({xPos: 100, yPos: 200, angle: 0, playerAddress: player1});
        pos[1] = PositionRecorder.PositionEvent({xPos: 300, yPos: 400, angle: 90, playerAddress: player2});
        pos[2] = PositionRecorder.PositionEvent({xPos: 500, yPos: 600, angle: 180, playerAddress: player3});
        pr.addRecord(pos);

        // Record damage
        kr.addEvent(KillRecorder.KillEvent({
            attackingPlayer: player1,
            attackedPlayer: player2,
            itemUsed: Item.Bullets,
            healthDepleted: 50,
            killed: false
        }));

        // Record kill — triggers live prediction resolution
        kr.addEvent(KillRecorder.KillEvent({
            attackingPlayer: player1,
            attackedPlayer: player2,
            itemUsed: Item.Bullets,
            healthDepleted: 50,
            killed: true
        }));

        vm.stopPrank();

        // Verify live market advanced to round 1
        assertEq(lpm.getCurrentRound(), 1);
        assertEq(kr.getKillCount(player1), 1);
        assertEq(kr.getDeathCount(player2), 1);

        // 7. End the game
        vm.prank(backend);
        game.endGame(player1, player2);

        assertEq(uint(game.gameState()), uint(GameState.Ended));

        console.log("Full game flow test passed!");
    }
}
