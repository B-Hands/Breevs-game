import { ethers } from "hardhat";

async function main() {
  const Breevs = await ethers.getContractFactory("BreevsRussianRoulette");

  // Random contract is deactivated on Celo L2 — contract falls back to blockhash().
  // Pass any non-zero address; the try/catch in resolveSpin handles it gracefully.
  const PLACEHOLDER_RANDOM = "0x000000000000000000000000000000000000dEaD";

  const breevs = await Breevs.deploy(PLACEHOLDER_RANDOM);
  await breevs.waitForDeployment();

  const address = await breevs.getAddress();
  console.log(`BreevsRussianRoulette deployed to: ${address}`);
  console.log(`Explorer: https://sepolia.celoscan.io/address/${address}`);
  console.log(`\nUpdate frontend/.env.local:`);
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});