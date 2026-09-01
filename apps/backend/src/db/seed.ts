import { PrismaClient, Role, SubscriptionTier, SubscriptionStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...\n')

  // Admin user seed data
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@kirimchat.com'
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!'
  const adminName = process.env.ADMIN_NAME || 'Admin KirimChat'

  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail }
  })

  if (existingAdmin) {
    console.log(`⚠️  Admin user already exists: ${adminEmail}`)
    console.log(`   Role: ${existingAdmin.role}`)
    
    // Update role to ADMIN if not already
    if (existingAdmin.role !== Role.ADMIN) {
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: { role: Role.ADMIN }
      })
      console.log(`   ✅ Updated role to ADMIN`)
    }
  } else {
    // Hash password
    const passwordHash = await bcrypt.hash(adminPassword, 12)

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: adminName,
        role: Role.ADMIN,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        passwordHash,
        isActive: true,
        subscriptionTier: SubscriptionTier.PRO,
      }
    })

    console.log(`✅ Admin user created:`)
    console.log(`   Email: ${admin.email}`)
    console.log(`   Name: ${admin.name}`)
    console.log(`   Role: ${admin.role}`)

    // Create subscription for admin
    await prisma.subscription.create({
      data: {
        userId: admin.id,
        tier: SubscriptionTier.PRO,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(),
        endDate: null, // Lifetime for admin
      }
    })

    console.log(`   ✅ PRO subscription created (lifetime)`)
  }

  // Create Account record for better-auth compatibility
  const adminUser = await prisma.user.findUnique({
    where: { email: adminEmail },
    include: { accounts: true }
  })

  if (adminUser) {
    const existingCredAccount = adminUser.accounts.find(a => a.providerId === 'credential')
    if (!existingCredAccount) {
      await prisma.account.create({
        data: {
          id: `credential_${adminUser.id}`,
          userId: adminUser.id,
          accountId: adminUser.id,
          providerId: 'credential',
          issuer: 'local:credential',
          password: adminUser.passwordHash,
        }
      })
      console.log(`   ✅ Account record created for better-auth`)
    } else {
      await prisma.account.update({
        where: { id: existingCredAccount.id },
        data: {
          issuer: 'local:credential',
          password: adminUser.passwordHash,
        }
      })
      console.log(`   ✅ Account record updated for better-auth`)
    }
  }

  console.log('\n🎉 Seed completed!')
  console.log('\n📝 Login credentials:')
  console.log(`   Email: ${adminEmail}`)
  console.log(`   Password: ${adminPassword}`)
  console.log('\n⚠️  Please change the password after first login!')
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
