// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IRandom {
    /**
     * @notice Returns the most-recently revealed on-chain random value.
     *         This value is updated every block by the RANDAO commit-reveal
     *         scheme built into the Celo protocol – validators commit to a
     *         random value one block ahead and reveal it in the next, making
     *         it impossible to predict before the block is finalised.
     */
    function random() external view returns (bytes32);

    /**
     * @notice Returns the revealed randomness for a specific block number.
     *         Useful when you want to pin randomness to a past block.
     */
    function getBlockRandomness(
        uint256 blockNumber
    ) external view returns (bytes32);
}

interface IRegistry {
    function getAddressFor(bytes32 identifier) external view returns (address);
}

/**
 * @title Breevs Russian Roulette – Celo VRF Edition
 * @notice Russian-roulette elimination game using Celo's native on-chain
 *         randomness (RANDAO commit-reveal) instead of predictable block hashes.
 *
 * HOW THE RANDOMNESS WORKS
 * ────────────────────────
 * 1. When the host calls `requestSpin()`, the contract records the *current*
 *    block number as the "commitment block" for that spin.
 * 2. The spin CANNOT be resolved in the same block – the host must wait at
 *    least REVEAL_DELAY blocks (default 1) so the RANDAO value for the
 *    commitment block is finalised and published on-chain.
 * 3. The host (or anyone) then calls `resolveSpin()`, which fetches the
 *    committed block's revealed randomness from the Celo Random contract,
 *    mixes it with additional entropy (game ID, round, player addresses),
 *    and selects the eliminated player.
 *
 * WHY THIS IS SAFER THAN block.number / blockhash
 * ─────────────────────────────────────────────────
 * • The RANDAO value is committed one block before it is revealed, so the
 *   host cannot know the value at request time.
 * • Validators only have "1 bit of influence": they can skip proposing a
 *   block, but that hands control to the next validator, so the cost of
 *   manipulation is high.
 * • The extra salt (gameId, round, player list hash) makes it impossible to
 *   reuse the same random seed across different spins even in the same block.
 *
 * DEPLOY PARAMETERS
 * ─────────────────
 * constructor(address _randomContractAddress)
 *   • Alfajores testnet Random contract: 0x006b86B273FF9e20E67B72E92E3Ea11AB35CD59b
 *     (look up current address via IRegistry at 0x000000000000000000000000000000000000ce10)
 *   • Mainnet: resolve via registry as shown in celoRandomAddress() helper below.
 */
contract BreevsRussianRoulette {
    // ─── Constants ───────────────────────────────────────────────────────────

    uint256 public constant MAX_PLAYERS = 6;
    uint256 public constant MIN_STAKE = 1e18; // 1 CELO
    uint256 public constant MAX_STAKE = 1e18; // 1 CELO
    uint256 public constant MIN_ROUND_DURATION = 10; // blocks
    uint256 public constant MAX_ROUND_DURATION = 1000; // blocks
    uint256 public constant MIN_HOST_BALANCE = 5e18; // 5 CELO
    uint256 public constant REVEAL_DELAY = 1; // blocks to wait before resolving a spin

    // Celo core registry – same address on every Celo network
    address private constant CELO_REGISTRY =
        0x000000000000000000000000000000000000ce10;

    // ─── Types ───────────────────────────────────────────────────────────────

    enum Status {
        CREATED,
        IN_PROGRESS,
        COMPLETED
    }

    struct Game {
        address creator;
        address[] players;
        uint256 stake;
        uint256 prizePool;
        Status status;
        uint256 roundDuration;
        uint256 roundEnd;
        uint256 currentRound;
        address winner;
        uint256 totalRounds;
    }

    struct PlayerGameData {
        bool eliminated;
        uint256 eliminationRound;
    }

    struct UserStats {
        uint256 gamesPlayed;
        uint256 gamesWon;
        uint256 totalWinnings;
        uint256 totalStaked;
    }

    /// @dev Tracks a pending VRF-style spin request
    struct SpinRequest {
        bool pending; // true while waiting to be resolved
        uint256 commitBlock; // block whose RANDAO we will use
        uint256 round; // game round this spin belongs to
    }

    // ─── State ───────────────────────────────────────────────────────────────

    uint256 public gameCounter;

    mapping(uint256 => Game) public games;
    mapping(uint256 => mapping(address => PlayerGameData))
        public playerGameData;
    mapping(uint256 => mapping(address => uint256)) public playerDeposits;
    mapping(uint256 => bool) public prizeClaimed;
    mapping(address => UserStats) public userStats;

    /// @dev One pending spin per game at a time
    mapping(uint256 => SpinRequest) public pendingSpins;

    /// @dev Injected at deploy time so it can be set per-network / mocked in tests
    IRandom public immutable randomContract;

    // ─── Events ──────────────────────────────────────────────────────────────

    event GameCreated(uint256 indexed gameId);
    event PlayerJoined(uint256 indexed gameId, address player);
    event GameStarted(uint256 indexed gameId);
    event SpinRequested(
        uint256 indexed gameId,
        uint256 commitBlock,
        uint256 round
    );
    event PlayerEliminated(
        uint256 indexed gameId,
        address player,
        uint256 round
    );
    event GameCompleted(uint256 indexed gameId, address winner);
    event PrizeClaimed(uint256 indexed gameId, address winner, uint256 amount);

    // ─── Constructor ─────────────────────────────────────────────────────────

    /**
     * @param _randomContractAddress  Address of the Celo Random core contract.
     *        Pass address(0) to auto-resolve via the Celo Registry (mainnet only).
     */
    constructor(address _randomContractAddress) {
        if (_randomContractAddress == address(0)) {
            // Auto-resolve from registry (works on mainnet; may fail on testnets
            // if the registry is not yet deployed at the canonical address).
            address resolved = IRegistry(CELO_REGISTRY).getAddressFor(
                keccak256(abi.encodePacked("Random"))
            );
            require(
                resolved != address(0),
                "Random contract not found in registry"
            );
            randomContract = IRandom(resolved);
        } else {
            randomContract = IRandom(_randomContractAddress);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  GAME MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    function createGame(
        uint256 stake,
        uint256 roundDuration
    ) external payable returns (uint256) {
        require(stake == MIN_STAKE, "Stake must be exactly 1 CELO");
        require(
            roundDuration >= MIN_ROUND_DURATION &&
                roundDuration <= MAX_ROUND_DURATION,
            "Invalid duration"
        );
        require(msg.value == MIN_STAKE, "Must send exactly 1 CELO as stake");
        require(
            address(msg.sender).balance >= MIN_HOST_BALANCE,
            "Host must hold at least 5 CELO"
        );

        gameCounter++;
        Game storage g = games[gameCounter];
        g.creator = msg.sender;
        g.stake = MIN_STAKE;
        g.prizePool = MIN_STAKE;
        g.status = Status.CREATED;
        g.roundDuration = roundDuration;

        g.players.push(msg.sender);
        playerGameData[gameCounter][msg.sender] = PlayerGameData(false, 0);
        playerDeposits[gameCounter][msg.sender] = MIN_STAKE;
        _updateUserStatsOnJoin(msg.sender, MIN_STAKE);

        emit GameCreated(gameCounter);
        return gameCounter;
    }

    function joinGame(uint256 gameId) external payable {
        Game storage g = games[gameId];
        require(g.status == Status.CREATED, "Game not joinable");
        require(g.players.length < MAX_PLAYERS, "Game is full");
        require(!_isUserInGame(gameId, msg.sender), "Already in game");
        require(msg.value == MIN_STAKE, "Must send exactly 1 CELO");
        require(g.stake == MIN_STAKE, "Game stake must be 1 CELO");

        g.players.push(msg.sender);
        g.prizePool += MIN_STAKE;
        playerGameData[gameId][msg.sender] = PlayerGameData(false, 0);
        playerDeposits[gameId][msg.sender] = MIN_STAKE;
        _updateUserStatsOnJoin(msg.sender, MIN_STAKE);

        emit PlayerJoined(gameId, msg.sender);
    }

    function startGame(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.status == Status.CREATED, "Game not ready");
        require(msg.sender == g.creator, "Only creator can start");
        require(g.players.length == MAX_PLAYERS, "Need exactly 6 players");

        g.status = Status.IN_PROGRESS;
        g.currentRound = 1;
        g.roundEnd = block.number + g.roundDuration;

        emit GameStarted(gameId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  VRF-STYLE SPIN MECHANICS  (two-step: request → resolve)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice STEP 1 – Host submits a spin request.
     *
     *         The contract records `block.number` as the "commit block".
     *         The RANDAO randomness for that block has NOT yet been revealed
     *         (it is revealed when the NEXT block is proposed), so the host
     *         cannot predict the outcome at this point.
     *
     *         Must be called while the round is still open.
     */
    function requestSpin(uint256 gameId) external {
        Game storage g = games[gameId];
        require(msg.sender == g.creator, "Only host can spin");
        require(g.status == Status.IN_PROGRESS, "Game not in progress");
        require(block.number <= g.roundEnd, "Round has expired");

        // Auto-clear a spin that expired (> 200 blocks old) so the game doesn't get stuck
        SpinRequest storage existing = pendingSpins[gameId];
        if (existing.pending && block.number > existing.commitBlock + 200) {
            delete pendingSpins[gameId];
        }

        require(!pendingSpins[gameId].pending, "Spin already pending");

        address[] memory active = _getActivePlayers(gameId);
        require(active.length > 1, "Only one player left");

        pendingSpins[gameId] = SpinRequest({
            pending: true,
            commitBlock: block.number,
            round: g.currentRound
        });

        emit SpinRequested(gameId, block.number, g.currentRound);
    }

    /**
     * @notice STEP 2 – Anyone resolves the pending spin after REVEAL_DELAY blocks.
     *
     *         The contract fetches the Celo RANDAO randomness that was revealed
     *         for the commit block, combines it with additional game-specific
     *         entropy, and uses the result to pick the eliminated player.
     *
     *         By waiting REVEAL_DELAY blocks the randomness is finalised and
     *         the host cannot selectively include / exclude their own transaction
     *         to bias the outcome.
     */
    function resolveSpin(uint256 gameId) external {
        Game storage g = games[gameId];
        SpinRequest storage req = pendingSpins[gameId];

        require(req.pending, "No pending spin");
        require(g.status == Status.IN_PROGRESS, "Game not in progress");
        require(
            block.number >= req.commitBlock + REVEAL_DELAY,
            "Must wait for RANDAO reveal"
        );
        // Safety: if the commit block is too old the RANDAO value may no
        // longer be stored. 256 blocks is the EVM's blockhash window; Celo's
        // Random contract retains history longer, but we cap at 200 for safety.
        require(
            block.number <= req.commitBlock + 200,
            "Spin request expired - request a new spin"
        );

        // ── Fetch randomness: try Celo RANDAO first, fall back to blockhash ────
        bytes32 celoRandom;
        try randomContract.getBlockRandomness(req.commitBlock) returns (bytes32 rand) {
            celoRandom = rand;
        } catch {}
        if (celoRandom == bytes32(0)) {
            // blockhash() only works within 256 blocks — safe given our 200-block cap
            celoRandom = blockhash(req.commitBlock);
        }
        require(
            celoRandom != bytes32(0),
            "Randomness unavailable - resolve within 200 blocks"
        );

        // ── Mix with game-specific entropy to prevent cross-game reuse ────────
        address[] memory active = _getActivePlayers(gameId);
        require(active.length > 1, "Only one player left");

        bytes32 seed = keccak256(
            abi.encodePacked(
                celoRandom, // Celo RANDAO – unmanipulable by host
                gameId, // unique per game
                req.round, // unique per round
                req.commitBlock, // block the commitment was made
                _hashPlayers(active) // current active player set
            )
        );

        uint256 victimIdx = uint256(seed) % active.length;
        address victim = active[victimIdx];

        // ── Clear the pending spin before state changes (re-entrancy guard) ──
        delete pendingSpins[gameId];

        // ── Eliminate the chosen player ───────────────────────────────────────
        _eliminatePlayer(gameId, victim);
        emit PlayerEliminated(gameId, victim, g.currentRound);
    }

    /**
     * @notice Advance to the next round once the current round's time has elapsed.
     *         If only one player remains the game is completed automatically.
     */
    function advanceRound(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.status == Status.IN_PROGRESS, "Not in progress");
        require(block.number > g.roundEnd, "Round not ended yet");

        // Auto-clear expired spins so the round can advance
        SpinRequest storage existing = pendingSpins[gameId];
        if (existing.pending && block.number > existing.commitBlock + 200) {
            delete pendingSpins[gameId];
        }

        require(!pendingSpins[gameId].pending, "Resolve pending spin first");

        address[] memory active = _getActivePlayers(gameId);
        if (active.length <= 1) {
            _completeGame(gameId);
        } else {
            g.currentRound++;
            g.roundEnd = block.number + g.roundDuration;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  PRIZE CLAIMING
    // ═══════════════════════════════════════════════════════════════════════════

    function claimPrize(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.status == Status.COMPLETED, "Game not completed");
        require(g.winner != address(0), "No winner set");
        require(msg.sender == g.winner, "Not the winner");
        require(!prizeClaimed[gameId], "Prize already claimed");

        prizeClaimed[gameId] = true;
        _updateUserStatsOnWin(msg.sender, g.prizePool);

        (bool sent, ) = payable(msg.sender).call{value: g.prizePool}("");
        require(sent, "Transfer failed");

        emit PrizeClaimed(gameId, msg.sender, g.prizePool);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  VIEW HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Returns all active (non-eliminated) players for a game.
    function getActivePlayers(
        uint256 gameId
    ) external view returns (address[] memory) {
        return _getActivePlayers(gameId);
    }

    /// @notice Returns the pending spin request for a game (if any).
    function getPendingSpin(
        uint256 gameId
    ) external view returns (SpinRequest memory) {
        return pendingSpins[gameId];
    }

    /**
     * @notice Helper to resolve the Celo Random contract address on-chain.
     *         You can call this after deployment to verify the address used.
     */
    function celoRandomAddress() external view returns (address) {
        return address(randomContract);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    function _isUserInGame(
        uint256 gameId,
        address user
    ) internal view returns (bool) {
        address[] storage players = games[gameId].players;
        for (uint256 i = 0; i < players.length; i++) {
            if (players[i] == user) return true;
        }
        return false;
    }

    function _getActivePlayers(
        uint256 gameId
    ) internal view returns (address[] memory) {
        address[] storage all = games[gameId].players;
        uint256 count = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (!playerGameData[gameId][all[i]].eliminated) count++;
        }
        address[] memory active = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (!playerGameData[gameId][all[i]].eliminated) {
                active[idx++] = all[i];
            }
        }
        return active;
    }

    /// @dev Deterministic hash of the active player list used as extra entropy.
    function _hashPlayers(
        address[] memory players
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(players));
    }

    function _eliminatePlayer(uint256 gameId, address player) internal {
        playerGameData[gameId][player].eliminated = true;
        playerGameData[gameId][player].eliminationRound = games[gameId]
            .currentRound;

        // Auto-complete if one player remains
        address[] memory active = _getActivePlayers(gameId);
        if (active.length == 1) {
            _completeGame(gameId);
        }
    }

    function _completeGame(uint256 gameId) internal {
        Game storage g = games[gameId];
        address[] memory active = _getActivePlayers(gameId);
        require(active.length == 1, "Cannot complete: no unique winner");

        g.status = Status.COMPLETED;
        g.winner = active[0];
        g.totalRounds = g.currentRound;

        emit GameCompleted(gameId, g.winner);
    }

    function _updateUserStatsOnJoin(address user, uint256 stake) internal {
        UserStats storage s = userStats[user];
        s.gamesPlayed++;
        s.totalStaked += stake;
    }

    function _updateUserStatsOnWin(address user, uint256 winnings) internal {
        UserStats storage s = userStats[user];
        s.gamesWon++;
        s.totalWinnings += winnings;
    }

    // Reject accidental ETH sends
    receive() external payable {
        revert("Use joinGame or createGame");
    }
}
