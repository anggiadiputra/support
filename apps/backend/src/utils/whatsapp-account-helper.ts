import { prisma } from './database.js'
import { tokenEncryption } from './tokenEncryption.js'
import { WhatsAppAPI } from './whatsapp.js'
import type { WhatsAppAccount, PhoneNumber, User } from '@prisma/client'

/**
 * WhatsApp Account with phone numbers and user
 */
export type WhatsAppAccountWithRelations = WhatsAppAccount & {
  phoneNumbers: PhoneNumber[]
  user: User
}

/**
 * PhoneNumber with its WhatsApp account and user
 */
export type PhoneNumberWithAccount = PhoneNumber & {
  whatsappAccount: WhatsAppAccount | null
  user: User
}

/**
 * Resolved WhatsApp credentials for making API calls
 */
export interface WhatsAppCredentials {
  phoneNumberId: string
  phoneNumberRecordId: string // PhoneNumber.id (CUID) for saving on Message/Customer
  displayPhoneNumber: string // E.164 formatted phone number for display
  accessToken: string
  wabaId: string
  whatsappAccountId: string
  userId: string
}

/**
 * Find a WhatsApp account by phone number ID (for webhook routing).
 * Looks up the PhoneNumber record and includes its WhatsAppAccount and User.
 */
export async function getWhatsAppAccountByPhoneNumberId(
  phoneNumberId: string
): Promise<PhoneNumberWithAccount | null> {
  return prisma.phoneNumber.findUnique({
    where: { phoneNumberId },
    include: {
      whatsappAccount: true,
      user: true,
    },
  }) as Promise<PhoneNumberWithAccount | null>
}

/**
 * Get all connected WhatsApp accounts for a user.
 */
export async function getWhatsAppAccountsForUser(
  userId: string,
  onlyConnected = true
): Promise<WhatsAppAccountWithRelations[]> {
  return prisma.whatsAppAccount.findMany({
    where: {
      userId,
      ...(onlyConnected ? { connectionStatus: 'connected' } : {}),
    },
    include: {
      phoneNumbers: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      },
      user: true,
    },
    orderBy: { connectedAt: 'desc' },
  }) as Promise<WhatsAppAccountWithRelations[]>
}

/**
 * Get a specific WhatsApp account by its WABA ID.
 */
export async function getWhatsAppAccountByWabaId(
  wabaId: string
): Promise<WhatsAppAccountWithRelations | null> {
  return prisma.whatsAppAccount.findUnique({
    where: { wabaId },
    include: {
      phoneNumbers: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      },
      user: true,
    },
  }) as Promise<WhatsAppAccountWithRelations | null>
}

/**
 * Get a specific WhatsApp account by its internal ID.
 */
export async function getWhatsAppAccountById(
  id: string
): Promise<WhatsAppAccountWithRelations | null> {
  return prisma.whatsAppAccount.findUnique({
    where: { id },
    include: {
      phoneNumbers: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      },
      user: true,
    },
  }) as Promise<WhatsAppAccountWithRelations | null>
}

/**
 * Decrypt the access token for a WhatsApp account.
 * Throws error if token is invalid placeholder.
 */
export function decryptAccountToken(account: WhatsAppAccount): string {
  const token = tokenEncryption.decrypt({
    ciphertext: account.accessToken,
    iv: account.accessTokenIV,
    authTag: account.accessTokenTag,
    algorithm: 'aes-256-gcm',
  })
  
  // Validate token is not a placeholder
  if (!token || token === 'your-meta-access-token' || token.includes('your-') || token.length < 50) {
    throw new Error(
      'Invalid WABA token detected. Please reconnect your WhatsApp Business Account via OAuth to get a valid token.'
    )
  }
  
  return token
}

/**
 * Create a WhatsApp API client configured for a specific account.
 */
export function createWhatsAppApiForAccount(account: WhatsAppAccount): WhatsAppAPI {
  const accessToken = decryptAccountToken(account)
  return new WhatsAppAPI({ accessToken })
}

/**
 * Resolve WhatsApp credentials for a specific phone number.
 * Used when you know which phone number to use (e.g., from a customer link).
 */
export async function resolveCredentialsByPhoneNumber(
  phoneNumberRecord: PhoneNumberWithAccount
): Promise<WhatsAppCredentials | null> {
  const account = phoneNumberRecord.whatsappAccount
  if (!account || account.connectionStatus !== 'connected') {
    return null
  }

  return {
    phoneNumberId: phoneNumberRecord.phoneNumberId,
    phoneNumberRecordId: phoneNumberRecord.id,
    displayPhoneNumber: phoneNumberRecord.displayPhoneNumber,
    accessToken: decryptAccountToken(account),
    wabaId: account.wabaId,
    whatsappAccountId: account.id,
    userId: account.userId,
  }
}

/**
 * Resolve WhatsApp credentials for sending.
 * Priority: explicit phoneNumberId override > customer's linked phone number > primary phone number > any connected.
 * 
 * whatsappPhoneNumberId can be either:
 * - Database record ID (CUID like "cmm37nyuq000tcozkqmufpggs")
 * - Meta phone_number_id (numeric string like "918771144648527")
 */
export async function resolveCredentialsForSending(
  userId: string,
  customerId?: string,
  whatsappPhoneNumberId?: string
): Promise<WhatsAppCredentials | null> {
  // If explicit phone number override is provided, use that first
  if (whatsappPhoneNumberId) {
    // Try to find by database ID first, then by Meta phone_number_id
    const phoneRecord = await prisma.phoneNumber.findFirst({
      where: {
        OR: [
          { id: whatsappPhoneNumberId },
          { phoneNumberId: whatsappPhoneNumberId },
        ],
        userId,
        whatsappAccount: {
          connectionStatus: 'connected',
        },
      },
      include: {
        whatsappAccount: true,
      },
    })

    if (phoneRecord?.whatsappAccount) {
      return {
        phoneNumberId: phoneRecord.phoneNumberId,
        phoneNumberRecordId: phoneRecord.id,
        displayPhoneNumber: phoneRecord.displayPhoneNumber,
        accessToken: decryptAccountToken(phoneRecord.whatsappAccount),
        wabaId: phoneRecord.whatsappAccount.wabaId,
        whatsappAccountId: phoneRecord.whatsappAccount.id,
        userId: phoneRecord.whatsappAccount.userId,
      }
    }

    // Override specified but not found/not connected - return null
    return null
  }

  // If customer has a linked phone number, use that
  if (customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        whatsappPhoneNumber: {
          include: { whatsappAccount: true },
        },
      },
    })

    if (customer?.whatsappPhoneNumber?.whatsappAccount) {
      const account = customer.whatsappPhoneNumber.whatsappAccount
      if (account.connectionStatus === 'connected') {
        return {
          phoneNumberId: customer.whatsappPhoneNumber.phoneNumberId,
          phoneNumberRecordId: customer.whatsappPhoneNumber.id,
          displayPhoneNumber: customer.whatsappPhoneNumber.displayPhoneNumber,
          accessToken: decryptAccountToken(account),
          wabaId: account.wabaId,
          whatsappAccountId: account.id,
          userId: account.userId,
        }
      }
    }
  }

  // Fallback: primary phone number of first connected account
  const primaryPhone = await prisma.phoneNumber.findFirst({
    where: {
      userId,
      isPrimary: true,
      whatsappAccount: {
        connectionStatus: 'connected',
      },
    },
    include: {
      whatsappAccount: true,
    },
  })

  if (primaryPhone?.whatsappAccount) {
    return {
      phoneNumberId: primaryPhone.phoneNumberId,
      phoneNumberRecordId: primaryPhone.id,
      displayPhoneNumber: primaryPhone.displayPhoneNumber,
      accessToken: decryptAccountToken(primaryPhone.whatsappAccount),
      wabaId: primaryPhone.whatsappAccount.wabaId,
      whatsappAccountId: primaryPhone.whatsappAccount.id,
      userId: primaryPhone.whatsappAccount.userId,
    }
  }

  // Last resort: any connected phone number
  const anyPhone = await prisma.phoneNumber.findFirst({
    where: {
      userId,
      whatsappAccount: {
        connectionStatus: 'connected',
      },
    },
    include: {
      whatsappAccount: true,
    },
  })

  if (anyPhone?.whatsappAccount) {
    return {
      phoneNumberId: anyPhone.phoneNumberId,
      phoneNumberRecordId: anyPhone.id,
      displayPhoneNumber: anyPhone.displayPhoneNumber,
      accessToken: decryptAccountToken(anyPhone.whatsappAccount),
      wabaId: anyPhone.whatsappAccount.wabaId,
      whatsappAccountId: anyPhone.whatsappAccount.id,
      userId: anyPhone.whatsappAccount.userId,
    }
  }

  return null
}

/**
 * Get the primary phone number for a user (across all accounts).
 */
export async function getPrimaryPhoneNumber(
  userId: string
): Promise<PhoneNumberWithAccount | null> {
  return prisma.phoneNumber.findFirst({
    where: {
      userId,
      isPrimary: true,
      whatsappAccount: {
        connectionStatus: 'connected',
      },
    },
    include: {
      whatsappAccount: true,
      user: true,
    },
  }) as Promise<PhoneNumberWithAccount | null>
}
