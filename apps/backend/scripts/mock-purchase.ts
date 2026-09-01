/**
 * Mock Purchase Script
 * Creates a mock completed payment transaction for testing invoice feature
 * 
 * Usage: 
 *   tsx scripts/mock-purchase.ts <email> <tier> [amount] [durationMonths]
 * 
 * Example:
 *   tsx scripts/mock-purchase.ts admin@kirim.chat PRO 299000 1
 *   pnpm --filter @kirimchat/backend exec tsx scripts/mock-purchase.ts admin@kirim.chat LITE 99000 3
 */

import { PrismaClient, SubscriptionTier, SubscriptionStatus, PaymentMethod, PaymentStatus } from '@prisma/client'

const prisma = new PrismaClient()

// Default pricing per tier (monthly)
const DEFAULT_PRICES: Record<string, number> = {
  BASIC: 25000,
  LITE: 99000,
  PRO: 299000,
}

// Duration days mapping
const DURATION_DAYS: Record<number, number> = {
  1: 30,
  3: 90,
  6: 180,
  12: 365,
}

function generateOrderId(): string {
  const prefix = (process.env.API_KEY_PREFIX || 'kc').toUpperCase()
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `${prefix}-${timestamp}-${random}`
}

async function mockPurchase(
  email: string, 
  tier: SubscriptionTier, 
  amount?: number,
  durationMonths: number = 1
) {
  try {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      console.error(`User with email ${email} not found`)
      process.exit(1)
    }

    // Calculate amount if not provided
    const finalAmount = amount || (DEFAULT_PRICES[tier] * durationMonths)
    const durationDays = DURATION_DAYS[durationMonths] || 30

    // Generate order ID
    const orderId = generateOrderId()

    // Create payment date (now)
    const paidAt = new Date()
    const createdAt = new Date(paidAt.getTime() - 5 * 60 * 1000) // 5 minutes ago
    const expiresAt = new Date(createdAt.getTime() + 15 * 60 * 1000) // 15 min expiry

    // Create completed payment transaction
    const transaction = await prisma.paymentTransaction.create({
      data: {
        userId: user.id,
        orderId,
        amount: finalAmount,
        paymentMethod: PaymentMethod.QRIS,
        providerId: 'mock',
        targetTier: tier,
        durationDays,
        status: PaymentStatus.COMPLETED,
        expiresAt,
        paidAt,
        createdAt,
        referenceNo: `MOCK-${orderId}`,
      }
    })

    // Calculate subscription dates
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + durationDays)

    // Update subscription
    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: {
        tier,
        status: SubscriptionStatus.ACTIVE,
        startDate,
        endDate,
        updatedAt: new Date()
      },
      create: {
        userId: user.id,
        tier,
        status: SubscriptionStatus.ACTIVE,
        startDate,
        endDate
      }
    })

    // Update user subscription tier
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionTier: tier
      }
    })

    console.log('\n✅ Mock purchase created successfully!\n')
    console.log('Transaction Details:')
    console.log('-------------------')
    console.log(`Order ID:    ${orderId}`)
    console.log(`Invoice:     INV-${orderId}`)
    console.log(`User:        ${user.name} (${user.email})`)
    console.log(`Tier:        ${tier}`)
    console.log(`Amount:      Rp ${finalAmount.toLocaleString('id-ID')}`)
    console.log(`Duration:    ${durationMonths} bulan (${durationDays} hari)`)
    console.log(`Status:      COMPLETED`)
    console.log(`Paid At:     ${paidAt.toISOString()}`)
    console.log('\nSubscription:')
    console.log('-------------')
    console.log(`Start:       ${startDate.toISOString()}`)
    console.log(`End:         ${endDate.toISOString()}`)
    console.log('\n📄 View invoice at: /subscription/invoice/' + orderId)

  } catch (error) {
    console.error('Error creating mock purchase:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Parse arguments
const email = process.argv[2]
const tierStr = process.argv[3]?.toUpperCase()
const amount = process.argv[4] ? parseInt(process.argv[4]) : undefined
const durationMonths = parseInt(process.argv[5] || '1')

if (!email || !tierStr) {
  console.log('\nUsage: tsx scripts/mock-purchase.ts <email> <tier> [amount] [durationMonths]')
  console.log('\nArguments:')
  console.log('  email          - User email address')
  console.log('  tier           - Subscription tier (BASIC, LITE, PRO)')
  console.log('  amount         - Payment amount in IDR (optional, uses default pricing)')
  console.log('  durationMonths - Subscription duration: 1, 3, 6, or 12 (default: 1)')
  console.log('\nExamples:')
  console.log('  tsx scripts/mock-purchase.ts admin@kirim.chat PRO')
  console.log('  tsx scripts/mock-purchase.ts admin@kirim.chat LITE 99000 3')
  console.log('  tsx scripts/mock-purchase.ts user@example.com PRO 897000 3')
  console.log('\nFrom project root:')
  console.log('  pnpm --filter @kirimchat/backend exec tsx scripts/mock-purchase.ts admin@kirim.chat PRO')
  process.exit(1)
}

if (!Object.values(SubscriptionTier).includes(tierStr as SubscriptionTier)) {
  console.error(`\n❌ Invalid tier: ${tierStr}`)
  console.error(`Available tiers: ${Object.values(SubscriptionTier).join(', ')}`)
  process.exit(1)
}

if (![1, 3, 6, 12].includes(durationMonths)) {
  console.error(`\n❌ Invalid duration: ${durationMonths}`)
  console.error('Valid durations: 1, 3, 6, 12 months')
  process.exit(1)
}

mockPurchase(email, tierStr as SubscriptionTier, amount, durationMonths)
