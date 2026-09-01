import { createHash } from 'crypto'

/**
 * Serialize concurrent customer resolve/merge for the SAME person.
 *
 * Chat is high-traffic: two webhooks for one customer (e.g. one carrying the
 * phone, one carrying the BSUID, or two rapid messages) can hit the resolve/
 * merge transaction at the same moment and race — the classic outcome is two
 * customer rows, or a merge that collides with a concurrent create. We take a
 * Postgres transaction-scoped advisory lock keyed on the customer's identity so
 * those transactions queue instead of racing. The lock auto-releases at COMMIT
 * or ROLLBACK — nothing to clean up.
 *
 * We lock BOTH identifiers a webhook carries (phone AND BSUID). A duplicate
 * webhook for the same person shares at least one of them, so it blocks on that
 * key. The lock is fine-grained (per identity), so unrelated customers never
 * wait on each other.
 */

/**
 * Map an arbitrary identity string to a signed 64-bit key for
 * `pg_advisory_xact_lock(bigint)`. Postgres advisory locks take a bigint; we
 * hash to the full 64-bit space and interpret it as signed (JS BigInt).
 *
 * Scoped by userId so two tenants that happen to share a phone number / BSUID
 * string never collide on the same lock.
 */
export function advisoryLockKey(userId: string, identity: string): bigint {
  const digest = createHash('sha256').update(`${userId}:${identity}`).digest()
  // Take the first 8 bytes as a signed 64-bit integer (BigInt.asIntN wraps to
  // the signed range Postgres bigint expects).
  const unsigned = digest.readBigUInt64BE(0)
  return BigInt.asIntN(64, unsigned)
}

/** Minimal tx surface: an executable raw query. */
export interface AdvisoryLockTx {
  $executeRawUnsafe: (query: string, ...values: any[]) => Promise<number>
}

/**
 * Acquire transaction-scoped advisory locks for every non-empty identity, in a
 * STABLE order (sorted) so two transactions locking an overlapping set can
 * never deadlock by grabbing them in opposite orders.
 */
export async function acquireCustomerLocks(
  tx: AdvisoryLockTx,
  userId: string,
  identities: Array<string | null | undefined>,
): Promise<void> {
  const keys = [
    ...new Set(
      identities
        .filter((v): v is string => Boolean(v && v.trim()))
        .map((v) => advisoryLockKey(userId, v)),
    ),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  for (const key of keys) {
    // Parameterized bigint bind; pg_advisory_xact_lock releases at tx end.
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1::bigint)', key.toString())
  }
}
