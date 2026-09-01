import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import { templateCacheService } from '../../services/template-cache-service.js'
import { resolveContext, getEffectiveUserId } from '../../middleware/resolveContext.js'
import { getWhatsAppAccountsForUser, createWhatsAppApiForAccount } from '../../utils/whatsapp-account-helper.js'
import { logger, extractAxiosError } from '../../utils/logger.js'

const app = new Hono()

// Apply context resolution middleware
// This ensures agents can sync templates for their business owner
// Requirements: 6.1, 6.2
app.use('*', resolveContext)

// POST /api/v1/templates/sync - Sync templates from Meta (all connected WABA accounts)
app.post('/sync', async (c: Context) => {
  try {
    const userId = getEffectiveUserId(c)

    if (!userId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    // Get all connected WhatsApp accounts for this user
    const whatsappAccounts = await getWhatsAppAccountsForUser(userId)

    if (!whatsappAccounts.length) {
      return c.json({
        error: {
          code: 'BadRequest',
          message: 'WhatsApp Business Account not connected'
        }
      }, 400)
    }

    let totalCreated = 0
    let totalDeleted = 0
    let totalSynced = 0

    // Loop through ALL connected accounts and sync templates for each
    for (const account of whatsappAccounts) {
      const wabaId = account.wabaId
      const whatsappAccountId = account.id

      console.log(`🔄 Syncing templates from Meta for WABA ${wabaId} (account ${whatsappAccountId}), userId: ${userId}`)

      try {
        // Create per-account WhatsApp client with decrypted token
        const whatsapp = createWhatsAppApiForAccount(account)

        const metaTemplates = await whatsapp['client'].get(`/${wabaId}/message_templates`, {
          params: {
            limit: 100,
            fields: 'id,name,status,category,language,components,rejected_reason'
          }
        })

        const metaTemplateList = metaTemplates.data.data || []

        console.log(`📋 Found ${metaTemplateList.length} templates from Meta for WABA ${wabaId}`)

        // Delete existing templates for this specific account
        const deleteResult = await prisma.messageTemplate.deleteMany({
          where: { userId, whatsappAccountId }
        })
        totalDeleted += deleteResult.count
        console.log(`🗑️ Deleted ${deleteResult.count} existing templates for account ${whatsappAccountId}`)

        // Create all templates from Meta for this account
        for (const metaTemplate of metaTemplateList) {
          let content = ''
          let headerType = null
          let headerContent = null
          let footerContent = null
          let buttons = null

          if (metaTemplate.components) {
            const bodyComponent = metaTemplate.components.find((c: any) => c.type === 'BODY')
            const headerComponent = metaTemplate.components.find((c: any) => c.type === 'HEADER')
            const footerComponent = metaTemplate.components.find((c: any) => c.type === 'FOOTER')
            const buttonsComponent = metaTemplate.components.find((c: any) => c.type === 'BUTTONS')

            if (bodyComponent) {
              content = bodyComponent.text || ''
            }
            if (headerComponent) {
              headerType = headerComponent.format || null
              headerContent = headerComponent.text || null
            }
            if (footerComponent) {
              footerContent = footerComponent.text || null
            }
            if (buttonsComponent) {
              buttons = buttonsComponent.buttons || null
            }
          }

          await prisma.messageTemplate.create({
            data: {
              userId,
              whatsappAccountId,
              templateName: metaTemplate.name,
              category: metaTemplate.category || 'UTILITY',
              language: metaTemplate.language,
              content: content,
              headerType: headerType,
              headerContent: headerContent,
              footerContent: footerContent,
              buttons: buttons,
              status: metaTemplate.status,
              metaTemplateId: metaTemplate.id,
              approvedAt: metaTemplate.status === 'APPROVED' ? new Date() : null,
              rejectionReason: metaTemplate.status === 'REJECTED' ? metaTemplate.rejected_reason : null
            }
          })
          totalCreated++
          totalSynced++
        }
      } catch (accountError: any) {
        console.error(`❌ Failed to sync templates for WABA ${wabaId}:`, accountError.message)
        // Continue to next account instead of failing entirely
      }
    }

    console.log(`✅ Synced ${totalSynced} templates across ${whatsappAccounts.length} accounts: ${totalCreated} created, ${totalDeleted} old deleted`)

    // Invalidate template list cache after sync
    await templateCacheService.invalidateTemplateList(userId)

    return c.json({
      success: true,
      data: {
        synced: totalSynced,
        created: totalCreated,
        deleted: totalDeleted,
        accounts: whatsappAccounts.length,
        message: `Synced ${totalSynced} templates from ${whatsappAccounts.length} account(s) (${totalDeleted} old removed, ${totalCreated} created)`
      }
    })
  } catch (error: any) {
    logger.error('Sync templates error', { error: extractAxiosError(error) })
    return c.json({
      error: {
        code: 'SyncError',
        message: error.message || 'Failed to sync templates'
      }
    }, 500)
  }
})

export default app
