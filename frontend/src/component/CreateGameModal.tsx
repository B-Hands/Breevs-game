"use client";

import Modal from "@/component/ResuableModal";
import GlowingEffect from "@/component/GlowingEffectProps";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { celoSepolia } from "wagmi/chains";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useCreateGame } from "@/hooks/useGame";
import { useGameStore } from "@/store/gameStore";
import { getGameInfo, MIN_STAKE } from "@/lib/contractCalls";
import { formatEther } from "viem";
import {
  showErrorToast,
  showSuccessToast,
  showTransactionToast,
} from "@/component/Toast";

interface CreateGameModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreateGameModal: React.FC<CreateGameModalProps> = ({
  isOpen,
  onClose,
}) => {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const { mutateAsync: createGame, isPending } = useCreateGame();
  const { setCurrentCreatorGame, getCurrentActiveGame, hasActiveGame } =
    useGameStore();
  const [switchError, setSwitchError] = useState<string | null>(null);

  const isWrongChain = isConnected && chainId !== celoSepolia.id;

  const FIXED_STAKE_CELO = formatEther(MIN_STAKE); // derived from contract constant
  const MAX_PLAYERS = 6;
  const ROUND_DURATION = 20n; // blocks (~2 min on Celo Sepolia)

  const handleSwitchChain = async () => {
    setSwitchError(null);
    try {
      await switchChainAsync({ chainId: celoSepolia.id });
    } catch {
      setSwitchError("Failed to switch network. Please switch manually in your wallet.");
    }
  };

  const handleCreateGame = async () => {
    if (!isConnected || !address) {
      if (openConnectModal) openConnectModal();
      return;
    }

    if (hasActiveGame(address)) {
      const activeGame = getCurrentActiveGame(address);
      showErrorToast(
        `You have an active game (#${activeGame?.gameId}). Please complete it first.`,
        "Active Game"
      );
      if (activeGame) {
        router.push(`/GameScreen/${activeGame.gameId.toString()}`);
      }
      onClose();
      return;
    }

    try {
      const { txId, gameId } = await createGame({
        duration: ROUND_DURATION,
      });

      showTransactionToast(
        txId,
        "success",
        `${celoSepolia.blockExplorers.default.url}/tx/${txId}`
      );

      const gameInfo = await getGameInfo(gameId);
      setCurrentCreatorGame(gameInfo);

      showSuccessToast("Game created successfully!", "Success");

      onClose();
      router.push(`/GameScreen/${gameId}`);
    } catch (err: any) {
      console.error("Create game error:", err);
      const errorMessage = err.message?.includes("rejected")
        ? "Transaction rejected by user"
        : err.message || "Failed to create game. Please try again.";
      showErrorToast(errorMessage, "Create Game Error");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-gradient-to-br from-[#0B1445] via-[#0a1529] to-[#0B1445] text-white p-4 sm:p-6 rounded-2xl border border-red-500/20 max-w-sm w-full mb-[80px]">
        <GlowingEffect className="top-[63px] left-[47px]" />

        {/* Header */}
        <div className="text-center mb-4">
          <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold mb-1">
            Create New Game
          </h2>
          <p className="text-xs text-gray-400">
            Start a new Russian Roulette room on Celo
          </p>
        </div>

        {/* Fixed Stake Display */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-[#FF3B3B] mb-2 text-center">
            Required Stake
          </label>
          <div className="bg-gradient-to-r from-gray-800/80 to-gray-900/80 backdrop-blur-sm p-4 rounded-xl border border-gray-700/50 text-center">
            <p className="text-3xl font-bold text-white">{FIXED_STAKE_CELO}</p>
            <p className="text-xs text-gray-400 mt-1 font-semibold">CELO</p>
          </div>
        </div>

        {/* Info Text */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4">
          <p className="text-xs text-blue-200 text-center">
            💡 Each player must stake{" "}
            <span className="text-[#FF3B3B] font-bold">{FIXED_STAKE_CELO} CELO</span> to join.
            Winner takes all {Number(FIXED_STAKE_CELO) * MAX_PLAYERS} CELO!
          </p>
        </div>

        {/* Host balance requirement */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4">
          <p className="text-xs text-yellow-200 text-center">
            ⚠️ Host wallet must hold at least{" "}
            <span className="text-yellow-300 font-bold">5 CELO</span>
          </p>
        </div>

        {/* Wrong Network Warning */}
        {isWrongChain && (
          <div className="mb-4 p-3 bg-red-900/40 border border-red-500/60 rounded-lg">
            <p className="text-xs text-red-300 text-center mb-2">
              Wrong network detected. This game runs on{" "}
              <span className="font-bold text-red-200">Celo Sepolia Testnet</span>.
            </p>
            {switchError && (
              <p className="text-xs text-red-400 text-center mb-2">{switchError}</p>
            )}
            <button
              className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-colors disabled:opacity-50"
              onClick={handleSwitchChain}
              disabled={isSwitching}
            >
              {isSwitching ? "Switching..." : "Switch to Celo Sepolia Testnet"}
            </button>
          </div>
        )}

        {/* Wallet Warning */}
        {!isConnected && (
          <div className="mb-4 p-2 bg-yellow-900/30 border border-yellow-500/50 rounded-lg">
            <p className="text-xs text-yellow-300 text-center">
              Please connect your wallet to proceed
            </p>
          </div>
        )}

        {/* Action Button */}
        <button
          className={`w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white font-bold py-2 px-4 rounded-xl transition-all duration-300 shadow-lg hover:shadow-red-500/50 ${
            isPending || !isConnected || isWrongChain
              ? "opacity-50 cursor-not-allowed"
              : "hover:scale-105"
          }`}
          onClick={handleCreateGame}
          disabled={isPending || isWrongChain}
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Creating Game...
            </span>
          ) : isConnected ? (
            "Create Game Room (0.1 CELO)"
          ) : (
            "Connect Wallet"
          )}
        </button>
      </div>
    </Modal>
  );
};

export default CreateGameModal;
