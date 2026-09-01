import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import { WhatsAppAPI } from '../../utils/whatsapp.js'
import { templateCacheService } from '../../services/template-cache-service.js'
import { resolveCredentialsForSending } from '../../utils/whatsapp-account-helper.js'

const app = new Hono()

// DELETE /api/v1/templates/:id - Delete template
app.delete('/:id', async (c: Context) => {
  try {
    const id = c.req.param('id')

    const template = await prisma.messageTemplate.findUnique({
      where: { id }
    })

    if (!template) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Template not found'
        }
      }, 404)
    }

    // Check access
    if (c.user?.role !== 'ADMIN' && c.user?.id !== template.userId) {
      return c.json({
        error: {
          code: 'Forbidden',
          message: 'Access denied'
        }
      }, 403)
    }

    // If template is submitted to Meta, delete from Meta first
    if (template.metaTemplateId) {
      try {
        const credentials = await resolveCredentialsForSending(template.userId)
        if (credentials) {
          const whatsapp = new WhatsAppAPI({ accessToken: credentials.accessToken })
          await whatsapp.deleteTemplate(credentials.wabaId, template.templateName)
        }
      } catch (metaError) {
        console.error('Failed to delete from Meta:', metaError)
        // Continue with local deletion even if Meta deletion fails
      }
    }

    // Delete template
    await prisma.messageTemplate.delete({
      where: { id }
    })

    // Audit log
    await auditLog(
      'TEMPLATE_DELETED',
      'MessageTemplate',
      id,
      {
        templateName: template.templateName,
        deletedBy: c.user?.id
      },
      c.user?.id
    )

    // Invalidate template list cache
    await templateCacheService.invalidateTemplateList(template.userId)
    // Also invalidate variable mappings for this template
    await templateCacheService.invalidateVariableMappings(template.userId, template.templateName)

    return c.json({
      success: true,
      message: 'Template deleted successfully'
    })
  } catch (error) {
    console.error('Delete template error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to delete template'
      }
    }, 500)
  }
})

export default app
