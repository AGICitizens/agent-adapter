export interface StateBackend {
  /** Retrieve a value by namespace and key. Returns null if not found. */
  get(namespace: string, key: string): Promise<unknown>;

  /** Store a JSON-serializable value. Overwrites if key already exists. */
  set(namespace: string, key: string, value: unknown): Promise<void>;

  /** Query state entries with optional prefix filtering, pagination, and ordering. */
  query(
    namespace: string,
    opts?: {
      prefix?: string;
      limit?: number;
      offset?: number;
      orderBy?: "key" | "updatedAt";
      order?: "asc" | "desc";
    },
  ): Promise<Array<{ key: string; data: unknown; updatedAt: string }>>;

  /** Delete a state entry. Returns true if the key existed. */
  delete(namespace: string, key: string): Promise<boolean>;

  /** Set multiple state entries atomically. */
  batchSet(
    namespace: string,
    entries: Array<{ key: string; data: unknown }>,
  ): Promise<void>;
}
