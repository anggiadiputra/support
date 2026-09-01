import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'

const app = new Hono()

// DELETE /api/v1/customers/:id - Delete customer
app.delete('/:id', async (c: Context) => {
  try {
    const id = c.req.param('id')

    const customer = await prisma.customer.findUnique({ where: { id } })
    if (!customer) {
      return c.json({ error: { code: 'NotFound', message: 'Customer not found' } }, 404)
    }

    // Check access
    if (c.user?.role !== 'ADMIN' && c.user?.id !== customer.userId) {
      return c.json({ error: { code: 'Forbidden', message: 'Access denied' } }, 403)
    }

    // Delete customer and all related data in a transaction
    // Some relations don't have onDelete: Cascade, so we need to delete manually
    const result = await prisma.$transaction(async (tx) => {
      // Count related data for audit log
      const [
        messagesCount,
        consentLogsCount,
        customFieldsCount,
        activitiesCount,
        notesCount,
        variableHistoryCount,
      ] = await Promise.all([
        tx.message.count({ where: { customerId: id } }),
        tx.consentLog.count({ where: { customerId: id } }),
        tx.customerCustomField.count({ where: { customerId: id } }),
        tx.customerActivity.count({ where: { customerId: id } }),
        tx.customerNote.count({ where: { customerId: id } }),
        tx.templateVariableHistory.count({ where: { customerId: id } }),
      ])

      // Delete related data that doesn't have onDelete: Cascade
      await tx.message.deleteMany({ where: { customerId: id } })
      await tx.consentLog.deleteMany({ where: { customerId: id } })
      await tx.templateVariableHistory.deleteMany({ where: { customerId: id } })

      // Update IGConversation to remove customer reference (onDelete: SetNull)
      await tx.iGConversation.updateMany({
        where: { customerId: id },
        data: { customerId: null }
      })

      // Delete customer (will cascade to CustomerCustomField, CustomerActivity, CustomerNote)
      await tx.customer.delete({ where: { id } })

      return {
        messagesCount,
        consentLogsCount,
        customFieldsCount,
        activitiesCount,
        notesCount,
        variableHistoryCount,
      }
    })

    await auditLog('CUSTOMER_DELETED', 'Customer', id, {
      phoneNumber: customer.phoneNumber,
      name: customer.name,
      deletedBy: c.user?.id,
      deletedData: result
    }, c.user?.id)

    return c.json({
      success: true,
      message: 'Pelanggan berhasil dihapus',
      data: {
        customer: {
          id: customer.id,
          name: customer.name,
          phoneNumber: customer.phoneNumber,
        },
        deletedData: {
          messages: result.messagesCount,
          consentLogs: result.consentLogsCount,
          customFields: result.customFieldsCount,
          activities: result.activitiesCount,
          notes: result.notesCount,
          variableHistory: result.variableHistoryCount,
        }
      }
    })
  } catch (error) {
    console.error('Delete customer error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Gagal menghapus pelanggan' } }, 500)
  }
})

export default app
