/**
 * Auth middleware.
 * Self-hosted: no-op (always "default" provider).
 * TODO: Hosted mode — validate Supabase JWT, extract providerId (Phase 6)
 */

import { createMiddleware } from "hono/factory";

export type AuthEnv = {
  Variables: {
    providerId: string;
  };
};

export const authMiddleware = () =>
  createMiddleware<AuthEnv>(async (c, next) => {
    // Self-hosted: single provider, no auth required
    c.set("providerId", "default");
    await next();
  });
