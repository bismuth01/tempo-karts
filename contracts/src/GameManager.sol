// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "../lib/tempo-std/src/interfaces/ITIP20.sol";
import {ItemRecorder} from "./ItemRecorder.sol";
import {KillRecorder} from "./KillRecorder.sol";
import {PositionRecorder} from "./PositionRecorder.sol";
import {LivePredictionMarket} from "./LivePredictionMarket.sol";
import {StaticPredictionMarket} from "./StaticPredictionMarket.sol";
import "./common.sol";

contract GameManager {
    string public gameId;
    address[] public players;
    GameState public gameState;
    uint public playerCap;
    uint public playerNumber;
    uint256 public totalStake;
    uint256 public stakeAmount;
    address public owner;
    ITIP20 public stakeToken;

    ItemRecorder public itemRecorder;
    KillRecorder public killRecorder;
    PositionRecorder public positionRecorder;
    LivePredictionMarket public livePredictionMarket;
    StaticPredictionMarket public staticPredictionMarket;

    mapping(address => bool) public registeredPlayers;

    event GameStarted(string gameId, uint256 startTime);
    event GameEnded(string gameId, uint256 endTime);
    event RewardsDistributed(string gameId, address winner, uint256 amount);
    event PlayerJoined(string gameId, address playerAddress);
    event PlayerLeft(string gameId, address playerAddress);
    event ContractsInitialized(
        string gameId,
        address itemRecorder,
        address killRecorder,
        address positionRecorder,
        address livePredictionMarket,
        address staticPredictionMarket
    );

    error PlayerAlreadyRegistered(address playerAddress);
    error PlayerNotRegistered(address playerAddress);
    error PlayerCapReached(uint playerCap);
    error GameNotInState(GameState expected, GameState actual);
    error StakeAmountNotSet(uint currStakeAmount);
    error TokenTransferFailed(address spender, uint256 amount);
    error NoPlayersRegistered();
    error ContractsAlreadySet();

    constructor (
        string memory _gameId, 
        address _owner, 
        uint _playerCap,
        address _stakeToken,
        uint256 _stakeAmount
    ) {
        gameId = _gameId;
        owner = _owner;
        playerCap = _playerCap;
        stakeToken = ITIP20(_stakeToken);
        stakeAmount = _stakeAmount;
        gameState = GameState.NotStarted;
    }

    modifier isOwner() {
        require(owner == msg.sender, "Only Owner is allowed to execute");
        _;
    }

    modifier inState(GameState _state) {
        if (gameState != _state) revert GameNotInState(_state, gameState);
        _;
    }

    /// @notice Register as a player by staking TIP20 tokens. Game must not have started.
    function registerPlayer() external inState(GameState.NotStarted) {
        if (playerNumber >= playerCap) revert PlayerCapReached(playerCap);
        if (stakeAmount == 0) revert StakeAmountNotSet(stakeAmount);
        if (registeredPlayers[msg.sender]) revert PlayerAlreadyRegistered(msg.sender);

        registeredPlayers[msg.sender] = true;

        if (!stakeToken.transferFrom(msg.sender, address(this), stakeAmount)) {
            revert TokenTransferFailed(msg.sender, stakeAmount);
        }
        
        players.push(msg.sender);
        playerNumber++;
        totalStake += stakeAmount;
        
        emit PlayerJoined(gameId, msg.sender);
    }

    /// @notice Deregister before game starts and reclaim staked tokens.
    function deregisterPlayer() external inState(GameState.NotStarted) {
        if (!registeredPlayers[msg.sender]) revert PlayerNotRegistered(msg.sender);

        registeredPlayers[msg.sender] = false;

        // Remove from players array (swap and pop)
        for (uint i = 0; i < players.length; i++) {
            if (players[i] == msg.sender) {
                players[i] = players[players.length - 1];
                players.pop();
                break;
            }
        }

        playerNumber--;
        totalStake -= stakeAmount;

        if (!stakeToken.transfer(msg.sender, stakeAmount)) {
            revert TokenTransferFailed(msg.sender, stakeAmount);
        }

        emit PlayerLeft(gameId, msg.sender);
    }

    /// @notice Backend starts the game. Sub-contracts must be set via setContracts() before or after.
    function startGame() external isOwner inState(GameState.NotStarted) {
        if (playerNumber == 0) revert NoPlayersRegistered();
        gameState = GameState.Running;
        emit GameStarted(gameId, block.timestamp);
    }

    /// @notice Backend sets the pre-deployed sub-contract addresses. Can only be called once while Running.
    function setContracts(
        address _itemRecorder,
        address _killRecorder,
        address _positionRecorder,
        address _livePredictionMarket,
        address _staticPredictionMarket
    ) external isOwner inState(GameState.Running) {
        if (address(itemRecorder) != address(0)) revert ContractsAlreadySet();

        itemRecorder = ItemRecorder(_itemRecorder);
        killRecorder = KillRecorder(_killRecorder);
        positionRecorder = PositionRecorder(_positionRecorder);
        livePredictionMarket = LivePredictionMarket(_livePredictionMarket);
        staticPredictionMarket = StaticPredictionMarket(_staticPredictionMarket);

        // Link KillRecorder → LivePredictionMarket so kills auto-resolve live bets
        killRecorder.setLivePredictionMarket(_livePredictionMarket);

        emit ContractsInitialized(
            gameId,
            _itemRecorder,
            _killRecorder,
            _positionRecorder,
            _livePredictionMarket,
            _staticPredictionMarket
        );
    }

    /// @notice Backend ends the game — resolves all markets and distributes stakes to winner.
    /// @param winner The address of the player who won the game
    /// @param mostDeaths The address of the player with the most deaths
    function endGame(address winner, address mostDeaths) external isOwner inState(GameState.Running) {
        gameState = GameState.Ended;

        // End all recorder contracts (prevents further recording)
        itemRecorder.endGame();
        killRecorder.endGame();
        positionRecorder.endGame();

        // Refund any unresolved live prediction bets and close market
        livePredictionMarket.endGame();

        // Close static prediction market and resolve both categories
        staticPredictionMarket.endGame();
        staticPredictionMarket.resolveMarket(StaticMarketType.Winner, winner);
        staticPredictionMarket.resolveMarket(StaticMarketType.MostDeaths, mostDeaths);

        // Distribute game stakes to winner
        if (totalStake > 0 && winner != address(0)) {
            require(stakeToken.transfer(winner, totalStake), "Transfer failed");
            emit RewardsDistributed(gameId, winner, totalStake);
        }

        emit GameEnded(gameId, block.timestamp);
    }

    /// @notice Returns the full list of registered player addresses.
    function getPlayers() external view returns (address[] memory) {
        return players;
    }
}
