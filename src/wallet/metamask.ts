import { assertAddress } from "../contracts/voting-contract";

export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";
export const SEPOLIA_CHAIN_ID_DECIMAL = 11155111;
export const SEPOLIA_CHAIN_NAME = "Sepolia";
export const SEPOLIA_EXPLORER_URL = "https://sepolia.etherscan.io";
export const SEPOLIA_FAUCET_URL = "https://sepoliafaucet.com";
export const SEPOLIA_RPC_URLS = [
  "https://rpc.sepolia.org",
  "https://ethereum-sepolia-rpc.publicnode.com",
] as const;

export type EthereumProvider = Readonly<{
  isMetaMask?: boolean;
  request: (args: {
    method: string;
    params?: readonly unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => void;
}>;

export type WalletConnection = Readonly<{
  address: `0x${string}`;
  chainId: string;
  balanceWei?: bigint;
}>;

export type BalanceStatus = "unknown" | "empty" | "available";

export const getInjectedMetaMaskProvider = (): EthereumProvider | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const ethereum = (window as typeof window & { ethereum?: EthereumProvider })
    .ethereum;

  if (!ethereum?.isMetaMask || typeof ethereum.request !== "function") {
    return null;
  }

  return ethereum;
};

export const normalizeWalletAddress = (address: string) =>
  assertAddress(address.toLowerCase(), "wallet address");

export const isSepoliaChain = (chainId: string) =>
  chainId.toLowerCase() === SEPOLIA_CHAIN_ID_HEX;

export const shortenAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

export const parseHexWei = (balanceHex: string) => {
  if (!/^0x[0-9a-fA-F]+$/.test(balanceHex)) {
    throw new Error("balance must be a hex string");
  }

  return BigInt(balanceHex);
};

export const formatEthBalance = (balanceWei: bigint) => {
  const weiPerEth = BigInt("1000000000000000000");
  const whole = balanceWei / weiPerEth;
  const fraction = balanceWei % weiPerEth;
  const fractionText = fraction.toString().padStart(18, "0").slice(0, 4);

  return `${whole}.${fractionText} ETH`;
};

export const getBalanceStatus = (balanceWei?: bigint): BalanceStatus => {
  if (balanceWei === undefined) {
    return "unknown";
  }

  return balanceWei === BigInt(0) ? "empty" : "available";
};

export const getWalletAccounts = async (provider: EthereumProvider) => {
  const accounts = await provider.request({ method: "eth_accounts" });

  if (!Array.isArray(accounts)) {
    throw new Error("MetaMask returned an invalid account list");
  }

  return accounts.filter((account): account is string => typeof account === "string");
};

export const requestWalletAccounts = async (provider: EthereumProvider) => {
  const accounts = await provider.request({ method: "eth_requestAccounts" });

  if (!Array.isArray(accounts)) {
    throw new Error("MetaMask returned an invalid account list");
  }

  return accounts.filter((account): account is string => typeof account === "string");
};

export const getWalletChainId = async (provider: EthereumProvider) => {
  const chainId = await provider.request({ method: "eth_chainId" });

  if (typeof chainId !== "string") {
    throw new Error("MetaMask returned an invalid chain ID");
  }

  return chainId;
};

export const getWalletBalance = async (
  provider: EthereumProvider,
  address: `0x${string}`,
) => {
  const balance = await provider.request({
    method: "eth_getBalance",
    params: [address, "latest"],
  });

  if (typeof balance !== "string") {
    throw new Error("MetaMask returned an invalid balance");
  }

  return parseHexWei(balance);
};

export const connectMetaMaskWallet = async (provider: EthereumProvider) => {
  const accounts = await requestWalletAccounts(provider);
  const firstAccount = accounts[0];

  if (!firstAccount) {
    throw new Error("No MetaMask account was selected");
  }

  const address = normalizeWalletAddress(firstAccount);
  const chainId = await getWalletChainId(provider);
  const balanceWei = isSepoliaChain(chainId)
    ? await getWalletBalance(provider, address)
    : undefined;

  return { address, chainId, balanceWei } satisfies WalletConnection;
};

export const readMetaMaskWallet = async (provider: EthereumProvider) => {
  const accounts = await getWalletAccounts(provider);
  const firstAccount = accounts[0];

  if (!firstAccount) {
    return null;
  }

  const address = normalizeWalletAddress(firstAccount);
  const chainId = await getWalletChainId(provider);
  const balanceWei = isSepoliaChain(chainId)
    ? await getWalletBalance(provider, address)
    : undefined;

  return { address, chainId, balanceWei } satisfies WalletConnection;
};

export const switchToSepolia = async (provider: EthereumProvider) => {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;

    if (code !== 4902) {
      throw error;
    }

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          blockExplorerUrls: [SEPOLIA_EXPLORER_URL],
          chainId: SEPOLIA_CHAIN_ID_HEX,
          chainName: SEPOLIA_CHAIN_NAME,
          nativeCurrency: { decimals: 18, name: "Sepolia Ether", symbol: "ETH" },
          rpcUrls: [...SEPOLIA_RPC_URLS],
        },
      ],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
  }
};
