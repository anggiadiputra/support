/**
 * Coexistence Contacts Sync Webhook Handler
 * Handles contact synchronization from WhatsApp Business App
 */

import { prisma } from '../../utils/database.js'

interface ContactSyncPayload {
  messaging_product: string
  metadata: {
    display_phone_number: string
    phone_number_id: string
  }
  state_sync: Array<{
    type: 'contact'
    contact: {
      full_name?: string
      first_name?: string
      // Optional since the BSUID rollout: a username-adopted contact may
      // arrive with no shared phone number (docs/bsuid.md).
      phone_number?: string
      user_id?: string // BSUID
      parent_user_id?: string // Parent BSUID
      username?: string // WhatsApp username
    }
    action: 'add' | 'remove'
    metadata: {
      timestamp: string
    }
  }>
}

/**
 * Handle contacts sync webhook (smb_app_state_sync)
 * Processes contact additions, edits, and removals
 */
export async function handleContactsSync(
  payload: ContactSyncPayload,
  user: any
): Promise<void> {
  try {
    if (!user) {
      console.warn('⚠️ Contacts sync webhook received but user not found')
      return
    }

    console.log(`📇 Processing contacts sync for user ${user.id}`)

    let processedCount = 0

    for (const stateSync of payload.state_sync) {
      if (stateSync.type !== 'contact') continue

      const contact = stateSync.contact
      const action = stateSync.action
      const timestamp = new Date(parseInt(stateSync.metadata.timestamp) * 1000)

      try {
        // The contact book is keyed on phone number (@@unique([userId,
        // phoneNumber]), phoneNumber is required). A username-only contact has
        // no phone to key on, so we skip it here rather than fabricate one —
        // creating a phone-less row would violate the schema. Its BSUID still
        // reaches us on the live `customer` record via inbound/status webhooks.
        if (!contact.phone_number) {
          console.log('⏭️ Skipping phone-less (BSUID-only) contact in contact sync')
          processedCount++
          continue
        }

        if (action === 'add') {
          // Add or update contact — now also persisting BSUID/username when Meta
          // includes them (nullable columns; older rows stay null).
          await prisma.whatsAppContact.upsert({
            where: {
              userId_phoneNumber: {
                userId: user.id,
                phoneNumber: contact.phone_number
              }
            },
            create: {
              userId: user.id,
              phoneNumber: contact.phone_number,
              fullName: contact.full_name,
              firstName: contact.first_name,
              whatsappBsuid: contact.user_id || null,
              whatsappParentBsuid: contact.parent_user_id || null,
              whatsappUsername: contact.username || null,
              lastAction: action,
              lastSyncedAt: timestamp
            },
            update: {
              fullName: contact.full_name,
              firstName: contact.first_name,
              // Only fill BSUID identifiers when newly provided; never null-out
              // an existing value with an omitted field.
              ...(contact.user_id ? { whatsappBsuid: contact.user_id } : {}),
              ...(contact.parent_user_id ? { whatsappParentBsuid: contact.parent_user_id } : {}),
              ...(contact.username ? { whatsappUsername: contact.username } : {}),
              lastAction: action,
              lastSyncedAt: timestamp
            }
          })

          console.log(`✅ Synced contact: ${contact.full_name || contact.phone_number}`)
        } else if (action === 'remove') {
          // Remove contact
          await prisma.whatsAppContact.updateMany({
            where: {
              userId: user.id,
              phoneNumber: contact.phone_number
            },
            data: {
              lastAction: action,
              lastSyncedAt: timestamp
            }
          })

          console.log(`🗑️ Marked contact as removed: ${contact.phone_number}`)
        }

        processedCount++
      } catch (contactError) {
        console.error(`❌ Failed to sync contact ${contact.phone_number}:`, contactError)
      }
    }

    // Update sync status
    const syncLog = await prisma.coexistenceSyncStatus.findFirst({
      where: {
        userId: user.id,
        syncType: 'contacts'
      },
      orderBy: { createdAt: 'desc' }
    })

    if (syncLog) {
      await prisma.coexistenceSyncStatus.update({
        where: { id: syncLog.id },
        data: {
          status: 'completed',
          progress: 100,
          metadata: {
            processedCount,
            lastSyncedAt: new Date().toISOString()
          }
        }
      })
    }

    // Mark contact sync as completed on WhatsApp account
    const whatsappAccount = await prisma.whatsAppAccount.findFirst({
      where: { userId: user.id }
    })
    if (whatsappAccount) {
      await prisma.whatsAppAccount.update({
        where: { id: whatsappAccount.id },
        data: {
          contactSyncCompletedAt: new Date(),
          coexistenceSyncProgress: Math.min(
            (whatsappAccount.coexistenceSyncProgress || 0) + 50,
            100
          )
        }
      })
    }

    console.log(`✅ Contacts sync completed for user ${user.id} - ${processedCount} contacts processed`)
  } catch (error) {
    console.error('❌ Contacts sync webhook error:', error)

    // Log error to sync status
    await prisma.coexistenceSyncStatus.updateMany({
      where: {
        userId: user?.id,
        syncType: 'contacts'
      },
      data: {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      }
    })

    throw error
  }
}
