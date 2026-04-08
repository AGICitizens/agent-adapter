export class CapabilityParseError extends Error {
  constructor(
    public readonly source: string,
    message: string,
  ) {
    super(`CapabilityParseError [${source}]: ${message}`);
    this.name = "CapabilityParseError";
  }
}

export class PricingRequiredError extends Error {
  constructor(public readonly capabilityName: string) {
    super(
      `Cannot enable capability "${capabilityName}" without pricing configured`,
    );
    this.name = "PricingRequiredError";
  }
}
