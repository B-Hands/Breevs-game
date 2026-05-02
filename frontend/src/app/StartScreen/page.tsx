"use client";

import Image from "next/image";
import BackgroundImg from "../../component/BackgroundImg";
import Russian from "../../assets/RR_LOGO_2_1.png";
import Logo from "../../assets/BREEVS_logo_1.png";
import { useRouter } from "next/navigation";
import { Open_Sans, Spline_Sans_Mono } from "next/font/google";
import { useAccount } from "wagmi";
import WalletDisplay from "../../component/WalletDisplay";

const openSans = Open_Sans({ subsets: ["latin"], weight: ["400", "700"] });
const splineSansMono = Spline_Sans_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
});

const StartScreen: React.FC = () => {
  const router = useRouter();
  const { isConnected, address } = useAccount();

  const handleStart = () => {
    if (isConnected && address) {
      router.push("/Home");
    }
  };

  return (
    <BackgroundImg>
      <div
        className="
          flex flex-col items-center justify-center
          h-[100svh] w-screen
          overflow-hidden relative
          px-4
        "
      >
        {/* Logo */}
        <div className="flex flex-col relative mt-[-40px]">
          <Image
            src={Russian}
            alt="Russian Logo"
            className="w-[300px] sm:w-[250px] md:w-[280px] lg:w-[300px]"
          />
          <span
            className={`${splineSansMono.className} loading-text text-[17px] leading-[14.4px]
              absolute top-[73%] left-[40%] text-white z-40
            `}
          >
            loading
          </span>
        </div>

        {/* Wallet + Start Button */}
        <div className="flex flex-col items-center mt-10 space-y-6">
          <WalletDisplay showBalance={false} />
          {isConnected && (
            <div
              onClick={handleStart}
              className="z-40 bg-[#0161d5] rounded-full px-10 py-2 font-bold text-lg 
                shadow-2xl cursor-pointer transition-all duration-200 
                hover:shadow-xl hover:-translate-y-1 hover:bg-gray-100 hover:text-[#0161d5]
                active:scale-95 active:shadow-md relative"
            >
              Start
              <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent rounded-full pointer-events-none"></div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`${openSans.className}
            absolute bottom-4 right-4 z-40 flex items-center space-x-2 text-white font-bold
          `}
        >
          <span>Product of</span>
          <Image
            src={Logo}
            alt="Breevs Logo"
            className="w-24 opacity-80 brightness-150 contrast-125"
          />
        </div>
      </div>
    </BackgroundImg>
  );
};

export default StartScreen;
