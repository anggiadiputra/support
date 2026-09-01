/**
 * Evidence-based customer merge decision.
 *
 * Background (docs/bsuid.md): after the WhatsApp BSUID rollout, one real person
 * can end up as TWO customer rows on the same business phone number — e.g. an
 * old row keyed on their phone number, and a newer row keyed on their BSUID
 * (created when a message arrived phone-masked). They stay split until a single
 * webhook proves they are the same person: one that carries BOTH the phone
 * number AND the BSUID. Meta itself asserting "this phone == this BSUID" is the
 * only safe merge signal — we NEVER merge on a guess (e.g. matching names).
 *
 * This module is the PURE decision half (no DB). The execution half
 * (`mergeCustomers`) lives in the worker and moves every child row inside one
 * transaction. Keeping the decision pure makes the rules testable in isolation.
 */

/** The subset of a customer row the merge decision needs. */
export interface MergeCandidate {
  id: string
  phoneNumber: string
  whatsappBsuid: string | null
  whatsappParentBsuid: string | null
  whatsappUsername: string | null
  name: string | null
  createdAt: Date
}

/**
 * Identity fields to backfill onto the winner (only those the winner is missing
 * but the loser has). Never overwrites a value the winner already holds.
 *
 * `phoneNumber` is special: it is only set when the survivor's stored
 * phoneNumber is actually a BSUID placeholder (a username-only row keeps its
 * BSUID in the phoneNumber column in this codebase) AND we now know the real
 * phone number from the webhook. It is applied AFTER the loser is deleted to
 * avoid transiently violating @@unique([userId, phoneNumber, whatsappPhoneNumberId]).
 */
export interface MergeBackfill {
  whatsappBsuid?: string
  whatsappParentBsuid?: string
  whatsappUsername?: string
  name?: string
  phoneNumber?: string
}

export type MergeDecision =
  | { action: 'none' }
  | {
      action: 'merge'
      /** Row to KEEP (survivor). */
      winnerId: string
      /** Row to REMOVE after moving its children onto the winner. */
      loserId: string
      backfill: MergeBackfill
    }

/**
 * Decide whether two lookup hits are actually the SAME person that must be
 * merged.
 *
 * @param byPhone  Customer matched by the webhook's phone number (or null).
 * @param byBsuid  Customer matched by the webhook's BSUID (or null).
 *
 * Merge happens ONLY when both are present AND they are different rows — that
 * is the evidence case. Survivor = the OLDER row (more history/relations to
 * keep, less data to move). The younger row's children are moved to it and it
 * is deleted.
 */
export function decideMerge(
  byPhone: MergeCandidate | null | undefined,
  byBsuid: MergeCandidate | null | undefined,
  opts?: {
    /** The real phone number from the webhook (`message.from`), if present. */
    realPhone?: string | null
    /** True when `value` is a BSUID (not a real phone). Injected so this pure
     * fn has no dependency on the BSUID regex. */
    isBsuid?: (value: string) => boolean
  },
): MergeDecision {
  // No evidence unless BOTH identifiers resolved to a row.
  if (!byPhone || !byBsuid) return { action: 'none' }

  // Same row already — nothing split, nothing to merge.
  if (byPhone.id === byBsuid.id) return { action: 'none' }

  // Two different rows both matched by the SAME webhook (phone + BSUID) →
  // Meta says they are one person. Survivor is the older row.
  const winner = byPhone.createdAt <= byBsuid.createdAt ? byPhone : byBsuid
  const loser = winner.id === byPhone.id ? byBsuid : byPhone

  const backfill: MergeBackfill = {}
  if (!winner.whatsappBsuid && loser.whatsappBsuid) backfill.whatsappBsuid = loser.whatsappBsuid
  if (!winner.whatsappParentBsuid && loser.whatsappParentBsuid)
    backfill.whatsappParentBsuid = loser.whatsappParentBsuid
  if (!winner.whatsappUsername && loser.whatsappUsername)
    backfill.whatsappUsername = loser.whatsappUsername
  if (!winner.name && loser.name) backfill.name = loser.name

  // Repair a BSUID-placeholder phoneNumber on the survivor: if the winner's
  // stored phoneNumber is actually a BSUID (username-only row) and the webhook
  // gave us the real phone, promote the real phone. Only when we can tell it's
  // a BSUID (isBsuid provided) and a real phone is available.
  const realPhone = opts?.realPhone
  const isBsuid = opts?.isBsuid
  if (realPhone && isBsuid && isBsuid(winner.phoneNumber) && !isBsuid(realPhone)) {
    backfill.phoneNumber = realPhone
  }

  return { action: 'merge', winnerId: winner.id, loserId: loser.id, backfill }
}

/**
 * Every child table that references `Customer.id`, audited from
 * prisma/schema.prisma. Moving a customer means re-pointing ALL of these to the
 * survivor — miss one and its rows are deleted with the loser (cascade) or
 * orphaned. Keep this list in sync with the schema; a merge that forgets a
 * table is silent data loss.
 *
 * `CustomerCustomField` is handled separately below because of its
 * `@@unique([customerId, fieldDefinitionId])` — a blind move can collide.
 */
const SIMPLE_CHILD_MODELS = [
  'message',
  'consentLog',
  'marketingPreferenceLog',
  'customerActivity',
  'customerNote',
  'conversationMemory',
  'messengerConversation',
  // Prisma camelCases `IGConversation` to `iGConversation` (capital G), NOT
  // `igConversation`. Getting this wrong makes tx[model] undefined and crashes
  // every merge — caught by the e2e script against a real DB.
  'iGConversation',
  'templateVariableHistory',
] as const

/**
 * Minimal shape of the Prisma transaction client the merge needs. We type it
 * loosely (the backend runs `strict: false`) so this stays decoupled from the
 * generated client, but every model used here exists on it at runtime.
 */
type MergeTx = {
  [model: string]: {
    updateMany: (args: any) => Promise<{ count: number }>
    findMany: (args: any) => Promise<any[]>
    deleteMany: (args: any) => Promise<{ count: number }>
    update: (args: any) => Promise<any>
    delete: (args: any) => Promise<any>
  }
}

/**
 * Execute an evidence-based merge INSIDE a caller-provided transaction.
 *
 * Moves every child row from `loserId` to `winnerId`, backfills the survivor's
 * missing identity fields, then deletes the loser. Must run in a transaction so
 * a mid-move failure rolls back entirely — a partial merge is worse than none.
 *
 * Idempotent-ish: if the loser is already gone (a concurrent merge won the
 * race), the updateMany/delete simply affect zero rows.
 */
export async function executeMerge(
  tx: MergeTx,
  decision: Extract<MergeDecision, { action: 'merge' }>,
): Promise<{ movedCustomFields: number }> {
  const { winnerId, loserId, backfill } = decision

  // 1. Move the straightforward children (no unique-key collisions possible).
  for (const model of SIMPLE_CHILD_MODELS) {
    await tx[model].updateMany({
      where: { customerId: loserId },
      data: { customerId: winnerId },
    })
  }

  // 2. CustomerCustomField: unique on (customerId, fieldDefinitionId). Only move
  //    a loser field when the winner does NOT already have that definition;
  //    otherwise the winner's value wins and the loser's duplicate is dropped.
  const winnerFields = await tx.customerCustomField.findMany({
    where: { customerId: winnerId },
    select: { fieldDefinitionId: true },
  })
  const winnerFieldIds = new Set(winnerFields.map((f: any) => f.fieldDefinitionId))
  const loserFields = await tx.customerCustomField.findMany({
    where: { customerId: loserId },
    select: { id: true, fieldDefinitionId: true },
  })
  let movedCustomFields = 0
  for (const field of loserFields) {
    if (winnerFieldIds.has(field.fieldDefinitionId)) {
      // Winner already has this field → drop the loser's duplicate.
      await tx.customerCustomField.delete({ where: { id: field.id } })
    } else {
      await tx.customerCustomField.update({
        where: { id: field.id },
        data: { customerId: winnerId },
      })
      movedCustomFields++
    }
  }

  // 3. Backfill the survivor's identity fields — EXCEPT phoneNumber, which is
  //    deferred until after the loser is deleted. Setting the survivor's
  //    phoneNumber to the real phone while the loser (which may hold that same
  //    phone) still exists would transiently violate
  //    @@unique([userId, phoneNumber, whatsappPhoneNumberId]).
  const { phoneNumber: repairPhone, ...identityBackfill } = backfill
  if (Object.keys(identityBackfill).length > 0) {
    await tx.customer.update({
      where: { id: winnerId },
      data: { ...identityBackfill, bsuidMappedAt: new Date() },
    })
  }

  // 4. Delete the loser (now childless).
  await tx.customer.delete({ where: { id: loserId } })

  // 5. Now that the loser is gone, promote the real phone onto the survivor if
  //    its stored phoneNumber was a BSUID placeholder. Safe from the unique
  //    collision because the row that held this phone (the loser) is deleted.
  if (repairPhone) {
    await tx.customer.update({
      where: { id: winnerId },
      data: { phoneNumber: repairPhone },
    })
  }

  return { movedCustomFields }
}

