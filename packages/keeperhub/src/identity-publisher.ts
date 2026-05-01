import type { AdapterIdentity, EvmAddress } from "@agent-adapter/contracts";
import type { KeeperHubClient, TriggerWorkflowResponse } from "./client.js";

export interface IdentityPublisherConfig {
  client: KeeperHubClient;
  /**
   * Slug of the KeeperHub workflow that performs the on-chain ENS write.
   * The workflow is provisioned manually in the KeeperHub dashboard and
   * receives the publish payload as its input.
   */
  workflowSlug: string;
}

export interface PublishIdentityInput {
  /** Fully-qualified ENS subname being provisioned, e.g. `weather.agentadapter.eth`. */
  subname: string;
  /** Address of the adapter's owner — typically the seller's wallet. */
  ownerAddress: EvmAddress;
  /** The identity payload that ends up in ENS text records. */
  manifest: Omit<AdapterIdentity, "subname">;
}

export class KeeperHubIdentityPublisher {
  constructor(private readonly config: IdentityPublisherConfig) {
    if (!config.workflowSlug) {
      throw new Error("KeeperHubIdentityPublisher requires workflowSlug");
    }
  }

  /**
   * Hand off an ENS subname registration + text-record write to KeeperHub.
   * Returns the executionId without polling — verify success out-of-band by
   * resolving the subname through the ENS identity resolver.
   */
  async publish(input: PublishIdentityInput): Promise<TriggerWorkflowResponse> {
    const body = {
      subname: input.subname,
      owner: input.ownerAddress,
      manifest: serializeManifest(input.manifest),
    };
    return this.config.client.triggerWorkflow(this.config.workflowSlug, body);
  }
}

function serializeManifest(manifest: Omit<AdapterIdentity, "subname">): Record<string, unknown> {
  return {
    walletAddress: manifest.walletAddress,
    endpoint: manifest.endpoint,
    capabilities: manifest.capabilities,
    pricing: manifest.pricing,
    paymentChainId: manifest.paymentChainId,
    ...(manifest.escrowAddress ? { escrowAddress: manifest.escrowAddress } : {}),
  };
}
