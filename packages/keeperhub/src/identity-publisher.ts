import type { AdapterIdentity, EvmAddress } from "@agent-adapter/contracts";
import type { KeeperHubClient, TriggerWorkflowResponse } from "./client.js";

export interface IdentityPublisherConfig {
  client: KeeperHubClient;
  
  workflowSlug: string;
}

export interface PublishIdentityInput {
  
  subname: string;
  
  ownerAddress: EvmAddress;
  
  manifest: Omit<AdapterIdentity, "subname">;
}

export class KeeperHubIdentityPublisher {
  constructor(private readonly config: IdentityPublisherConfig) {
    if (!config.workflowSlug) {
      throw new Error("KeeperHubIdentityPublisher requires workflowSlug");
    }
  }

  
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
