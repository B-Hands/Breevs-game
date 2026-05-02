"use client";

/** Simplified – just maps Solidity revert strings to user-friendly messages */
export function mapContractError(error: unknown): { message: string } {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes("Stake must be exactly 1 CELO")) return { message: "Stake must be exactly 1 CELO" };
    if (msg.includes("Game not joinable")) return { message: "This game is not open for joining" };
    if (msg.includes("Game is full")) return { message: "Game is full (6 players max)" };
    if (msg.includes("Already in game")) return { message: "You are already in this game" };
    if (msg.includes("Only creator can start")) return { message: "Only the game creator can start" };
    if (msg.includes("Need exactly 6 players")) return { message: "Need exactly 6 players to start" };
    if (msg.includes("Must wait for RANDAO reveal")) return { message: "Please wait 1 block before resolving the spin" };
    if (msg.includes("Spin request expired")) return { message: "Spin expired – request a new spin" };
    if (msg.includes("No pending spin")) return { message: "No pending spin to resolve" };
    if (msg.includes("User rejected") || msg.includes("user rejected")) return { message: "Transaction rejected by user" };
    if (msg.includes("Host must hold at least 5 CELO")) return { message: "Host wallet must hold at least 5 CELO" };
    return { message: msg };
  }
  return { message: String(error) };
}
