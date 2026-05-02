"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AICommentaryBoxProps {
  gameId: bigint;
  isVisible: boolean;
  onClose: () => void;
}

interface Commentary {
  text: string;
  tensionLevel: number;
  timestamp: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default function AICommentaryBox({
  gameId,
  isVisible,
  onClose,
}: AICommentaryBoxProps) {
  const [commentary, setCommentary] = useState<Commentary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCommentary = async () => {
    setIsLoading(true);
    setError(null);
    setDisplayedText("");
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/games/${gameId.toString()}/generate_live_commentary/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch commentary");
      }

      const data = await response.json();
      const commentaryData: Commentary = {
        text: data.commentary_text,
        tensionLevel: data.tension_level,
        timestamp: data.created_at,
      };
      setCommentary(commentaryData);
      typewriterEffect(commentaryData.text);
    } catch (err: any) {
      setError(err.message || "Could not fetch commentary");
    } finally {
      setIsLoading(false);
    }
  };

  const typewriterEffect = (text: string) => {
    setIsTyping(true);
    setDisplayedText("");
    let i = 0;
    const speed = 18;

    const type = () => {
      if (i < text.length) {
        setDisplayedText((prev) => prev + text.charAt(i));
        i++;
        timerRef.current = setTimeout(type, speed);
      } else {
        setIsTyping(false);
      }
    };
    type();
  };

  useEffect(() => {
    if (isVisible && gameId > 0n) {
      fetchCommentary();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isVisible, gameId]);

  const getTensionColor = (level: number) => {
    if (level >= 8) return "text-red-400";
    if (level >= 5) return "text-orange-400";
    return "text-yellow-400";
  };

  const getTensionLabel = (level: number) => {
    if (level >= 9) return "CRITICAL";
    if (level >= 7) return "HIGH";
    if (level >= 5) return "MEDIUM";
    return "LOW";
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 60 }}
          transition={{ type: "spring", damping: 22, stiffness: 200 }}
          className="fixed bottom-24 right-4 z-50 w-80 sm:w-96"
        >
          {/* Glow ring */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/20 to-red-500/20 blur-xl pointer-events-none" />

          <div className="relative bg-[#0a0d1f]/95 backdrop-blur-xl border border-violet-500/30 rounded-2xl overflow-hidden shadow-2xl shadow-violet-900/30">
            
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-900/60 to-purple-900/60 border-b border-violet-500/20">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-xs">
                  🤖
                </div>
                <div>
                  <p className="text-xs font-bold text-violet-200">Claude AI</p>
                  <p className="text-[10px] text-violet-400">Live Commentary</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Tension level badge */}
                {commentary && (
                  <div className="flex items-center gap-1 bg-black/30 rounded-full px-2 py-0.5">
                    <span className="text-[10px] text-gray-400">Tension:</span>
                    <span className={`text-[10px] font-bold ${getTensionColor(commentary.tensionLevel)}`}>
                      {getTensionLabel(commentary.tensionLevel)}
                    </span>
                    <span className={`text-xs ${getTensionColor(commentary.tensionLevel)}`}>
                      {Array.from({ length: Math.min(commentary.tensionLevel, 5) }, (_, i) => "▮").join("")}
                      {Array.from({ length: Math.max(5 - commentary.tensionLevel, 0) }, (_, i) => "▯").join("")}
                    </span>
                  </div>
                )}

                {/* Close button */}
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-white transition-colors w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Commentary body */}
            <div className="p-4 min-h-[100px]">
              {isLoading && (
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <p className="text-xs text-gray-400 animate-pulse">
                    Claude is watching the game...
                  </p>
                </div>
              )}

              {error && !isLoading && (
                <div className="text-xs text-red-400 text-center">
                  <p>⚠️ {error}</p>
                  <p className="text-gray-500 mt-1">Make sure backend is running</p>
                </div>
              )}

              {!isLoading && !error && (
                <div className="relative">
                  {/* Typing cursor */}
                  <p className="text-sm text-gray-100 leading-relaxed font-light">
                    {displayedText}
                    {isTyping && (
                      <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse" />
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* Footer with refresh button */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-violet-500/10 bg-black/20">
              <p className="text-[10px] text-gray-500">
                Powered by Claude 3.5 Haiku
              </p>
              <button
                onClick={fetchCommentary}
                disabled={isLoading}
                className={`text-[10px] text-violet-300 hover:text-violet-100 font-semibold transition-all flex items-center gap-1 ${
                  isLoading ? "opacity-50 cursor-not-allowed" : "hover:underline"
                }`}
              >
                {isLoading ? (
                  <>
                    <div className="w-3 h-3 border border-violet-400 border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>↻ Refresh</>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
