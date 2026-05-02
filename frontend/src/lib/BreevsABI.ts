// ABI for BreevsRussianRoulette – Celo Solidity contract
export const BREEVS_ABI = [
  // ─── Constructor ────────────────────────────────────────────────────────────
  {
    inputs: [{ internalType: "address", name: "_randomContractAddress", type: "address" }],
    stateMutability: "nonpayable",
    type: "constructor",
  },

  // ─── Events ─────────────────────────────────────────────────────────────────
  {
    anonymous: false,
    inputs: [{ indexed: true, internalType: "uint256", name: "gameId", type: "uint256" }],
    name: "GameCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "gameId", type: "uint256" },
      { indexed: false, internalType: "address", name: "player", type: "address" },
    ],
    name: "PlayerJoined",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, internalType: "uint256", name: "gameId", type: "uint256" }],
    name: "GameStarted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "gameId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "commitBlock", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "round", type: "uint256" },
    ],
    name: "SpinRequested",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "gameId", type: "uint256" },
      { indexed: false, internalType: "address", name: "player", type: "address" },
      { indexed: false, internalType: "uint256", name: "round", type: "uint256" },
    ],
    name: "PlayerEliminated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "gameId", type: "uint256" },
      { indexed: false, internalType: "address", name: "winner", type: "address" },
    ],
    name: "GameCompleted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "gameId", type: "uint256" },
      { indexed: false, internalType: "address", name: "winner", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "PrizeClaimed",
    type: "event",
  },

  // ─── Read functions ──────────────────────────────────────────────────────────
  {
    inputs: [],
    name: "gameCounter",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "games",
    outputs: [
      { internalType: "address", name: "creator", type: "address" },
      { internalType: "uint256", name: "stake", type: "uint256" },
      { internalType: "uint256", name: "prizePool", type: "uint256" },
      { internalType: "uint8", name: "status", type: "uint8" },
      { internalType: "uint256", name: "roundDuration", type: "uint256" },
      { internalType: "uint256", name: "roundEnd", type: "uint256" },
      { internalType: "uint256", name: "currentRound", type: "uint256" },
      { internalType: "address", name: "winner", type: "address" },
      { internalType: "uint256", name: "totalRounds", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "gameId", type: "uint256" }],
    name: "getActivePlayers",
    outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "gameId", type: "uint256" }],
    name: "getPendingSpin",
    outputs: [
      {
        components: [
          { internalType: "bool", name: "pending", type: "bool" },
          { internalType: "uint256", name: "commitBlock", type: "uint256" },
          { internalType: "uint256", name: "round", type: "uint256" },
        ],
        internalType: "struct BreevsRussianRoulette.SpinRequest",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "playerGameData",
    outputs: [
      { internalType: "bool", name: "eliminated", type: "bool" },
      { internalType: "uint256", name: "eliminationRound", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "prizeClaimed",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "userStats",
    outputs: [
      { internalType: "uint256", name: "gamesPlayed", type: "uint256" },
      { internalType: "uint256", name: "gamesWon", type: "uint256" },
      { internalType: "uint256", name: "totalWinnings", type: "uint256" },
      { internalType: "uint256", name: "totalStaked", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "celoRandomAddress",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "MIN_STAKE",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "MAX_PLAYERS",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "REVEAL_DELAY",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "playerDeposits",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "pendingSpins",
    outputs: [
      { internalType: "bool", name: "pending", type: "bool" },
      { internalType: "uint256", name: "commitBlock", type: "uint256" },
      { internalType: "uint256", name: "round", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },

  // ─── Write functions ─────────────────────────────────────────────────────────
  {
    inputs: [
      { internalType: "uint256", name: "stake", type: "uint256" },
      { internalType: "uint256", name: "roundDuration", type: "uint256" },
    ],
    name: "createGame",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "gameId", type: "uint256" }],
    name: "joinGame",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "gameId", type: "uint256" }],
    name: "startGame",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "gameId", type: "uint256" }],
    name: "requestSpin",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "gameId", type: "uint256" }],
    name: "resolveSpin",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "gameId", type: "uint256" }],
    name: "advanceRound",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "gameId", type: "uint256" }],
    name: "claimPrize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
