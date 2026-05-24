import { describe, expect, it } from "vitest";

import {
  connectMetaMaskWallet,
  formatEthBalance,
  getBalanceStatus,
  isSepoliaChain,
  parseHexWei,
  readMetaMaskWallet,
  requestWalletAccounts,
  SEPOLIA_CHAIN_ID_HEX,
  shortenAddress,
  switchToSepolia,
  type EthereumProvider,
} from "./metamask";

const ACCOUNT = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const NORMALIZED_ACCOUNT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const createProvider = (
  handlers: Record<string, (params: unknown) => unknown | Promise<unknown>>,
) => ({
  isMetaMask: true,
  request: async ({ method, params }) => {
    const handler = handlers[method];

    if (!handler) {
      throw new Error(`Unhandled method: ${method}`);
    }

    return handler(params);
  },
}) satisfies EthereumProvider;

describe("metamask wallet helpers", () => {
  it("detects Sepolia chain IDs", () => {
    expect(isSepoliaChain(SEPOLIA_CHAIN_ID_HEX)).toBe(true);
    expect(isSepoliaChain(SEPOLIA_CHAIN_ID_HEX.toUpperCase())).toBe(true);
    expect(isSepoliaChain("0x1")).toBe(false);
  });

  it("formats wallet addresses and balances for display", () => {
    expect(shortenAddress(NORMALIZED_ACCOUNT)).toBe("0xaaaa...aaaa");
    expect(parseHexWei("0x0")).toBe(BigInt(0));
    expect(parseHexWei("0xde0b6b3a7640000")).toBe(
      BigInt("1000000000000000000"),
    );
    expect(formatEthBalance(BigInt("1230000000000000000"))).toBe(
      "1.2300 ETH",
    );
  });

  it("classifies empty balances as a faucet warning", () => {
    expect(getBalanceStatus()).toBe("unknown");
    expect(getBalanceStatus(BigInt(0))).toBe("empty");
    expect(getBalanceStatus(BigInt(1))).toBe("available");
  });

  it("connects a MetaMask wallet and reads chain plus balance", async () => {
    const provider = createProvider({
      eth_chainId: () => SEPOLIA_CHAIN_ID_HEX,
      eth_getBalance: () => "0xde0b6b3a7640000",
      eth_requestAccounts: () => [ACCOUNT],
    });

    await expect(connectMetaMaskWallet(provider)).resolves.toEqual({
      address: NORMALIZED_ACCOUNT,
      balanceWei: BigInt("1000000000000000000"),
      chainId: SEPOLIA_CHAIN_ID_HEX,
    });
  });

  it("does not read or report a balance before Sepolia is active", async () => {
    const provider = createProvider({
      eth_chainId: () => "0x1",
      eth_getBalance: () => {
        throw new Error("balance should not be read off Sepolia");
      },
      eth_requestAccounts: () => [ACCOUNT],
    });

    await expect(connectMetaMaskWallet(provider)).resolves.toEqual({
      address: NORMALIZED_ACCOUNT,
      balanceWei: undefined,
      chainId: "0x1",
    });
  });

  it("returns null when no account is already connected", async () => {
    const provider = createProvider({ eth_accounts: () => [] });

    await expect(readMetaMaskWallet(provider)).resolves.toBeNull();
  });

  it("reads an already connected Sepolia wallet balance", async () => {
    const provider = createProvider({
      eth_accounts: () => [ACCOUNT],
      eth_chainId: () => SEPOLIA_CHAIN_ID_HEX,
      eth_getBalance: () => "0x0",
    });

    await expect(readMetaMaskWallet(provider)).resolves.toEqual({
      address: NORMALIZED_ACCOUNT,
      balanceWei: BigInt(0),
      chainId: SEPOLIA_CHAIN_ID_HEX,
    });
  });

  it("does not read an already connected wallet balance off Sepolia", async () => {
    const provider = createProvider({
      eth_accounts: () => [ACCOUNT],
      eth_chainId: () => "0x1",
      eth_getBalance: () => {
        throw new Error("balance should not be read off Sepolia");
      },
    });

    await expect(readMetaMaskWallet(provider)).resolves.toEqual({
      address: NORMALIZED_ACCOUNT,
      balanceWei: undefined,
      chainId: "0x1",
    });
  });

  it("rejects invalid MetaMask account payloads", async () => {
    const provider = createProvider({ eth_requestAccounts: () => "not-array" });

    await expect(requestWalletAccounts(provider)).rejects.toThrow(
      "MetaMask returned an invalid account list",
    );
  });

  it("adds Sepolia when the wallet does not know the network", async () => {
    const calls: string[] = [];
    const provider = createProvider({
      wallet_addEthereumChain: () => {
        calls.push("add");
      },
      wallet_switchEthereumChain: () => {
        calls.push("switch");
        if (calls.length === 1) {
          throw Object.assign(new Error("unknown chain"), { code: 4902 });
        }
      },
    });

    await switchToSepolia(provider);

    expect(calls).toEqual(["switch", "add", "switch"]);
  });

  it("propagates non-add-network switch errors", async () => {
    const provider = createProvider({
      wallet_switchEthereumChain: () => {
        throw Object.assign(new Error("user rejected"), { code: 4001 });
      },
    });

    await expect(switchToSepolia(provider)).rejects.toThrow("user rejected");
  });

  it("propagates add-network fallback errors", async () => {
    const provider = createProvider({
      wallet_addEthereumChain: () => {
        throw new Error("add rejected");
      },
      wallet_switchEthereumChain: () => {
        throw Object.assign(new Error("unknown chain"), { code: 4902 });
      },
    });

    await expect(switchToSepolia(provider)).rejects.toThrow("add rejected");
  });
});
