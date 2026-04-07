/**
 * Secrets backend interface for encrypted credential storage.
 */

export interface SecretsBackend {
  /** Store an encrypted secret. */
  set(platform: string, key: string, value: string): Promise<void>;

  /** Retrieve and decrypt a secret. Returns null if not found. */
  get(platform: string, key: string): Promise<string | null>;

  /** Delete a secret. */
  delete(platform: string, key: string): Promise<boolean>;

  /** List all keys for a platform. */
  listKeys(platform: string): Promise<string[]>;
}
