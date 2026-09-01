/**
 * BSUID Migration Script
 * 
 * This script helps map BSUIDs to existing customers after the 31 Mar 2026 rollout.
 * Run this periodically to report on BSUID coverage.
 * 
 * Usage: npx tsx src/scripts/migrate-bsuid.ts
 */

import { prisma } from '../utils/database.js'

async function main() {
  console.log('BSUID Migration Report')
  console.log('======================\n')
  
  // Get total customers
  const totalCustomers = await prisma.customer.count()
  
  // Get customers with BSUID
  const withBsuid = await prisma.customer.count({
    where: { whatsappBsuid: { not: null } }
  })
  
  // Get customers with username
  const withUsername = await prisma.customer.count({
    where: { whatsappUsername: { not: null } }
  })
  
  // Get customers without phone number (BSUID-only)
  const bsuidOnly = await prisma.customer.count({
    where: {
      phoneNumber: { startsWith: 'US.' } // BSUID format
    }
  })
  
  // Count other country prefixes for BSUID-only customers (ID., GB., etc.)
  const bsuidOnlyID = await prisma.customer.count({
    where: { phoneNumber: { startsWith: 'ID.' } }
  })
  const bsuidOnlyGB = await prisma.customer.count({
    where: { phoneNumber: { startsWith: 'GB.' } }
  })
  const bsuidOnlyOther = bsuidOnlyID + bsuidOnlyGB
  
  const percentWithBsuid = totalCustomers > 0 ? ((withBsuid/totalCustomers)*100).toFixed(1) : '0.0'
  
  console.log(`Total customers:        ${totalCustomers}`)
  console.log(`With BSUID mapped:      ${withBsuid} (${percentWithBsuid}%)`)
  console.log(`With username:          ${withUsername}`)
  console.log(`BSUID-only (no phone):  ${bsuidOnly}`)
  
  if (totalCustomers === 0) {
    console.log('\nNo customers found in database.')
    return
  }
  
  // Recent BSUID mappings
  const recentMappings = await prisma.customer.findMany({
    where: { bsuidMappedAt: { not: null } },
    orderBy: { bsuidMappedAt: 'desc' },
    take: 10,
    select: {
      phoneNumber: true,
      whatsappBsuid: true,
      whatsappUsername: true,
      bsuidMappedAt: true,
    }
  })
  
  if (recentMappings.length > 0) {
    console.log('\nRecent BSUID Mappings:')
    for (const c of recentMappings) {
      const username = c.whatsappUsername ? ` (${c.whatsappUsername})` : ''
      console.log(`  ${c.phoneNumber} -> ${c.whatsappBsuid}${username} (${c.bsuidMappedAt?.toISOString()})`)
    }
  } else {
    console.log('\nNo BSUID mappings recorded yet.')
  }
  
  // Customers with parent BSUID (linked portfolios)
  const withParentBsuid = await prisma.customer.count({
    where: { whatsappParentBsuid: { not: null } }
  })
  
  if (withParentBsuid > 0) {
    console.log(`\nCustomers with parent BSUID (linked portfolios): ${withParentBsuid}`)
  }
  
  // Per-business breakdown (top 5)
  const perBusinessStats = await prisma.customer.groupBy({
    by: ['userId'],
    _count: { id: true },
    where: { whatsappBsuid: { not: null } },
    orderBy: { _count: { id: 'desc' } },
    take: 5,
  })
  
  if (perBusinessStats.length > 0) {
    console.log('\nTop 5 businesses by BSUID coverage:')
    for (const stat of perBusinessStats) {
      const totalForUser = await prisma.customer.count({ where: { userId: stat.userId } })
      const percent = ((stat._count.id / totalForUser) * 100).toFixed(1)
      console.log(`  User ${stat.userId.slice(0, 8)}...: ${stat._count.id}/${totalForUser} (${percent}%)`)
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
