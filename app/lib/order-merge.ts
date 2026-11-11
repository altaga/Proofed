export const STATUS_RANK: Record<string, number> = {
  CREATED: 1,
  APPROVED: 2,
  AUTHORIZED: 3,
  DELIVERY_CONFIRMED: 4,
  DELIVERY_FAILED: 5,
  CAPTURED: 6,
  VOIDED: 6,
  REFUNDED: 7,
  CANCELLED: 7,
  EXPIRED: 7,
};

export function getStatusRank(status?: string | null): number {
  if (!status) return 0;
  return STATUS_RANK[status.toUpperCase()] ?? 0;
}

export function mergeOrders<T extends { id: string; status: string; updated_at?: string; created_at?: string }>(
  incoming: T[],
  existing: T[],
): T[] {
  const map = new Map<string, T>();

  // 1. Seed with existing records
  for (const item of existing) {
    if (item?.id) {
      map.set(item.id, item);
    }
  }

  // 2. Merge incoming records with strict rank monotonicity
  for (const item of incoming) {
    if (!item?.id) continue;
    const current = map.get(item.id);
    if (!current) {
      map.set(item.id, item);
      continue;
    }

    const currentRank = getStatusRank(current.status);
    const incomingRank = getStatusRank(item.status);

    // If incoming has a lower rank, NEVER downgrade (e.g. DELIVERY_FAILED cannot go back to AUTHORIZED)
    if (incomingRank < currentRank) {
      continue;
    }

    // If incoming has a strictly higher rank, incoming wins
    if (incomingRank > currentRank) {
      map.set(item.id, { ...current, ...item });
      continue;
    }

    // If equal rank, compare timestamps (latest wins)
    const currentTime = new Date(current.updated_at || current.created_at || 0).getTime();
    const incomingTime = new Date(item.updated_at || item.created_at || 0).getTime();

    if (incomingTime >= currentTime) {
      map.set(item.id, { ...current, ...item });
    }
  }

  // 3. Sort newest first
  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });
}

export function mergeEvents<T extends { id: number; order_id?: string | null }>(
  incoming: T[],
  existing: T[],
): T[] {
  const map = new Map<number, T>();
  for (const e of existing) {
    if (e && typeof e.id === "number") map.set(e.id, e);
  }
  for (const e of incoming) {
    if (e && typeof e.id === "number") map.set(e.id, e);
  }
  return Array.from(map.values()).sort((a, b) => b.id - a.id);
}
