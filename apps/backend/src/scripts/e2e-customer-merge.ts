/**
 * End-to-end smoke test for evidence-based customer merge against a REAL
 * Postgres (the local Docker dev DB — NOT production).
 *
 * It seeds a split-identity pair (an old phone-only customer + a newer
 * BSUID-only customer) plus a couple of child rows, runs the same
 * decideMerge + executeMerge the webhook worker runs, and asserts the survivor
 * ends up with BOTH identities and ALL the children. Everything it creates is
 * removed at the end (scoped by a unique marker), so it never pollutes dev data.
 *
 * Usage (from apps/backend):
 *   pnpm tsx src/scripts/e2e-customer-merge.ts
 *
 * DO NOT run against a production database.
 */

import { prisma } from '../utils/database.js'
import { decideMerge, executeMerge, type MergeCandidate } from '../utils/customer-merge.js'
import { isValidBsuid } from '../types/whatsapp-bsuid.js'

const MARKER = `e2e-merge-${Date.now()}`
const PHONE = `62899${Math.floor(Math.random() * 1e7)}`
const BSUID = `ID.${Math.floor(Math.random() * 1e15)}`

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

async function main() {
  // Use any existing user (this is a dev DB). We only touch rows we create.
  const user = await prisma.user.findFirst({ select: { id: true } })
  if (!user) throw new Error('No user in dev DB to attach the test customers to')
  const userId = user.id
  console.log(`Using userId=${userId}, marker=${MARKER}`)

  let winnerId: string | null = null
  const createdCustomerIds: string[] = []

  try {
    // 1. Seed the OLDER BSUID-only customer (created earlier) — its phoneNumber
    //    holds the BSUID (username-only convention). Making the BSUID row the
    //    OLDER one exercises the phoneNumber-repair path (survivor's phone is a
    //    BSUID placeholder and must be repaired to the real phone).
    const bsuidRow = await prisma.customer.create({
      data: {
        userId,
        phoneNumber: BSUID,
        whatsappBsuid: BSUID,
        whatsappUsername: `user_${MARKER}`,
        name: null,
        consentStatus: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    })
    createdCustomerIds.push(bsuidRow.id)

    // 2. Seed the NEWER phone-only customer.
    const phoneRow = await prisma.customer.create({
      data: {
        userId,
        phoneNumber: PHONE,
        name: `A ${MARKER}`,
        consentStatus: true,
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
    })
    createdCustomerIds.push(phoneRow.id)

    // 3. Give the LOSER (phoneRow, the newer one) children that must survive the
    //    merge by moving to the survivor (bsuidRow).
    await prisma.message.create({
      data: {
        userId,
        customerId: phoneRow.id,
        direction: 'INBOUND',
        messageType: 'TEXT',
        content: `hello ${MARKER}`,
        status: 'DELIVERED',
        wamId: `wamid.${MARKER}`,
      },
    })
    await prisma.consentLog.create({
      data: { userId, customerId: phoneRow.id, action: 'OPT_IN', source: 'E2E', purpose: MARKER },
    })

    console.log('Seeded: bsuidRow(old, winner) + phoneRow(new, loser) + 1 message + 1 consentLog on the loser')

    // 4. Simulate the webhook carrying BOTH identifiers → decide + execute merge.
    const toCand = (c: any): MergeCandidate => ({
      id: c.id,
      phoneNumber: c.phoneNumber,
      whatsappBsuid: c.whatsappBsuid,
      whatsappParentBsuid: c.whatsappParentBsuid,
      whatsappUsername: c.whatsappUsername,
      name: c.name,
      createdAt: c.createdAt,
    })
    const decision = decideMerge(toCand(phoneRow), toCand(bsuidRow), {
      realPhone: PHONE,
      isBsuid: isValidBsuid,
    })
    assert(decision.action === 'merge', 'decision is merge')
    if (decision.action !== 'merge') return
    assert(decision.winnerId === bsuidRow.id, 'winner is the OLDER row (bsuidRow)')
    assert(decision.loserId === phoneRow.id, 'loser is the NEWER row (phoneRow)')
    winnerId = decision.winnerId

    await prisma.$transaction(async (tx) => {
      await executeMerge(tx as any, decision)
    })

    // 5. Verify survivor state.
    const survivor = await prisma.customer.findUnique({ where: { id: winnerId } })
    assert(survivor, 'survivor exists')
    assert(survivor!.whatsappBsuid === BSUID, 'survivor kept the BSUID')
    assert(survivor!.phoneNumber === PHONE, 'survivor phoneNumber was REPAIRED to the real phone (was a BSUID placeholder)')
    assert(survivor!.name === `A ${MARKER}`, 'survivor backfilled the name from the loser')

    const loserGone = await prisma.customer.findUnique({ where: { id: phoneRow.id } })
    assert(loserGone === null, 'loser row was deleted')

    // 6. Verify children moved to the survivor.
    const msg = await prisma.message.findFirst({ where: { wamId: `wamid.${MARKER}` } })
    assert(msg && msg.customerId === winnerId, 'message moved to survivor')
    const consent = await prisma.consentLog.findFirst({ where: { purpose: MARKER } })
    assert(consent && consent.customerId === winnerId, 'consentLog moved to survivor')

    console.log('\n✅ E2E MERGE PASSED — survivor has both identities + all children, loser gone.')
  } finally {
    // Cleanup — delete everything we created (children first, then customers).
    console.log('\nCleaning up test rows...')
    await prisma.message.deleteMany({ where: { wamId: `wamid.${MARKER}` } })
    await prisma.consentLog.deleteMany({ where: { purpose: MARKER } })
    const idsToDelete = winnerId ? [winnerId, ...createdCustomerIds] : createdCustomerIds
    for (const id of [...new Set(idsToDelete)]) {
      await prisma.customer.deleteMany({ where: { id } })
    }
    console.log('Cleanup done.')
  }
}

main()
  .catch((e) => {
    console.error('\n❌ E2E FAILED:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
