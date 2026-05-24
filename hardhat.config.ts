import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";
import hardhatViem from "@nomicfoundation/hardhat-viem";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatViem, hardhatNetworkHelpers],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
});
