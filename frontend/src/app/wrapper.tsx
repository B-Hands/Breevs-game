"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useGameStore } from "@/store/gameStore";
import { useMyGames } from "@/hooks/useGame";
import { ToastContainer } from "@/component/Toast";

interface AppWrapperProps {
  children: React.ReactNode;
}

export default function AppWrapper({ children }: AppWrapperProps) {
  const { isConnected } = useAccount();
  const { clearGames, clearCurrentGames } = useGameStore();
  const { data: myGames, isLoading, isError, error } = useMyGames();

  useEffect(() => {
    if (!isConnected) {
      console.log("Wallet disconnected, clearing game store");
      clearGames();
      clearCurrentGames();
    }
  }, [isConnected, clearGames, clearCurrentGames]);

  return (
    <>
      {children}
      <ToastContainer />
    </>
  );
}
