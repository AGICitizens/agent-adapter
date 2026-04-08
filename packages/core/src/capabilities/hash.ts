import { createHash } from "node:crypto";

export const computeSourceHash = (content: string) => {
  return createHash("sha256").update(content).digest("hex");
};
