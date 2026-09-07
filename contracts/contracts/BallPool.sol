// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC20BurnableLike is IERC20 {
    function burn(uint256 amount) external;
}

/// @title BallPool
/// @notice Two-sided pari-mutuel sports pools denominated in a burnable ERC-20.
/// @dev V0 moneyline model: HOME or AWAY only. Oracle proposes a result, then anyone
///      can finalize after a dispute window. Automated offchain infrastructure can do both.
contract BallPool is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_TOTAL_BURN_BPS = 5_000;
    uint16 public constant MAX_PROTOCOL_BPS = 500;

    enum Outcome { NONE, HOME, AWAY }
    enum Status { NONE, OPEN, RESULT_PROPOSED, RESOLVED, CANCELLED }

    struct Game {
        bytes32 externalKey;
        uint64 lockTime;
        uint64 proposedAt;
        Status status;
        Outcome proposedOutcome;
        Outcome finalOutcome;
        uint256 homePool;
        uint256 awayPool;
        string homeTeam;
        string awayTeam;
    }

    struct PlayerGame {
        uint256 homeStake;
        uint256 awayStake;
        bool claimed;
    }

    IERC20BurnableLike public immutable token;
    address public treasury;
    address public oracle;
    uint16 public baseBurnBps;
    uint16 public protocolFeeBps;
    uint64 public disputeWindow;
    uint256 public nextGameId = 1;

    uint256 public totalGrossWagered;
    uint256 public totalBurned;
    uint256 public totalProtocolFees;

    mapping(uint256 => Game) public games;
    mapping(bytes32 => uint256) public gameByExternalKey;
    mapping(uint256 => mapping(address => PlayerGame)) public positions;

    error Unauthorized();
    error InvalidGame();
    error InvalidOutcome();
    error InvalidAmount();
    error InvalidFeeConfig();
    error GameNotOpen();
    error BettingClosed();
    error BettingStillOpen();
    error TooEarlyToFinalize();
    error NothingToClaim();
    error AlreadyClaimed();
    error DuplicateExternalKey();

    event GameCreated(uint256 indexed gameId, bytes32 indexed externalKey, uint64 lockTime, string homeTeam, string awayTeam);
    event BetPlaced(uint256 indexed gameId, address indexed player, Outcome indexed outcome, uint256 grossAmount, uint256 burnedAmount, uint256 protocolFee, uint256 effectiveStake, uint16 totalBurnBps);
    event ResultProposed(uint256 indexed gameId, Outcome outcome, uint64 proposedAt);
    event ResultProposalInvalidated(uint256 indexed gameId);
    event GameResolved(uint256 indexed gameId, Outcome outcome);
    event GameCancelled(uint256 indexed gameId);
    event Claimed(uint256 indexed gameId, address indexed player, uint256 payout, bool winner);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FeeConfigUpdated(uint16 baseBurnBps, uint16 protocolFeeBps);

    constructor(address token_, address treasury_, address oracle_, uint16 baseBurnBps_, uint16 protocolFeeBps_, uint64 disputeWindow_) Ownable(msg.sender) {
        if (token_ == address(0) || treasury_ == address(0) || oracle_ == address(0)) revert InvalidFeeConfig();
        if (baseBurnBps_ > MAX_TOTAL_BURN_BPS || protocolFeeBps_ > MAX_PROTOCOL_BPS) revert InvalidFeeConfig();
        if (uint256(baseBurnBps_) + uint256(protocolFeeBps_) >= BPS) revert InvalidFeeConfig();
        token = IERC20BurnableLike(token_);
        treasury = treasury_;
        oracle = oracle_;
        baseBurnBps = baseBurnBps_;
        protocolFeeBps = protocolFeeBps_;
        disputeWindow = disputeWindow_;
    }

    modifier onlyOracle() {
        if (msg.sender != oracle) revert Unauthorized();
        _;
    }

    function createGame(bytes32 externalKey, uint64 lockTime, string calldata homeTeam, string calldata awayTeam) external onlyOracle whenNotPaused returns (uint256 gameId) {
        if (externalKey == bytes32(0) || gameByExternalKey[externalKey] != 0) revert DuplicateExternalKey();
        if (lockTime <= block.timestamp) revert BettingClosed();
        if (bytes(homeTeam).length == 0 || bytes(awayTeam).length == 0) revert InvalidGame();
        gameId = nextGameId++;
        Game storage g = games[gameId];
        g.externalKey = externalKey;
        g.lockTime = lockTime;
        g.status = Status.OPEN;
        g.homeTeam = homeTeam;
        g.awayTeam = awayTeam;
        gameByExternalKey[externalKey] = gameId;
        emit GameCreated(gameId, externalKey, lockTime, homeTeam, awayTeam);
    }

    function bet(uint256 gameId, Outcome outcome, uint256 amount, uint16 totalBurnBps) external nonReentrant whenNotPaused {
        Game storage g = games[gameId];
        if (g.status != Status.OPEN) revert GameNotOpen();
        if (block.timestamp >= g.lockTime) revert BettingClosed();
        if (outcome != Outcome.HOME && outcome != Outcome.AWAY) revert InvalidOutcome();
        if (amount == 0) revert InvalidAmount();
        if (totalBurnBps < baseBurnBps || totalBurnBps > MAX_TOTAL_BURN_BPS) revert InvalidFeeConfig();
        if (uint256(totalBurnBps) + uint256(protocolFeeBps) >= BPS) revert InvalidFeeConfig();

        uint256 burnAmount = amount * totalBurnBps / BPS;
        uint256 protocolFee = amount * protocolFeeBps / BPS;
        uint256 effectiveStake = amount - burnAmount - protocolFee;
        if (effectiveStake == 0) revert InvalidAmount();

        IERC20(address(token)).safeTransferFrom(msg.sender, address(this), amount);
        token.burn(burnAmount);
        IERC20(address(token)).safeTransfer(treasury, protocolFee);

        PlayerGame storage p = positions[gameId][msg.sender];
        if (outcome == Outcome.HOME) {
            p.homeStake += effectiveStake;
            g.homePool += effectiveStake;
        } else {
            p.awayStake += effectiveStake;
            g.awayPool += effectiveStake;
        }

        totalGrossWagered += amount;
        totalBurned += burnAmount;
        totalProtocolFees += protocolFee;
        emit BetPlaced(gameId, msg.sender, outcome, amount, burnAmount, protocolFee, effectiveStake, totalBurnBps);
    }

    function proposeResult(uint256 gameId, Outcome outcome) external onlyOracle whenNotPaused {
        Game storage g = games[gameId];
        if (g.status != Status.OPEN) revert GameNotOpen();
        if (block.timestamp < g.lockTime) revert BettingStillOpen();
        if (outcome != Outcome.HOME && outcome != Outcome.AWAY) revert InvalidOutcome();
        g.status = Status.RESULT_PROPOSED;
        g.proposedOutcome = outcome;
        g.proposedAt = uint64(block.timestamp);
        emit ResultProposed(gameId, outcome, g.proposedAt);
    }

    function invalidateProposal(uint256 gameId) external onlyOwner {
        Game storage g = games[gameId];
        if (g.status != Status.RESULT_PROPOSED) revert InvalidGame();
        g.status = Status.OPEN;
        g.proposedOutcome = Outcome.NONE;
        g.proposedAt = 0;
        emit ResultProposalInvalidated(gameId);
    }

    function finalizeResult(uint256 gameId) external whenNotPaused {
        Game storage g = games[gameId];
        if (g.status != Status.RESULT_PROPOSED) revert InvalidGame();
        if (block.timestamp < uint256(g.proposedAt) + disputeWindow) revert TooEarlyToFinalize();
        g.status = Status.RESOLVED;
        g.finalOutcome = g.proposedOutcome;
        emit GameResolved(gameId, g.finalOutcome);
    }

    function cancelGame(uint256 gameId) external onlyOwner {
        Game storage g = games[gameId];
        if (g.status == Status.RESOLVED || g.status == Status.CANCELLED || g.status == Status.NONE) revert InvalidGame();
        g.status = Status.CANCELLED;
        emit GameCancelled(gameId);
    }

    function claim(uint256 gameId) external nonReentrant {
        Game storage g = games[gameId];
        PlayerGame storage p = positions[gameId][msg.sender];
        if (p.claimed) revert AlreadyClaimed();

        uint256 payout;
        bool winner;
        if (g.status == Status.CANCELLED) {
            payout = p.homeStake + p.awayStake;
            if (payout == 0) revert NothingToClaim();
        } else if (g.status == Status.RESOLVED) {
            uint256 totalPool = g.homePool + g.awayPool;
            uint256 winningPool;
            uint256 playerWinningStake;
            if (g.finalOutcome == Outcome.HOME) {
                winningPool = g.homePool;
                playerWinningStake = p.homeStake;
            } else {
                winningPool = g.awayPool;
                playerWinningStake = p.awayStake;
            }
            if (winningPool == 0) {
                payout = p.homeStake + p.awayStake;
                if (payout == 0) revert NothingToClaim();
            } else {
                if (playerWinningStake == 0) revert NothingToClaim();
                payout = playerWinningStake * totalPool / winningPool;
                winner = true;
            }
        } else {
            revert InvalidGame();
        }

        p.claimed = true;
        IERC20(address(token)).safeTransfer(msg.sender, payout);
        emit Claimed(gameId, msg.sender, payout, winner);
    }

    function quoteBet(uint256 amount, uint16 totalBurnBps) external view returns (uint256 burnAmount, uint256 protocolFee, uint256 effectiveStake) {
        if (totalBurnBps < baseBurnBps || totalBurnBps > MAX_TOTAL_BURN_BPS) revert InvalidFeeConfig();
        burnAmount = amount * totalBurnBps / BPS;
        protocolFee = amount * protocolFeeBps / BPS;
        effectiveStake = amount - burnAmount - protocolFee;
    }

    function pools(uint256 gameId) external view returns (uint256 home, uint256 away, uint256 total) {
        Game storage g = games[gameId];
        home = g.homePool;
        away = g.awayPool;
        total = home + away;
    }

    function gameState(uint256 gameId) external view returns (uint64 lockTime, uint64 proposedAt, Status status, Outcome proposedOutcome, Outcome finalOutcome) {
        Game storage g = games[gameId];
        return (g.lockTime, g.proposedAt, g.status, g.proposedOutcome, g.finalOutcome);
    }

    function setOracle(address newOracle) external onlyOwner {
        if (newOracle == address(0)) revert Unauthorized();
        emit OracleUpdated(oracle, newOracle);
        oracle = newOracle;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert Unauthorized();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setFeeConfig(uint16 baseBurnBps_, uint16 protocolFeeBps_) external onlyOwner {
        if (baseBurnBps_ > MAX_TOTAL_BURN_BPS || protocolFeeBps_ > MAX_PROTOCOL_BPS) revert InvalidFeeConfig();
        if (uint256(baseBurnBps_) + uint256(protocolFeeBps_) >= BPS) revert InvalidFeeConfig();
        baseBurnBps = baseBurnBps_;
        protocolFeeBps = protocolFeeBps_;
        emit FeeConfigUpdated(baseBurnBps_, protocolFeeBps_);
    }

    function setDisputeWindow(uint64 newWindow) external onlyOwner {
        disputeWindow = newWindow;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
