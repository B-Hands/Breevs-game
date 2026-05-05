// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract BreevsRussianRoulette {
    // ─── Constants ───────────────────────────────────────────────────────────

    uint256 public constant MAX_PLAYERS = 6;
    uint256 public constant MIN_PLAYER_STAKE = 1e18; // Minimum stake: 1 CELO
    uint256 public constant MAX_PLAYER_STAKE = 1000e18; // Maximum stake: 1000 CELO
    uint256 public constant HOST_BALANCE_MULTIPLIER = 5; // Host wallet must hold >= 5x the player stake
    uint256 public constant MIN_ROUND_DURATION = 10; // blocks
    uint256 public constant MAX_ROUND_DURATION = 1000; // blocks

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

    // ─── State ───────────────────────────────────────────────────────────────

    uint256 public gameCounter;

    mapping(uint256 => Game) public games;
    mapping(uint256 => mapping(address => PlayerGameData))
        public playerGameData;
    mapping(uint256 => mapping(address => uint256)) public playerDeposits;
    mapping(uint256 => bool) public prizeClaimed;
    mapping(address => UserStats) public userStats;

    // ─── Events ──────────────────────────────────────────────────────────────

    event GameCreated(uint256 indexed gameId);
    event PlayerJoined(uint256 indexed gameId, address player);
    event GameStarted(uint256 indexed gameId);
    event PlayerEliminated(
        uint256 indexed gameId,
        address player,
        uint256 round
    );
    event GameCompleted(uint256 indexed gameId, address winner);
    event PrizeClaimed(uint256 indexed gameId, address winner, uint256 amount);

    // ─── Constructor ─────────────────────────────────────────────────────────

    // No constructor needed - no external dependencies

    // ═══════════════════════════════════════════════════════════════════════════
    //  GAME MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    function createGame(
        uint256 playerStake,
        uint256 roundDuration
    ) external payable returns (uint256) {
        require(
            playerStake >= MIN_PLAYER_STAKE && playerStake <= MAX_PLAYER_STAKE,
            "Stake must be between 1 and 1000 CELO"
        );
        require(
            roundDuration >= MIN_ROUND_DURATION &&
                roundDuration <= MAX_ROUND_DURATION,
            "Invalid duration"
        );

        // Host deposits the same stake as every other player
        require(
            msg.value == playerStake,
            "Host deposit must equal the player stake"
        );

        // Host wallet must hold at least 5x the player stake.
        // msg.value is added back because the EVM deducts it from sender
        // balance before this code runs.
        require(
            address(msg.sender).balance + msg.value >=
                HOST_BALANCE_MULTIPLIER * playerStake,
            "Host wallet must hold at least 5x the player stake"
        );

        gameCounter++;
        Game storage g = games[gameCounter];
        g.creator = msg.sender;
        g.stake = playerStake;
        g.prizePool = playerStake;
        g.status = Status.CREATED;
        g.roundDuration = roundDuration;

        g.players.push(msg.sender);
        playerGameData[gameCounter][msg.sender] = PlayerGameData(false, 0);
        playerDeposits[gameCounter][msg.sender] = playerStake;
        _updateUserStatsOnJoin(msg.sender, playerStake);

        emit GameCreated(gameCounter);
        return gameCounter;
    }

    function joinGame(uint256 gameId) external payable {
        Game storage g = games[gameId];
        require(g.status == Status.CREATED, "Game not joinable");
        require(g.players.length < MAX_PLAYERS, "Game is full");
        require(!_isUserInGame(gameId, msg.sender), "Already in game");
        require(msg.value == g.stake, "Must send exactly the game stake");

        g.players.push(msg.sender);
        g.prizePool += g.stake;
        playerGameData[gameId][msg.sender] = PlayerGameData(false, 0);
        playerDeposits[gameId][msg.sender] = g.stake;
        _updateUserStatsOnJoin(msg.sender, g.stake);

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
    //  SPIN — single-step random elimination
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Host spins the chamber. One active player is randomly eliminated
     *         immediately. The randomness is derived from block data available
     *         at the time of the call — simple and gas-efficient.
     *
     *         Must be called while the round window is still open.
     */
    function spin(uint256 gameId) external {
        Game storage g = games[gameId];
        require(msg.sender == g.creator, "Only host can spin");
        require(g.status == Status.IN_PROGRESS, "Game not in progress");
        require(block.number <= g.roundEnd, "Round has expired");

        address[] memory active = _getActivePlayers(gameId);
        require(active.length > 1, "Only one player left");

        // Random index derived from block data + game-specific values.
        // Not cryptographically unpredictable, but sufficient for a
        // social/entertainment game where the host triggers spins live.
        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(
                    blockhash(block.number - 1), // previous block hash
                    block.timestamp, // current block timestamp
                    gameId, // unique per game
                    g.currentRound, // unique per round
                    active.length, // number of players still alive
                    msg.sender // host address
                )
            )
        );

        uint256 victimIdx = seed % active.length;
        address victim = active[victimIdx];

        _eliminatePlayer(gameId, victim);
        emit PlayerEliminated(gameId, victim, g.currentRound);
    }

    /**
     * @notice Advance to the next round once the current round time has elapsed.
     *         If only one player remains the game completes automatically.
     */
    function advanceRound(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.status == Status.IN_PROGRESS, "Not in progress");
        require(block.number > g.roundEnd, "Round not ended yet");

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

    function getActivePlayers(
        uint256 gameId
    ) external view returns (address[] memory) {
        return _getActivePlayers(gameId);
    }

    function getGame(uint256 gameId) external view returns (Game memory) {
        return games[gameId];
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

    function _eliminatePlayer(uint256 gameId, address player) internal {
        playerGameData[gameId][player].eliminated = true;
        playerGameData[gameId][player].eliminationRound = games[gameId]
            .currentRound;

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

    receive() external payable {
        revert("Use joinGame or createGame");
    }
}
