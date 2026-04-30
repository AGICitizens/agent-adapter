# Solidity — `AgentAdapterEscrow`

The on-chain contract that records and forwards x402 payments. Buyers
call `pay(nonce, payee)`; the contract emits a `Paid` event and forwards
funds in the same transaction. The runtime verifies the event in the tx
receipt before serving capability output.

Designed to live on **0G Galileo testnet** (chain `16602`). Same contract
also compiles for any other EVM chain.

## Deployments

| Network | Chain ID | Address | Deploy tx |
|---|---|---|---|
| 0G Galileo testnet | 16602 | [`0xc5b8ea3842A30D85424eAdAa00c8729ac6892214`](https://chainscan-galileo.0g.ai/address/0xc5b8ea3842A30D85424eAdAa00c8729ac6892214) | [`0x5b0d8117…d407`](https://chainscan-galileo.0g.ai/tx/0x5b0d8117d97aed9bc0e22dca87dca6c9ae6021c37cad349696d9a97d6fe6d407) |

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
  ```bash
  curl -L https://foundry.paradigm.xyz | bash
  foundryup
  ```
- A wallet private key with funded native balance on the target chain
  (claim 0G testnet tokens from https://faucet.0g.ai)

## Setup

From this directory:

```bash
forge install foundry-rs/forge-std --no-git
forge build
forge test
```

`forge install --no-git` clones forge-std into `lib/` as a regular
directory rather than a submodule (simpler for a hackathon repo).

## Deploy to 0G Galileo

In the parent repo's `.env`:

```dotenv
PRIVATE_KEY=0x<your-hex-private-key>
ZG_RPC_URL=https://evmrpc-testnet.0g.ai
```

Then from `solidity/`:

```bash
forge script script/DeployEscrow.s.sol \
  --rpc-url zg_galileo \
  --broadcast
```

The script prints the deployed address. Copy it into `.env` as
`ZG_ESCROW_ADDRESS=0x...` so the runtime's x402 adapter can verify
payments against it.

## Verify on 0G's explorer (optional)

```bash
forge verify-contract <ESCROW_ADDRESS> AgentAdapterEscrow \
  --chain-id 16602 \
  --verifier-url https://chainscan-galileo.0g.ai/api
```

## Design notes

- Single function: `pay(bytes32 nonce, address payee) payable`
- Replay protection via `consumedNonces[nonce]` — the state change
  happens **before** the external call, so re-entry with the same
  nonce reverts on `NonceConsumed`. No extra reentrancy guard needed.
- The contract holds no balance between calls — funds forward to
  `payee` in the same tx via low-level `call`.
- Events are the source of truth for off-chain verification:
  `Paid(bytes32 indexed nonce, address indexed payer, address indexed payee, uint256 amount)`.
