import { PrismaClient, Role, SubscriptionTier, SubscriptionStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

interface CreateUserOptions {
  email: string
  password: string
  name: string
  role: Role
}

async function createUser(options: CreateUserOptions) {
  const { email, password, name, role } = options

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      console.error(`\n❌ User dengan email "${email}" sudah ada`)
      console.log(`   Role: ${existingUser.role}`)
      console.log(`   Name: ${existingUser.name}`)
      process.exit(1)
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)

    // Determine subscription tier based on role
    const subscriptionTier = role === Role.ADMIN ? SubscriptionTier.PRO : SubscriptionTier.FREE

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name,
        role,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        passwordHash,
        isActive: true,
        subscriptionTier,
      }
    })

    console.log(`\n✅ User berhasil dibuat:`)
    console.log(`   Email: ${user.email}`)
    console.log(`   Name: ${user.name}`)
    console.log(`   Role: ${user.role}`)

    // Create subscription
    await prisma.subscription.create({
      data: {
        userId: user.id,
        tier: subscriptionTier,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(),
        endDate: role === Role.ADMIN ? null : undefined, // Lifetime for admin
      }
    })

    console.log(`   Subscription: ${subscriptionTier}${role === Role.ADMIN ? ' (lifetime)' : ''}`)

    // Create Account record for better-auth compatibility
    await prisma.account.create({
      data: {
        id: `credential_${user.id}`,
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        password: passwordHash,
      }
    })

    console.log(`   ✅ Account record created for better-auth`)

    console.log(`\n📝 Login credentials:`)
    console.log(`   Email: ${email}`)
    console.log(`   Password: ${password}`)
    console.log(`\n⚠️  Simpan password ini! Tidak akan ditampilkan lagi.`)
    
    if (role === Role.ADMIN) {
      console.log(`\n🔐 User ini adalah ADMIN dengan akses penuh ke sistem.`)
    }

  } catch (error) {
    console.error('\n❌ Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Parse arguments
const args = process.argv.slice(2)
const email = args[0]
const password = args[1]
const name = args[2]
const roleStr = args[3]?.toUpperCase() || 'BUSINESS_OWNER'

const availableRoles = Object.values(Role)

function showHelp() {
  console.log(`
📝 Script untuk membuat user baru

Usage:
  tsx scripts/create-user.ts <email> <password> <name> [role]

Arguments:
  email     - Email user (required)
  password  - Password user (required, min 8 karakter)
  name      - Nama lengkap user (required)
  role      - Role user (optional, default: BUSINESS_OWNER)

Available roles:
  ${availableRoles.join(', ')}

Examples:
  # Buat admin user
  tsx scripts/create-user.ts admin@example.com SecurePass123! "Admin User" ADMIN

  # Buat business owner (default)
  tsx scripts/create-user.ts user@example.com MyPass123! "John Doe"

  # Buat agent
  tsx scripts/create-user.ts agent@example.com AgentPass123! "Agent Name" AGENT

Dari root project:
  pnpm --filter @kirimchat/backend exec tsx scripts/create-user.ts admin@example.com SecurePass123! "Admin User" ADMIN
`)
}

// Validation
if (!email || !password || !name) {
  showHelp()
  process.exit(1)
}

if (!email.includes('@')) {
  console.error('❌ Email tidak valid')
  process.exit(1)
}

if (password.length < 8) {
  console.error('❌ Password minimal 8 karakter')
  process.exit(1)
}

if (!availableRoles.includes(roleStr as Role)) {
  console.error(`❌ Role tidak valid: "${roleStr}"`)
  console.error(`   Role yang tersedia: ${availableRoles.join(', ')}`)
  process.exit(1)
}

console.log(`\n🔄 Membuat user...`)
console.log(`   Email: ${email}`)
console.log(`   Name: ${name}`)
console.log(`   Role: ${roleStr}`)

createUser({
  email,
  password,
  name,
  role: roleStr as Role
})
