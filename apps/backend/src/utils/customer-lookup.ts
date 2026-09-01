import { prisma } from './database.js'
import { isValidBsuid } from '../types/whatsapp-bsuid.js'

/**
 * Customer lookup result
 */
export interface CustomerLookupResult {
  customer: {
    id: string
    phoneNumber: string
    whatsappBsuid: string | null
    whatsappUsername: string | null
    name: string | null
  } | null
  matchedBy: 'phone' | 'bsuid' | null
}

/**
 * Find customer by phone number or BSUID
 * Tries phone number first, then BSUID
 * 
 * @param userId - Business user ID
 * @param identifier - Phone number or BSUID
 * @param whatsappPhoneNumberId - Optional: specific business phone number
 */
export async function findCustomerByIdentifier(
  userId: string,
  identifier: string,
  whatsappPhoneNumberId?: string | null
): Promise<CustomerLookupResult> {
  // Determine if identifier looks like BSUID
  const isBsuid = isValidBsuid(identifier)
  
  // Try phone number lookup first (faster index, more common)
  if (!isBsuid) {
    const customer = await prisma.customer.findFirst({
      where: {
        userId,
        phoneNumber: identifier,
        ...(whatsappPhoneNumberId && { whatsappPhoneNumberId }),
      },
      select: {
        id: true,
        phoneNumber: true,
        whatsappBsuid: true,
        whatsappUsername: true,
        name: true,
      },
    })
    
    if (customer) {
      return { customer, matchedBy: 'phone' }
    }
  }
  
  // Try BSUID lookup
  if (isBsuid || !identifier.startsWith('+')) {
    const customer = await prisma.customer.findFirst({
      where: {
        userId,
        whatsappBsuid: identifier,
        ...(whatsappPhoneNumberId && { whatsappPhoneNumberId }),
      },
      select: {
        id: true,
        phoneNumber: true,
        whatsappBsuid: true,
        whatsappUsername: true,
        name: true,
      },
    })
    
    if (customer) {
      return { customer, matchedBy: 'bsuid' }
    }
  }
  
  return { customer: null, matchedBy: null }
}

/**
 * Get send target for customer
 * Returns phone number if available, otherwise BSUID
 * 
 * @param customer - Customer record
 * @returns Object with to (phone) and/or recipient (BSUID)
 */
export function getSendTarget(customer: {
  phoneNumber: string
  whatsappBsuid?: string | null
}): { to?: string; recipient?: string } {
  // Phone number always prioritized
  const isPhoneBsuid = isValidBsuid(customer.phoneNumber)
  
  if (!isPhoneBsuid) {
    // Has real phone number
    return { 
      to: customer.phoneNumber,
      // Include BSUID for future optimization (May 2026+)
      ...(customer.whatsappBsuid && { recipient: customer.whatsappBsuid })
    }
  }
  
  // Phone number field contains BSUID (username-only user)
  return { recipient: customer.phoneNumber }
}
