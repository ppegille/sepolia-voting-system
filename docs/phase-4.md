# Phase 4 Wallet Connection

## Scope

Phase 4 implements browser wallet readiness for the Sepolia voting MVP.

This phase does not submit vote transactions, create onchain elections, or verify administrator wallet signatures. Those responsibilities remain later phases.

## Requirements Covered

- Detect whether MetaMask is installed in the browser.
- Request wallet connection with `eth_requestAccounts`.
- Use the connected wallet address as the user identifier.
- Read the current chain with `eth_chainId` and require Sepolia for voting readiness.
- Offer Sepolia network switching with `wallet_switchEthereumChain`.
- Add Sepolia to MetaMask with `wallet_addEthereumChain` when the wallet does not know the network.
- Read Sepolia ETH balance with `eth_getBalance`.
- Warn users when the selected wallet has zero Sepolia ETH because voting transactions need gas.
- Treat balance as unknown until the connected wallet is on Sepolia, so ETH from other networks is never displayed as voting gas readiness.

## Sepolia Constants

| Name | Value |
| --- | --- |
| Chain ID hex | `0xaa36a7` |
| Chain ID decimal | `11155111` |
| Explorer | `https://sepolia.etherscan.io` |
| Faucet guide | `https://sepoliafaucet.com` |
| Add-network RPC URLs | `https://rpc.sepolia.org`, `https://ethereum-sepolia-rpc.publicnode.com` |

## User States

| State | Behavior |
| --- | --- |
| MetaMask missing | Show installation requirement and disable wallet actions. |
| Wallet not connected | Show connect button. |
| Wrong network | Show Sepolia warning and enable network switch. |
| Zero Sepolia ETH | Show faucet guidance before any transaction phase. |
| Connected on Sepolia with ETH | Mark wallet readiness as satisfied. |

## Security Boundary

- Phase 4 never asks for private keys, seed phrases, passwords, or token secrets.
- The browser wallet remains the transaction signer. The server does not sign transactions.
- Address matching alone is not proof of wallet ownership for administrator writes. Later phases must add message signature verification before relying on wallet ownership for privileged actions.
- Sepolia ETH balance is used only as a gas-readiness warning and is not an eligibility rule.

## Implementation Artifacts

- `src/wallet/metamask.ts`: EIP-1193 MetaMask helper functions, Sepolia constants, balance formatting, and network switching.
- `src/wallet/metamask.test.ts`: tests for Sepolia detection, account validation, balance handling, wallet connection, and add-network fallback.
- `src/components/wallet-status.tsx`: client UI for wallet connection, network readiness, and faucet guidance.
- `src/app/page.tsx`: landing page includes the Phase 4 wallet readiness panel.
