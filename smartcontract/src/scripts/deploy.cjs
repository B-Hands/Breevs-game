const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("=========================================");
    console.log("  Breevs Russian Roulette - Deployment  ");
    console.log("=========================================");
    console.log("Network    :", (await ethers.provider.getNetwork()).name);
    console.log("Deployer   :", deployer.address);
    console.log(
        "Balance    :",
        ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
        "CELO"
    );
    console.log("-----------------------------------------");

    console.log("Deploying BreevsRussianRoulette...");

    const BreevsRussianRoulette = await ethers.getContractFactory(
        "BreevsRussianRoulette"
    );

    const contract = await BreevsRussianRoulette.deploy();
    await contract.waitForDeployment();

    const contractAddress = await contract.getAddress();

    console.log("-----------------------------------------");
    console.log("Contract deployed successfully!");
    console.log("Contract address :", contractAddress);
    console.log("-----------------------------------------");

    console.log("Verifying contract constants...");
    const maxPlayers = await contract.MAX_PLAYERS();
    const minStake = await contract.MIN_PLAYER_STAKE();
    const maxStake = await contract.MAX_PLAYER_STAKE();
    const hostMultiplier = await contract.HOST_BALANCE_MULTIPLIER();
    const minRound = await contract.MIN_ROUND_DURATION();
    const maxRound = await contract.MAX_ROUND_DURATION();

    console.log("MAX_PLAYERS             :", maxPlayers.toString());
    console.log("MIN_PLAYER_STAKE        :", ethers.formatEther(minStake), "CELO");
    console.log("MAX_PLAYER_STAKE        :", ethers.formatEther(maxStake), "CELO");
    console.log("HOST_BALANCE_MULTIPLIER :", hostMultiplier.toString(), "x");
    console.log("MIN_ROUND_DURATION      :", minRound.toString(), "blocks");
    console.log("MAX_ROUND_DURATION      :", maxRound.toString(), "blocks");
    console.log("-----------------------------------------");

    const network = await ethers.provider.getNetwork();
    const deploymentInfo = {
        network: network.name,
        chainId: network.chainId.toString(),
        contractAddress,
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
        constants: {
            MAX_PLAYERS: maxPlayers.toString(),
            MIN_PLAYER_STAKE_CELO: ethers.formatEther(minStake),
            MAX_PLAYER_STAKE_CELO: ethers.formatEther(maxStake),
            HOST_BALANCE_MULTIPLIER: hostMultiplier.toString(),
            MIN_ROUND_DURATION_BLOCKS: minRound.toString(),
            MAX_ROUND_DURATION_BLOCKS: maxRound.toString(),
        },
    };

    fs.writeFileSync("deployment.json", JSON.stringify(deploymentInfo, null, 2));
    console.log("Deployment info saved to deployment.json");
    console.log("=========================================");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Deployment failed:", error);
        process.exit(1);
    });
