"use client";

import { useState, useEffect } from "react";
import { Open_Sans } from "next/font/google";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import Modal from "@/component/ResuableModal";
import GlowingEffect from "@/component/GlowingEffectProps";
import BackgroundImgBlur from "@/component/BackgroundBlur";
import GameCard from "@/component/GameCard";
import GameFilter from "@/component/GameFilter";
import CreateGameModal from "@/component/CreateGameModal";
import { useActiveGames, useMyGames, useGameStatus } from "@/hooks/useGame";
import { GameStatus, GameInfo } from "@/lib/contractCalls";
import { useGameStore } from "@/store/gameStore";

// ---------- Fonts ----------
const openSans = Open_Sans({ subsets: ["latin"], weight: ["400", "700"] });

// ---------- Main Page ----------
export default function HomePage() {
  const { isConnected, address } = useAccount();
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isCreateGameOpen, setIsCreateGameOpen] = useState(false);

  const {
    activeTab,
    setActiveTab,
    filters,
    setFilters,
    activeGames,
    setActiveGames,
    setMyGames,
  } = useGameStore();

  const { data: fetchedActiveGames = [], isLoading: isLoadingGames } =
    useActiveGames();
  const { data: fetchedMyGames = [], isLoading: isLoadingMyGames } =
    useMyGames();

  useEffect(() => {
    if (fetchedActiveGames.length > 0) {
      setActiveGames(fetchedActiveGames);
    }
  }, [fetchedActiveGames, setActiveGames]);

  useEffect(() => {
    if (fetchedMyGames.length > 0) {
      console.log("HomePage: Setting myGames in store:", fetchedMyGames);
      setMyGames(fetchedMyGames);
    }
  }, [fetchedMyGames, setMyGames]);

  // Filter active games based on store filters
  const filteredActiveGames = activeGames
    .filter((game) => {
      const stakeInStx = Number(game.stake) / 1_000_000;
      return (
        stakeInStx >= Number(filters.minStake) && game.status === filters.status
      );
    })
    .sort(() => {
      if (filters.sortBy === "newest") {
        return filters.sortOrder === "desc" ? -1 : 1;
      }
      return 0;
    });

  const isFiltersApplied =
    filters.sortBy !== "newest" ||
    filters.sortOrder !== "desc" ||
    filters.minStake !== "0" ||
    filters.status !== GameStatus.Active;

  return (
    <BackgroundImgBlur>
      <div className={`${openSans.className} relative w-full min-h-screen`}>
        {/* Header Section */}
        <div className="fixed top-0 rounded-lg z-50 left-1/2 transform -translate-x-1/2 mt-2 py-3 px-4 sm:px-8 transition-all duration-300 bg-[#030b1f] w-[95%] sm:w-auto">
          <h2 className="text-white text-xl sm:text-2xl mb-1 font-bold text-center">
            Welcome to <span className="text-red-500">Breevs</span>
          </h2>
          <p className="text-sm text-white text-center">
            Join the ultimate game of chance and strategy to
            <span className="text-red-500"> WIN BIG!!!</span>
          </p>
        </div>

        {/* Main Content */}
        <div className="pt-32 sm:pt-28 w-full max-w-screen-xl mx-auto px-4 pb-20">
          {/* Modals */}
          <CreateGameModal
            isOpen={isCreateGameOpen}
            onClose={() => setIsCreateGameOpen(false)}
          />

          <Modal isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)}>
            <div className="bg-[#0B1445] text-white text-center p-6 rounded-2xl">
              <GlowingEffect className="top-[63px] left-[47px]" />
              <h2 className="text-[25px] font-bold mb-4">Filter Games</h2>
              <div className="bg-[#0f1c5c] p-2 rounded-xl mb-6">
                <GameFilter
                  onFilterChange={(newFilters) => {
                    setFilters({
                      sortBy: newFilters.sortBy,
                      sortOrder: newFilters.sortOrder,
                      minStake: newFilters.minStake ?? "0",
                      status: newFilters.status ?? GameStatus.Active,
                    });
                    setIsFilterOpen(false);
                  }}
                />
              </div>
            </div>
          </Modal>

          {/* Tabs & Controls */}
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-6">
            <div className="bg-gray-800/80 backdrop-blur-sm rounded-xl p-1 inline-flex shadow-lg">
              {["active", "my-games"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as "active" | "my-games")}
                  className={`px-4 sm:px-8 py-2.5 rounded-lg transition-all duration-300 text-sm sm:text-base font-semibold ${
                    activeTab === tab
                      ? "bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg"
                      : "text-gray-400 hover:text-white hover:bg-gray-700/50"
                  }`}
                >
                  {tab === "active" ? "Active Games" : "My Games"}
                </button>
              ))}
            </div>

            {isConnected && activeTab === "active" && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsFilterOpen(true)}
                className="bg-gray-800/80 backdrop-blur-sm text-white px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-gray-700/80 text-sm sm:text-base font-semibold shadow-lg border border-gray-700/50 relative"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z"
                    clipRule="evenodd"
                  />
                </svg>
                Filter
                {isFiltersApplied && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 animate-pulse"></span>
                )}
              </motion.button>
            )}
          </div>

          {/* Game Grids */}
          {!isConnected ? (
            <div className="text-center py-10">
              <p className="text-gray-400 mb-4">
                Connect your wallet to create or join games.
              </p>
            </div>
          ) : isLoadingGames || isLoadingMyGames ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="bg-[#191F57CF] p-6 rounded-lg animate-pulse h-48"
                />
              ))}
            </div>
          ) : activeTab === "active" ? (
            <ActiveGamesGrid
              games={filteredActiveGames}
              setIsCreateGameOpen={setIsCreateGameOpen}
            />
          ) : (
            <MyGamesGrid address={address!} />
          )}
        </div>
      </div>
    </BackgroundImgBlur>
  );
}

// ---------- Active Games Grid ----------
function ActiveGamesGrid({
  games,
  setIsCreateGameOpen,
}: {
  games: GameInfo[];
  setIsCreateGameOpen: (open: boolean) => void;
}) {
  const router = useRouter();

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6"
        >
          {/* Create Game Button */}
          <motion.button
            whileHover={{ scale: 1.03, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsCreateGameOpen(true)}
            className="w-full border-2 border-dashed border-red-500/50 bg-gradient-to-br from-red-500/5 to-purple-500/5 backdrop-blur-sm text-white rounded-2xl hover:border-red-500 hover:bg-red-500/10 transition-all duration-300 flex flex-col items-center relative group p-5 shadow-lg hover:shadow-red-500/20"
          >
            <div className="flex flex-col items-center justify-center h-full gap-2 sm:gap-3">
              <div className="p-2 sm:p-3 rounded-full border-2 border-dashed border-red-500/50 group-hover:border-red-500 transition-all duration-300 group-hover:scale-110 bg-red-500/10">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 sm:h-8 sm:w-8 text-red-500"
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
              <div className="text-center">
                <span className="text-sm sm:text-base font-bold block mb-0.5 sm:mb-1">
                  Create New Game
                </span>
                <span className="text-xs text-gray-400">
                  Start your own game room
                </span>
              </div>
            </div>
          </motion.button>
          {/* Active Games */}
          {games.map((game, index) => (
            <motion.div
              key={game.gameId.toString()}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <GameDataLoader
                game={game}
                onClick={() => router.push(`/GameScreen/${game.gameId}`)}
              />
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>

      {games.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="col-span-full text-center py-20"
        >
          <div className="bg-gradient-to-br from-[#030b1f]/90 to-[#0a1529]/90 backdrop-blur-md rounded-2xl border border-gray-700/30 p-8 max-w-md mx-auto">
            <div className="w-16 h-16 bg-gray-700/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              No Games Found
            </h3>
            <p className="text-gray-400 text-sm">
              Create a new game to get started!
            </p>
          </div>
        </motion.div>
      )}
    </>
  );
}

// ---------- My Games Grid ----------
function MyGamesGrid({ address }: { address: string }) {
  const { data: fetchedMyGames, isLoading, error: myGamesError } = useMyGames();
  const setMyGames = useGameStore((state) => state.setMyGames);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (fetchedMyGames) {
      console.log("MyGamesGrid: Setting myGames in store:", fetchedMyGames);
      setMyGames(fetchedMyGames);
    }
  }, [fetchedMyGames, setMyGames]);

  const { myGames: storeMyGames } = useGameStore();

  const clearMyGamesError = () => {
    queryClient.resetQueries({ queryKey: ["myGames", address] });
  };

  if (isLoading)
    return (
      <div className="text-center py-10 text-gray-400">
        Loading your games...
      </div>
    );
  if (!storeMyGames?.length)
    return (
      <div className="text-center py-10 text-gray-400">No games found.</div>
    );

  const activeGames = storeMyGames.filter(
    (g) => g.status === GameStatus.Active || g.status === GameStatus.InProgress
  );
  const endedGames = storeMyGames.filter((g) => g.status === GameStatus.Ended);

  return (
    <div className="space-y-10">
      {myGamesError && (
        <div className="mb-4 p-2 bg-red-900 rounded text-red-300 text-sm">
          {myGamesError.message}
          <button
            onClick={clearMyGamesError}
            className="ml-2 text-red-200 hover:text-red-100"
          >
            ✕
          </button>
        </div>
      )}
      {activeGames.length > 0 && (
        <section>
          <h3 className="text-xl font-semibold text-white mb-4">
            Active Games
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {activeGames.map((game) => (
              <GameDataLoader
                key={game.gameId.toString()}
                game={game}
                onClick={() => router.push(`/GameScreen/${game.gameId}`)}
              />
            ))}
          </div>
        </section>
      )}

      {endedGames.length > 0 && (
        <section>
          <h3 className="text-xl font-semibold text-white mb-4">
            Completed Games
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {endedGames.map((game) => (
              <GameDataLoader
                key={game.gameId.toString()}
                game={game}
                onClick={() => router.push(`/GameScreen/${game.gameId}`)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------- Game Data Loader ----------
function GameDataLoader({
  game,
  onClick,
}: {
  game: GameInfo;
  onClick: () => void;
}) {
  const { data: fullGame, isLoading, error } = useGameStatus(game.gameId);
  const queryClient = useQueryClient();

  const clearError = () => {
    queryClient.resetQueries({
      queryKey: ["gameStatus", game.gameId.toString()],
    });
  };

  if (isLoading || !fullGame)
    return <div className="bg-[#191F57CF] p-6 rounded-lg animate-pulse h-48" />;

  return (
    <GameCard
      game={fullGame}
      error={error?.message}
      clearError={error ? clearError : undefined}
      onClick={onClick}
    />
  );
}
