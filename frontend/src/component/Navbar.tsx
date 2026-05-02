"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Gamepad2, BarChart2, Wallet } from "lucide-react";
import { useGameStore } from "@/store/gameStore";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const { address } = useAccount();
  const { getCurrentActiveGame, myGames } = useGameStore();

  const getGameUrl = () => {
    if (!address) return "/Home";
    const activeGame = getCurrentActiveGame(address);
    if (activeGame) {
      return `/GameScreen/${activeGame.gameId.toString()}`;
    }
    return "/Home";
  };

  useEffect(() => {
    if (address) {
      const activeGame = getCurrentActiveGame(address);
      console.log("Navbar: Active Game:", activeGame);
      console.log("Navbar: myGames:", myGames);
    }
  }, [address, getCurrentActiveGame, myGames]);

  const navItems = [
    { href: "/Home", icon: Home, label: "Home" },
    { href: getGameUrl(), icon: Gamepad2, label: "Game" },
    { href: "/LeaderBoard", icon: BarChart2, label: "Leaderboard" },
    { href: "/Wallet", icon: Wallet, label: "Wallet" },
  ];

  return (
    <nav className="fixed bottom-0 w-full bg-[#121232] p-4 flex justify-around text-white z-50 border-t border-gray-800">
      {navItems.map(({ href, icon: Icon, label }) => {
        const isActive =
          pathname === href ||
          (href.startsWith("/GameScreen/") && pathname.startsWith("/GameScreen/"));

        return (
          <Link
            key={label}
            href={href}
            className={`relative flex flex-col items-center gap-1 transition-colors ${
              isActive ? "text-white" : "text-gray-400 hover:text-gray-300"
            }`}
          >
            <Icon size={24} />
            {isActive && (
              <div className="absolute bottom-[-15px] w-6 h-2 bg-red-500 rounded-full blur-[6px]" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
