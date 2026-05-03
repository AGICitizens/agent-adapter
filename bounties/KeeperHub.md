# KeeperHub

## Use

We integrated KeeperHub as the managed workflow trigger for our runtime. On each demo run, our seller-side runtime sends a workflow request to KeeperHub with the provider's identity manifest and receives a real execution ID back. KeeperHub is designed to be the gas-handling layer for ENS publishing on Sepolia, so providers don't need to manage Sepolia gas themselves. The full publishing workflow on KeeperHub's side is our next step.

## Code reference

- **KeeperHub client:** https://github.com/AGICitizens/agent-adapter/blob/main/packages/keeperhub/src/client.ts
- **Identity publisher:** https://github.com/AGICitizens/agent-adapter/blob/main/packages/keeperhub/src/identity-publisher.ts

## Live integration proof

- **Workflow trigger** runs on every `pnpm demo` execution
- **Sample execution ID returned by KeeperHub:** `ofa61t7774g9mp6zyfmkx`
- **Workflow slug:** `agent-adapter-publish-identity`
