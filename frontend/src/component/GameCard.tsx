"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import Logo from "@/assets/RR_LOGO_1.png";
import { GameStatus, GameInfo } from "@/lib/contractCalls";
import { useIsGameCreator } from "@/hooks/useGame";
import { motion } from "framer-motion";
import { useGameStore } from "@/store/gameStore";
import { useAccount } from "wagmi";
import { showErrorToast } from "@/component/Toast";

interface GameCardProps {
  game: GameInfo;
  error?: string;
  clearError?: () => void;
  onClick?: () => void;
}

export default function GameCard({
  game,
  error,
  clearError,
  onClick,
}: GameCardProps) {
  const router = useRouter();
  const { address } = useAccount();
  const { hasActiveGame, getCurrentActiveGame, setSelectedGame } =
    useGameStore();
  const { data: isGameCreator } = useIsGameCreator(
    address ? game.gameId : 0n,
    address || ""
  );

  const isUserGame = address
    ? game.players.map((p) => p.toLowerCase()).includes(address.toLowerCase())
    : false;

  const isJoinDisabled = address
    ? hasActiveGame(address) && !isUserGame && !isGameCreator
    : false;

  const handleAction = async () => {
    if (!address) {
      showErrorToast("Please connect your wallet to interact", "Wallet Required");
      return;
    }

    const gameIdStr = game.gameId.toString();

    if (isJoinDisabled) {
      const activeGame = getCurrentActiveGame(address);
      if (activeGame) {
        showErrorToast(
          `You are already in an active game (#${activeGame.gameId}). Please complete it first.`,
          "Active Game"
        );
        router.push(`/GameScreen/${activeGame.gameId.toString()}`);
      }
      return;
    }

    if (isGameCreator || isUserGame || game.status !== GameStatus.Active) {
      router.push(`/GameScreen/${gameIdStr}`);
    } else if (game.status === GameStatus.Active && !isUserGame) {
      setSelectedGame(game);
      if (onClick) onClick();
    }
  };

  const stakeInCELO = Number(game.stake) / 1e18;

  const shortCreator =
    game.creator && game.creator.startsWith("0x")
      ? `${game.creator.slice(0, 6)}...${game.creator.slice(-4)}`
      : "Unknown";

  const getStatusLabel = (s: GameStatus | number) => {
    if (isGameCreator) return "Creator";
    switch (s) {
      case GameStatus.Active:
        return "Active";
      case GameStatus.InProgress:
        return "In Progress";
      case GameStatus.Ended:
        return "Ended";
      default:
        return "Unknown";
    }
  };

  const getStatusStyles = (s: GameStatus | number) => {
    if (isGameCreator) return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    return s === GameStatus.Active
      ? "bg-green-500/20 text-green-400 border-green-500/30"
      : s === GameStatus.InProgress
      ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
      : "bg-red-500/20 text-red-400 border-red-500/30";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{
        scale: isJoinDisabled ? 1 : 1.03,
        y: isJoinDisabled ? 0 : -5,
      }}
      whileTap={{ scale: isJoinDisabled ? 1 : 0.98 }}
      onClick={handleAction}
      className={`bg-gradient-to-br from-[#191F57]/90 to-[#0a1529]/90 backdrop-blur-md p-3 sm:p-5 border border-gray-700/50 rounded-2xl shadow-xl hover:shadow-2xl hover:shadow-red-500/20 transition-all duration-300 w-full group relative overflow-hidden ${
        isJoinDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/0 to-purple-500/0 group-hover:from-red-500/5 group-hover:to-purple-500/5 transition-all duration-300 rounded-2xl pointer-events-none" />
      {isJoinDisabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl pointer-events-none">
          <p className="text-xs text-white text-center">
            Complete your active game first
          </p>
        </div>
      )}
      <div className="flex flex-col h-full justify-between gap-3 sm:gap-3 relative z-10">
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] sm:text-xs text-gray-400 mb-1">
              Created by
            </p>
            <p className="text-xs sm:text-sm font-semibold text-white font-mono truncate bg-white/5 px-2 py-1 rounded border border-white/10 max-w-[120px]">
              {shortCreator}
            </p>
          </div>
          <div
            className={`flex-shrink-0 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full flex items-center gap-1 border backdrop-blur-sm ${getStatusStyles(game.status)}`}
          >
            <span className="text-[9px] sm:text-xs truncate max-w-[60px] sm:max-w-[100px]">
              {getStatusLabel(game.status)}
            </span>
          </div>
        </div>
        <div className="flex justify-center">
          <Image
            src={Logo}
            alt="Game Icon"
            className="hidden sm:block w-20 h-auto"
          />
        </div>
        <div className="text-center py-1 sm:py-3 bg-gradient-to-r from-red-500/10 via-purple-500/10 to-red-500/10 rounded-xl border border-red-500/20 group-hover:border-red-500/40 transition-all duration-300">
          <p className="text-xs text-gray-400 mb-1 sm:text-sm font-semibold">
            Stake to Win
          </p>
          <p className="text-lg sm:text-2xl font-bold text-[#FF3B3B] drop-shadow-lg">
            {game.stake > 0n
              ? `${stakeInCELO.toFixed(2)} CELO`
              : "Free Entry"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center text-[10px] sm:text-sm">
          <div className="bg-white/5 backdrop-blur-sm rounded-lg p-1 sm:p-3 border border-white/10 group-hover:bg-white/10 transition-all duration-300">
            <p className="text-xs text-gray-400">Players</p>
            <p className="text-md sm:text-lg font-bold text-white text-center">
              {game.playerCount}
              <span className="text-gray-400 text-sm">/6</span>
            </p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm rounded-lg p-1 sm:p-3 border border-white/10 group-hover:bg-white/10 transition-all duration-300">
            <p className="text-xs text-gray-400">Game ID</p>
            <p className="text-md sm:text-lg font-bold text-white text-center">
              #{game.gameId.toString()}
            </p>
          </div>
        </div>
        {error && clearError && (
          <div className="mt-2 p-3 bg-red-900/50 border border-red-500/50 rounded-lg backdrop-blur-sm">
            <div className="flex justify-between items-start gap-2">
              <p className="text-xs text-red-300 flex-1">{error}</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearError();
                }}
                className="text-red-300 hover:text-red-200 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
