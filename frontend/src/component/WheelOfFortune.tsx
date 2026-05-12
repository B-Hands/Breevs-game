"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Open_Sans } from "next/font/google";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGameStatus,
  useIsGameCreator,
  useStartGame,
  useRequestSpin,
  useResolveSpin,
  useAdvanceRound,
  useClaimPrize,
  useIsPrizeClaimed,
  usePendingSpin,
} from "@/hooks/useGame";
import { GameStatus, getCeloBlockNumber, publicClient, CONTRACT_ADDRESS, BREEVS_ABI } from "@/lib/contractCalls";
import { formatEther, parseAbiItem } from "viem";
import BackgroundImgBlur from "@/component/BackgroundBlur";
import Link from "next/link";
import StakeModal from "@/component/StakeModal";
import { useGameStore } from "@/store/gameStore";
import AICommentaryBox from "@/component/AICommentaryBox";

const openSans = Open_Sans({ subsets: ["latin"], weight: ["400", "700"] });

interface Player {
  name: string;
  address: string;
  status: "Still in" | "Eliminated";
  eliminatedInRound?: number;
}

interface WinnerAnnouncement {
  address: string;
  amount: string;
}

interface WheelOfFortuneProps {
  gameId: bigint;
}

const WheelOfFortune: React.FC<WheelOfFortuneProps> = ({ gameId }) => {
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [winners, setWinners] = useState<WinnerAnnouncement[]>([]);
  const [isStakeModalOpen, setIsStakeModalOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastEliminatedPlayer, setLastEliminatedPlayer] = useState<string | null>(null);
  // eliminatedMap: lowercaseAddr -> round number (populated from on-chain events)
  const [eliminatedMap, setEliminatedMap] = useState<Map<string, number>>(new Map());
  // stable name + address registry persisted across renders
  const playerInfoRef = useRef(new Map<string, { addr: string; name: string }>());
  const [currentBlockNumber, setCurrentBlockNumber] = useState<number>(0);
  const [showCommentary, setShowCommentary] = useState(false);
  const [commentaryTrigger, setCommentaryTrigger] = useState(0);

  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { setSelectedGame, updateGameStatus } = useGameStore();

  const {
    data: game,
    isLoading: isLoadingStatus,
    isError,
    error: gameError,
    refetch,
  } = useGameStatus(gameId);

  const { data: isGameCreator } = useIsGameCreator(gameId, address || "");
  const { data: pendingSpin } = usePendingSpin(gameId);

  const { mutateAsync: startGame, isPending: isStarting } = useStartGame();
  const { mutateAsync: requestSpin, isPending: isRequestingTx } = useRequestSpin();
  const { mutateAsync: resolveSpin, isPending: isResolvingTx } = useResolveSpin();
  const { mutateAsync: advanceRound, isPending: isAdvancing } = useAdvanceRound();
  const { mutateAsync: claimPrize, isPending: isClaiming } = useClaimPrize();
  const { data: isPrizeClaimed } = useIsPrizeClaimed(gameId, address || "");

  if (!gameId) {
    return (
      <BackgroundImgBlur>
        <div className="flex flex-col justify-center items-center min-h-screen text-red-400 px-4">
          <p className="text-base sm:text-lg">Invalid game ID</p>
          <Link
            href="/"
            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded text-sm sm:text-base"
          >
            Back to Home
          </Link>
        </div>
      </BackgroundImgBlur>
    );
  }

  // Build stable name registry from PlayerJoined events + fetch past eliminations
  useEffect(() => {
    if (!gameId || !game?.creator || currentBlockNumber === 0) return;
    const infoMap = playerInfoRef.current;
    // Use a recent window to avoid RPC block-range limits
    const fromBlock = BigInt(Math.max(0, currentBlockNumber - 50000));
    Promise.all([
      publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: parseAbiItem("event PlayerJoined(uint256 indexed gameId, address player)"),
        fromBlock,
        toBlock: "latest",
      }),
      publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: parseAbiItem("event PlayerEliminated(uint256 indexed gameId, address player, uint256 round)"),
        fromBlock,
        toBlock: "latest",
      }),
    ])
      .then(([joinLogs, elimLogs]) => {
        // Creator is always first player (index 0 → "Host")
        const creatorKey = game.creator.toLowerCase();
        if (!infoMap.has(creatorKey))
          infoMap.set(creatorKey, { addr: game.creator, name: "Host" });

        // Subsequent players in join order → "Player 2", "Player 3", …
        let joinIdx = 0;
        (joinLogs as any[]).forEach((log) => {
          if ((log.args.gameId as bigint) !== gameId) return;
          const addr: string = log.args.player;
          const key = addr.toLowerCase();
          if (!infoMap.has(key))
            infoMap.set(key, { addr, name: `Player ${joinIdx + 2}` });
          joinIdx++;
        });

        // Seed eliminated map from historical events
        const map = new Map<string, number>();
        (elimLogs as any[]).forEach((log) => {
          if ((log.args.gameId as bigint) !== gameId) return;
          const addr: string = log.args.player;
          const round: bigint = log.args.round;
          map.set(addr.toLowerCase(), Number(round));
          const key = addr.toLowerCase();
          if (!infoMap.has(key)) {
            const idx = infoMap.size;
            infoMap.set(key, { addr, name: `Player ${idx + 1}` });
          }
        });
        if (map.size > 0) setEliminatedMap(map);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, game?.creator, currentBlockNumber === 0]);

  const updatePlayers = useCallback(() => {
    if (!game) return;
    const infoMap = playerInfoRef.current;

    // Also register any active players we haven't seen yet
    game.players.forEach((addr, index) => {
      const key = addr.toLowerCase();
      if (!infoMap.has(key)) {
        const isCreator = game.creator && addr.toLowerCase() === game.creator.toLowerCase();
        infoMap.set(key, {
          addr,
          name: isCreator ? "Host" : `Player ${index + 1}`,
        });
      }
    });

    // All unique player keys: combine active list + event-tracked eliminated
    // eliminatedMap takes priority — a player in it is always "Eliminated"
    // regardless of whether stale game.players still includes them
    const activeLower = game.players.map((a) => a.toLowerCase());
    const elimKeys = [...eliminatedMap.keys()];
    const allKeys = [...new Set([...activeLower, ...elimKeys])];

    const formattedPlayers: Player[] = allKeys.map((key) => {
      const info = infoMap.get(key);
      const addr = info?.addr ?? game.players.find((a) => a.toLowerCase() === key) ?? key;
      const name = info?.name ?? "Player ?";
      // eliminatedMap wins over game.players — handles stale RPC data
      const isEliminated = eliminatedMap.has(key);
      const eliminationRound = eliminatedMap.get(key);

      if (game.status === GameStatus.Ended && game.winner) {
        const isWinner = key === game.winner.toLowerCase();
        return {
          name,
          address: addr,
          status: (isWinner ? "Still in" : "Eliminated") as "Still in" | "Eliminated",
          eliminatedInRound: !isWinner ? (eliminationRound ?? game.currentRound) : undefined,
        };
      }

      return {
        name,
        address: addr,
        status: (isEliminated ? "Eliminated" : "Still in") as "Still in" | "Eliminated",
        eliminatedInRound: eliminationRound,
      };
    });

    setPlayers(formattedPlayers);
    if (game.status === GameStatus.Ended && game.winner) {
      const winnerPlayer = formattedPlayers.find(
        (p) => p.address.toLowerCase() === game.winner?.toLowerCase()
      );
      if (winnerPlayer) setWinner(winnerPlayer.name);
    }
  }, [game, eliminatedMap]);

  useEffect(() => { updatePlayers(); }, [updatePlayers]);

  // Fetch Celo block number
  useEffect(() => {
    let isMounted = true;
    const fetch = async () => {
      try {
        const n = await getCeloBlockNumber();
        if (isMounted) setCurrentBlockNumber(n);
      } catch {}
    };
    fetch();
    const iv = setInterval(fetch, 5000); // Celo Sepolia ~5s blocks
    return () => { isMounted = false; clearInterval(iv); };
  }, []);

  // Count-down timer
  useEffect(() => {
    if (!game?.roundEnd || game.status !== GameStatus.InProgress || currentBlockNumber === 0) {
      setTimeLeft(0); return;
    }
    const blocksRemaining = Math.max(0, Number(game.roundEnd) - currentBlockNumber);
    setTimeLeft(blocksRemaining * 5); // ~5s per Celo block
  }, [game?.roundEnd, game?.status, currentBlockNumber]);

  // Auto-clear status messages
  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(null), 8000); return () => clearTimeout(t); }
  }, [error]);
  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(null), 5000); return () => clearTimeout(t); }
  }, [success]);

  // Watch for live PlayerEliminated events
  useEffect(() => {
    const unwatch = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: BREEVS_ABI,
      eventName: "PlayerEliminated",
      onLogs: (logs: any[]) => {
        logs.forEach((log: any) => {
          const args = log.args as { gameId: bigint; player: string; round: bigint };
          if (args.gameId === gameId) {
            setLastEliminatedPlayer(args.player);
            setEliminatedMap((prev) => {
              const next = new Map(prev);
              next.set(args.player.toLowerCase(), Number(args.round));
              return next;
            });
            const key = args.player.toLowerCase();
            if (!playerInfoRef.current.has(key)) {
              const idx = playerInfoRef.current.size;
              playerInfoRef.current.set(key, { addr: args.player, name: `Player ${idx + 1}` });
            }
          }
        });
      },
    });
    return () => unwatch();
  }, [gameId]);

  // Watch for PrizeClaimed events
  useEffect(() => {
    const unwatch = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: BREEVS_ABI,
      eventName: "PrizeClaimed",
      onLogs: (logs: any[]) => {
        logs.forEach((log: any) => {
          const args = log.args as { gameId: bigint; winner: string; amount: bigint };
          if (args.gameId === gameId) {
            setWinners((prev) => [
              ...prev,
              {
                address: args.winner,
                amount: `${formatEther(args.amount)} CELO`,
              },
            ]);
          }
        });
      },
    });
    return () => unwatch();
  }, [gameId]);

  useEffect(() => {
    if (winners.length > 0) {
      const iv = setInterval(() => {
        setWinners((prev) => { const n = [...prev]; n.push(n.shift()!); return n; });
      }, 3000);
      return () => clearInterval(iv);
    }
  }, [winners]);

  const showError = (msg: string) => { setError(msg); setIsProcessing(false); };
  const showSuccess = (msg: string) => setSuccess(msg);

  const refreshGameState = async () => {
    try {
      await refetch();
      if (game) updateGameStatus(game.gameId, game.status);
    } catch {}
  };

  const startGameAction = async () => {
    if (isProcessing || isStarting) return;
    setError(null); setIsProcessing(true);
    try {
      if (game?.status !== GameStatus.Active) throw new Error("Game is not waiting for players");
      if (game?.playerCount !== 6) throw new Error(`Need exactly 6 players. Currently ${game.playerCount}/6.`);
      if (address?.toLowerCase() !== game?.creator.toLowerCase()) throw new Error("Only the game creator can start");
      showSuccess("🎮 Starting game...");
      await startGame({ gameId });
      await refreshGameState();
      showSuccess("🎮 Game started! Round 1 begins!");
      setIsProcessing(false);
      setShowCommentary(true);
      setCommentaryTrigger((n) => n + 1);
    } catch (err: any) {
      showError(err.message || "Failed to start game");
    }
  };

  // Two-step spin: requestSpin
  const requestSpinAction = async () => {
    if (isSpinning || isRequestingTx || isProcessing || winner) return;
    setError(null); setIsProcessing(true);
    try {
      if (game?.status !== GameStatus.InProgress) throw new Error("Game is not in progress");
      if (game?.playerCount <= 1) throw new Error("Not enough players to spin");
      if (address?.toLowerCase() !== game?.creator.toLowerCase()) throw new Error("Only the game creator can spin");
      if (game?.roundEnd && currentBlockNumber > 0 && currentBlockNumber >= Number(game.roundEnd))
        throw new Error("Round has expired. Please advance to the next round.");
      if (pendingSpin?.pending) throw new Error("A spin is already pending – resolve it first.");

      showSuccess("🎡 Requesting spin...");
      await requestSpin({ gameId });
      showSuccess("⌛ Spin requested! Wait 1 block, then click Resolve Spin.");
      setIsProcessing(false);
    } catch (err: any) {
      showError(err.message || "Failed to request spin");
    }
  };

  // Two-step spin: resolveSpin
  const resolveSpinAction = async () => {
    if (isResolvingTx || isProcessing || winner) return;
    setError(null); setIsProcessing(true);
    try {
      if (!pendingSpin?.pending) throw new Error("No pending spin to resolve");
      if (currentBlockNumber > 0 && currentBlockNumber <= Number(pendingSpin.commitBlock))
        throw new Error("Still waiting for RANDAO reveal – wait 1 more block.");

      setIsSpinning(true);
      showSuccess("🎡 Resolving spin...");

      await resolveSpin({ gameId });

      // Animate the wheel
      const totalSpins = 5 + Math.random() * 3;
      const finalAngle = 360 * totalSpins;
      let cur = rotation;
      const steps = 80;
      for (let i = 0; i <= steps; i++) {
        await new Promise((res) => setTimeout(res, 60));
        const prog = i / steps;
        cur += (finalAngle / steps) * (1 - prog * 0.7);
        setRotation(cur);
      }

      await refreshGameState();
      setIsSpinning(false);
      setIsProcessing(false);
      setShowCommentary(true);
      setCommentaryTrigger((n) => n + 1);
      showSuccess("❌ Player eliminated!");
    } catch (err: any) {
      showError(err.message || "Failed to resolve spin");
      setIsSpinning(false);
    }
  };

  const advanceRoundAction = async () => {
    if (isProcessing || isAdvancing || winner) return;
    setError(null); setIsProcessing(true);
    try {
      if (game?.status !== GameStatus.InProgress) throw new Error("Game is not in progress");
      if (address?.toLowerCase() !== game?.creator.toLowerCase()) throw new Error("Only the game creator can advance");
      if (game?.roundEnd && currentBlockNumber > 0 && currentBlockNumber < Number(game.roundEnd)) {
        const left = Number(game.roundEnd) - currentBlockNumber;
        throw new Error(`Round hasn't expired yet. ~${left} blocks remaining.`);
      }
      showSuccess("⏭️ Advancing to next round...");
      await advanceRound({ gameId });
      await refreshGameState();
      showSuccess(`⏭️ Round ${(game?.currentRound || 0) + 1} started!`);
      setIsProcessing(false);
    } catch (err: any) {
      showError(err.message || "Failed to advance round");
    }
  };

  const claimPrizeAction = async () => {
    if (isProcessing || isClaiming) return;
    setError(null); setIsProcessing(true);
    try {
      if (game?.status !== GameStatus.Ended) throw new Error("Game has not ended yet");
      if (address?.toLowerCase() !== game?.winner?.toLowerCase()) throw new Error("Only the winner can claim");
      if (isPrizeClaimed) throw new Error("Prize already claimed");
      showSuccess("🏆 Claiming your prize...");
      await claimPrize({ gameId, user: address! });
      await refreshGameState();
      if (address && game) {
        setWinners((prev) => [
          ...prev,
          { address, amount: `${(Number(game.prizePool) / 1e18).toFixed(2)} CELO` },
        ]);
      }
      showSuccess(`🎉 Prize of ${(Number(game?.prizePool) / 1e18).toFixed(2)} CELO claimed!`);
      setIsProcessing(false);
    } catch (err: any) {
      showError(err.message || "Failed to claim prize");
    }
  };

  const handleJoinGame = () => {
    if (game) { setSelectedGame(game); setIsStakeModalOpen(true); }
  };

  const isCreator = !!address && !!game?.creator && address.toLowerCase() === game.creator.toLowerCase();

  const getGameStatusText = () => {
    if (!game || isLoadingStatus) return "Loading...";
    switch (game.status) {
      case GameStatus.Active:
        return game.playerCount === 6 ? "Ready to Start" : `Waiting for Players (${game.playerCount}/6)`;
      case GameStatus.InProgress: return `In Progress – Round ${game.currentRound}`;
      case GameStatus.Ended: return "Game Ended";
      default: return "Unknown";
    }
  };

  const canStartGame = () =>
    !!game && isConnected && !!address && !!game.creator &&
    game.status === GameStatus.Active &&
    game.playerCount === 6 &&
    address.toLowerCase() === game.creator.toLowerCase() &&
    !isProcessing && !isStarting;

  const canRequestSpin = () =>
    game?.status === GameStatus.InProgress &&
    game?.playerCount > 1 &&
    isConnected &&
    address?.toLowerCase() === game?.creator.toLowerCase() &&
    !pendingSpin?.pending &&
    !isSpinning && !isRequestingTx && !isProcessing &&
    (currentBlockNumber === 0 || currentBlockNumber <= Number(game?.roundEnd));

  const canResolveSpin = () =>
    game?.status === GameStatus.InProgress &&
    !!pendingSpin?.pending &&
    isConnected &&
    (currentBlockNumber === 0 || currentBlockNumber > Number(pendingSpin?.commitBlock));

  const canAdvanceRound = () =>
    game?.status === GameStatus.InProgress &&
    isConnected &&
    address?.toLowerCase() === game?.creator.toLowerCase() &&
    currentBlockNumber > 0 &&
    currentBlockNumber > Number(game?.roundEnd) &&
    !pendingSpin?.pending &&
    !isAdvancing && !isProcessing;

  const canClaimPrize = () =>
    game?.status === GameStatus.Ended &&
    isConnected &&
    address?.toLowerCase() === game?.winner?.toLowerCase() &&
    !isClaiming && !isProcessing && !isPrizeClaimed;

  const canJoinGame = () =>
    game?.status === GameStatus.Active &&
    isConnected &&
    address &&
    !game.players.map((p) => p.toLowerCase()).includes(address.toLowerCase()) &&
    game.playerCount < 6;

  if (isLoadingStatus || isError) {
    return (
      <BackgroundImgBlur>
        <div className="flex flex-col justify-center items-center min-h-screen text-white px-4">
          {isLoadingStatus && <div className="text-lg sm:text-xl animate-pulse">Loading game...</div>}
          {isError && (
            <>
              <p className="text-red-400 text-sm sm:text-base text-center">
                Error: {gameError?.message || "Failed to load game"}
              </p>
              <button
                onClick={() => refetch()}
                className="mt-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded text-sm sm:text-base"
              >
                Retry
              </button>
            </>
          )}
        </div>
      </BackgroundImgBlur>
    );
  }

  if (!address) {
    return (
      <BackgroundImgBlur>
        <div className="flex flex-col justify-center items-center min-h-screen text-white px-4 gap-4">
          <p className="text-yellow-300 text-sm sm:text-base text-center">
            Please connect your wallet to view the game
          </p>
          <button
            onClick={() => openConnectModal?.()}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg"
          >
            Connect Wallet
          </button>
        </div>
      </BackgroundImgBlur>
    );
  }

  return (
    <BackgroundImgBlur>
      <div className={`${openSans.className} w-full h-screen overflow-hidden flex flex-col`}>
        <StakeModal
          isOpen={isStakeModalOpen}
          onClose={() => { setIsStakeModalOpen(false); setSelectedGame(null); }}
          onSuccess={() => { setIsStakeModalOpen(false); refetch(); }}
        />

        {/* Top bar */}
        <div className="w-full bg-gradient-to-r from-[#030b1f] via-[#0a1529] to-[#030b1f] border-b border-red-500/20 py-3 px-4 sm:px-6 flex-shrink-0">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="text-center sm:text-left">
              <h1 className="text-xl text-white sm:text-2xl lg:text-3xl font-bold">
                <span className="text-[#FF3B3B]">WIN</span> or LOSE
              </h1>
              <p className="text-xs sm:text-sm text-gray-300">
                Last man standing{" "}
                <span className="text-[#FF3B3B] font-bold">WINS BIG!</span>
              </p>
            </div>
            {winners.length > 0 && (
              <motion.div
                key={winners[0].address}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-gradient-to-r from-purple-900/40 to-red-900/40 backdrop-blur-sm rounded-lg px-3 py-2 border border-red-500/30"
              >
                <p className="text-xs text-gray-400">Latest Winner</p>
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  <span className="text-white font-mono">
                    {winners[0].address.slice(0, 6)}...{winners[0].address.slice(-4)}
                  </span>
                  <span className="text-gray-400">won</span>
                  <span className="text-[#FF3B3B] font-bold">{winners[0].amount}</span>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Status toasts */}
        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-full mx-4"
            >
              <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 py-3 rounded-lg shadow-2xl border border-green-400/50">
                <p className="text-sm font-semibold text-center">{success}</p>
              </div>
            </motion.div>
          )}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-full mx-4"
            >
              <div className="bg-gradient-to-r from-red-600 to-rose-600 text-white px-4 py-3 rounded-lg shadow-2xl border border-red-400/50">
                <div className="flex justify-between items-start gap-2">
                  <p className="text-sm font-semibold flex-1">{error}</p>
                  <button onClick={() => setError(null)} className="text-white hover:text-gray-200 font-bold text-lg">×</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Russian Roulette AI — auto-pops on game events */}
        {showCommentary && (
          <AICommentaryBox
            gameId={gameId}
            eventTrigger={commentaryTrigger}
            onClose={() => setShowCommentary(false)}
            currentRound={game?.currentRound}
            activePlayers={game?.playerCount}
            totalPlayers={6}
            eliminatedCount={eliminatedMap.size}
            lastEliminatedAddress={lastEliminatedPlayer}
            prizePool={game ? (Number(game.prizePool) / 1e18).toFixed(2) : undefined}
          />
        )}

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">

              {/* Left panel – game info & actions */}
              <div className="lg:col-span-4 xl:col-span-3">
                <div className="bg-gradient-to-br from-[#030b1f]/95 to-[#0a1529]/95 backdrop-blur-md rounded-xl border border-red-500/20 p-4 shadow-xl sticky top-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base sm:text-lg font-bold text-white">
                      Game #{gameId.toString()}
                    </h2>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        game?.status === GameStatus.Active
                          ? "bg-yellow-500/20 text-yellow-400"
                          : game?.status === GameStatus.InProgress
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {getGameStatusText()}
                    </span>
                  </div>

                  {isGameCreator && (
                    <div className="mb-3 p-2 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                      <p className="text-xs text-purple-300 font-semibold">🎮 You are the Game Host</p>
                    </div>
                  )}

                  {/* Pending spin indicator */}
                  {pendingSpin?.pending && (
                    <>
                      {/* Waiting for 1 block */}
                      {currentBlockNumber > 0 && currentBlockNumber <= Number(pendingSpin.commitBlock) && (
                        <div className="mb-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg text-center">
                          <p className="text-xs text-orange-300 font-semibold">⌛ Waiting for RANDAO reveal…</p>
                          <p className="text-[10px] text-gray-400 mt-1">1 more block (~5 sec)</p>
                        </div>
                      )}
                      {/* Ready to resolve — big pulsing button */}
                      {(currentBlockNumber === 0 || currentBlockNumber > Number(pendingSpin.commitBlock)) && (
                        <button
                          onClick={resolveSpinAction}
                          disabled={isResolvingTx || isProcessing}
                          className="mb-3 w-full py-3 rounded-xl font-bold text-base text-white animate-pulse bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 shadow-lg shadow-green-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:animate-none"
                        >
                          {isResolvingTx || isProcessing ? "⏳ Resolving..." : "🎯 GO! — Resolve Spin"}
                        </button>
                      )}
                    </>
                  )}

                  {game?.status === GameStatus.InProgress && game.roundEnd && (
                    <div className="mb-3 p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <p className="text-xs text-gray-400">Round Time Left</p>
                      <p className={`text-xl font-bold ${timeLeft <= 60 && timeLeft > 0 ? "text-red-400 animate-pulse" : "text-blue-400"}`}>
                        {timeLeft > 0 ? `${Math.floor(timeLeft / 60)}m ${timeLeft % 60}s` : "Expired"}
                      </p>
                      {timeLeft === 0 && <p className="text-xs text-yellow-300 mt-1">⏰ Round expired – Advance!</p>}
                    </div>
                  )}

                  {game && (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-white/5 rounded-lg p-2 border border-white/10">
                        <p className="text-xs text-gray-400">Stake</p>
                        <p className="text-sm font-bold text-white">
                          {(Number(game.stake) / 1e18).toFixed(2)} CELO
                        </p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2 border border-white/10">
                        <p className="text-xs text-gray-400">Players</p>
                        <p className="text-sm font-bold text-white">{game.playerCount}/6</p>
                      </div>
                      <div className="col-span-2 bg-gradient-to-r from-[#FF3B3B]/20 to-purple-500/20 rounded-lg p-2 border border-[#FF3B3B]/30">
                        <p className="text-xs text-gray-400">Prize Pool</p>
                        <p className="text-lg sm:text-xl font-bold text-[#FF3B3B]">
                          {formatEther(game.prizePool)} CELO
                        </p>
                      </div>
                    </div>
                  )}

                  {!isConnected && (
                    <div className="mb-3 p-2 bg-yellow-900/30 border border-yellow-500/50 rounded-lg">
                      <p className="text-xs text-yellow-300">Connect wallet to interact</p>
                    </div>
                  )}

                  {/* Non-creator player info */}
                  {isConnected && !isCreator && game?.status === GameStatus.Active && game.playerCount === 6 && (
                    <div className="mb-3 p-3 bg-blue-900/30 border border-blue-500/40 rounded-lg">
                      <p className="text-xs text-blue-200 text-center">
                        ⏳ Waiting for the <span className="font-bold text-white">Host</span> to start the game.
                      </p>
                    </div>
                  )}
                  {isConnected && !isCreator && game?.status === GameStatus.InProgress && (
                    <div className="mb-3 p-3 bg-purple-900/30 border border-purple-500/40 rounded-lg">
                      <p className="text-xs text-purple-200 text-center">
                        🎡 The <span className="font-bold text-white">Host</span> controls the spin.<br/>
                        Watch the wheel — you could be eliminated!
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {canJoinGame() && (
                      <button
                        onClick={handleJoinGame}
                        className="block w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white font-bold py-2 px-4 rounded-lg text-center transition-all text-sm shadow-lg"
                      >
                        🎯 Join Game (1 CELO)
                      </button>
                    )}
                    {canStartGame() && (
                      <button
                        onClick={startGameAction}
                        disabled={isStarting || isProcessing}
                        className={`w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white font-bold py-2 px-4 rounded-lg transition-all text-sm shadow-lg ${isStarting || isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {isStarting || isProcessing ? "Starting..." : "🎮 Start Game"}
                      </button>
                    )}
                    {canRequestSpin() && (
                      <button
                        onClick={requestSpinAction}
                        disabled={isRequestingTx || isProcessing}
                        className={`w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-all text-sm shadow-lg ${isRequestingTx || isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {isRequestingTx || isProcessing ? "Requesting..." : "🎡 Request Spin"}
                      </button>
                    )}
                    {canResolveSpin() && (
                      <button
                        onClick={resolveSpinAction}
                        disabled={isResolvingTx || isProcessing}
                        className={`w-full bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white font-bold py-2 px-4 rounded-lg transition-all text-sm shadow-lg ${isResolvingTx || isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {isResolvingTx || isProcessing ? "Resolving..." : "🎯 Resolve Spin"}
                      </button>
                    )}
                    {canAdvanceRound() && (
                      <button
                        onClick={advanceRoundAction}
                        disabled={isAdvancing || isProcessing}
                        className={`w-full bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-700 hover:to-yellow-600 text-white font-bold py-2 px-4 rounded-lg transition-all text-sm shadow-lg ${isAdvancing || isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {isAdvancing || isProcessing ? "Advancing..." : "⏭️ Advance Round"}
                      </button>
                    )}
                    {canClaimPrize() && (
                      <button
                        onClick={claimPrizeAction}
                        disabled={isClaiming || isProcessing || !!isPrizeClaimed}
                        className={`w-full bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600 text-white font-bold py-2 px-4 rounded-lg transition-all text-sm shadow-lg ${isClaiming || isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {isClaiming || isProcessing ? "Claiming..." : "🏆 Claim Prize"}
                      </button>
                    )}
                    {isPrizeClaimed && game?.status === GameStatus.Ended && address?.toLowerCase() === game?.winner?.toLowerCase() && (
                      <div className="p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                        <p className="text-xs text-green-300 text-center">✅ Prize Already Claimed</p>
                      </div>
                    )}

                    {/* Re-open AI commentary if user closed it */}
                    {game?.status === GameStatus.InProgress && !showCommentary && (
                      <button
                        onClick={() => { setShowCommentary(true); setCommentaryTrigger((n) => n + 1); }}
                        className="w-full bg-gradient-to-r from-red-900/60 to-violet-900/60 hover:brightness-110 text-white font-bold py-2 px-4 rounded-lg transition-all text-sm border border-red-500/30 flex items-center justify-center gap-2"
                      >
                        🎰 Russian Roulette AI
                      </button>
                    )}
                  </div>

                  {isProcessing && (
                    <div className="mt-3 p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-xs text-blue-300">Processing transaction...</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Centre – Wheel */}
              <div className="lg:col-span-4 xl:col-span-5 flex items-center justify-center">
                <div className="relative w-full max-w-sm aspect-square sticky top-4">
                  <motion.div
                    className={`w-full h-full rounded-full border-8 border-red-500 flex items-center justify-center shadow-2xl ${isSpinning || isRequestingTx || isProcessing ? "pointer-events-none" : ""}`}
                    animate={{ rotate: rotation }}
                    transition={{ ease: "linear", duration: 0.1 }}
                    style={{
                      filter: isSpinning ? "blur(2px)" : "none",
                      background: "radial-gradient(circle, rgba(255,59,59,0.1) 0%, rgba(3,11,31,0.9) 70%)",
                    }}
                  >
                    <div
                      className={`absolute w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center font-bold text-base sm:text-lg shadow-2xl z-10 cursor-pointer transition-all ${
                        canRequestSpin()
                          ? "bg-white text-black hover:bg-gray-200 hover:scale-110"
                          : canResolveSpin()
                          ? "bg-green-400 text-black hover:bg-green-300 hover:scale-110"
                          : canStartGame()
                          ? "bg-yellow-400 text-black hover:bg-yellow-300 hover:scale-110"
                          : "bg-gray-600 text-gray-400 cursor-not-allowed"
                      }`}
                      onClick={
                        canResolveSpin() ? resolveSpinAction
                        : canRequestSpin() ? requestSpinAction
                        : canStartGame() ? startGameAction
                        : undefined
                      }
                    >
                      {isSpinning || isResolvingTx || isProcessing || isStarting
                        ? "..."
                        : canResolveSpin()
                        ? "GO!"
                        : canRequestSpin()
                        ? "SPIN"
                        : canStartGame()
                        ? "START"
                        : game?.status === GameStatus.InProgress && !isCreator
                        ? "LIVE"
                        : game?.status === GameStatus.Active && !isCreator
                        ? "WAIT"
                        : "SPIN"}
                    </div>
                    <div className="absolute w-full h-full flex flex-col items-center justify-center">
                      {players
                        .filter((p) => p.status === "Still in")
                        .map((player, index) => {
                          const remaining = players.filter((p) => p.status === "Still in").length;
                          const angle = index * (360 / remaining);
                          return (
                            <div
                              key={index}
                              className={`absolute w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-full font-semibold text-xs shadow-lg border-2 transition-all ${
                                lastEliminatedPlayer === player.address
                                  ? "bg-gradient-to-br from-gray-500 to-gray-700 text-white border-red-500/50 opacity-50"
                                  : "bg-gradient-to-br from-red-500 to-red-700 text-white border-white/30"
                              }`}
                              style={{ transform: `rotate(${angle}deg) translateY(-95px) rotate(-${angle}deg)` }}
                            >
                              {player.name}
                            </div>
                          );
                        })}
                    </div>
                  </motion.div>
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-20">
                    <div className="w-0 h-0 border-l-[14px] border-r-[14px] border-l-transparent border-r-transparent border-t-[28px] border-t-white drop-shadow-lg"></div>
                  </div>
                  {game?.status === GameStatus.InProgress && (
                    <div className="absolute -bottom-16 left-0 right-0 text-center">
                      <p className="text-sm text-gray-400">Current Round</p>
                      <p className="text-2xl font-bold text-white">{game.currentRound}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right panel – players */}
              <div className="lg:col-span-4">
                <div className="bg-gradient-to-br from-[#030b1f]/95 to-[#0a1529]/95 backdrop-blur-md rounded-xl border border-red-500/20 p-4 shadow-xl sticky top-4">
                  <h3 className="text-base sm:text-lg font-bold text-white mb-3">👥 Participants</h3>
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400 mb-2">Players ({game?.playerCount || 0}/6)</p>
                    {players.length === 0 && (
                      <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-400">Waiting for players to join...</p>
                      </div>
                    )}
                    {players.map((player, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 1 }}
                        animate={{ opacity: player.status === "Eliminated" ? 0.5 : 1 }}
                        className={`bg-white/5 border rounded-lg p-2 transition-all ${
                          player.status === "Eliminated" ? "border-red-500/30" : "border-green-500/30"
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <p className={`text-xs sm:text-sm font-semibold ${player.status === "Eliminated" ? "line-through text-gray-500" : "text-white"}`}>
                              {player.name}
                              {player.address.toLowerCase() === game?.creator.toLowerCase() && " (Host)"}
                            </p>
                            <p className="text-xs text-gray-400 font-mono mt-1">
                              {player.address.slice(0, 6)}...{player.address.slice(-4)}
                            </p>
                            {player.eliminatedInRound && (
                              <p className="text-xs text-red-400 mt-1">❌ Round {player.eliminatedInRound}</p>
                            )}
                            {address?.toLowerCase() === player.address.toLowerCase() && (
                              <p className="text-xs text-blue-300 mt-1">🫵 You</p>
                            )}
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full font-semibold whitespace-nowrap ${
                            player.status === "Still in"
                              ? "bg-green-500/20 text-green-400"
                              : "bg-red-500/20 text-red-400"
                          }`}>
                            {player.status}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {winner && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", bounce: 0.5 }}
                      className="mt-4 p-3 bg-gradient-to-r from-green-900/40 to-emerald-900/40 border border-green-500/50 rounded-lg"
                    >
                      <h3 className="text-base font-bold text-green-300 mb-1">🎉 Winner!</h3>
                      <p className="text-sm text-green-200">
                        {winner} wins {(Number(game?.prizePool) / 1e18).toFixed(2)} CELO!
                      </p>
                      {address?.toLowerCase() === game?.winner?.toLowerCase() && !isPrizeClaimed && (
                        <p className="text-xs text-yellow-300 mt-2">👆 Claim your prize above!</p>
                      )}
                    </motion.div>
                  )}

                  {game?.status === GameStatus.Active && isGameCreator && (
                    <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <p className="text-xs text-blue-300">
                        ℹ️ Waiting for 6 players. Once full, start the game!
                      </p>
                    </div>
                  )}

                  {game?.status === GameStatus.InProgress && isCreator && (
                    <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg space-y-1.5">
                      {canAdvanceRound() ? (
                        <p className="text-xs text-orange-300">
                          ⏰ Round expired — click <strong>Advance Round</strong> first, then <strong>Spin</strong>.
                        </p>
                      ) : (
                        <p className="text-xs text-yellow-300">
                          ℹ️ Click <strong>Spin</strong>, wait ~5 sec (1 block), then click <strong>GO!</strong> to eliminate a player.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </BackgroundImgBlur>
  );
};

export default WheelOfFortune;
