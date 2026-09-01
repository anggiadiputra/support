import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'

export async function handleTemplateStatus(
  templateStatus: any,
  user: any
): Promise<void> {
  try {
    if (!user) {
      console.error('❌ User not found for template status update')
      return
    }

    console.log('📋 Processing template status:', {
      templateName: templateStatus.message_template_name,
      event: templateStatus.event,
      userId: user.id
    })

    // Map Meta event to our status
    const statusMap: Record<string, string> = {
      'APPROVED': 'APPROVED',
      'REJECTED': 'REJECTED',
      'PENDING': 'PENDING',
      'PAUSED': 'PAUSED',
      'DISABLED': 'DISABLED'
    }

    const newStatus = statusMap[templateStatus.event] || 'PENDING'

    // Update template status
    const result = await prisma.messageTemplate.updateMany({
      where: {
        userId: user.id,
        templateName: templateStatus.message_template_name,
        language: templateStatus.message_template_language
      },
      data: {
        status: newStatus as any,
        rejectionReason: templateStatus.reason || null,
        approvedAt: newStatus === 'APPROVED' ? new Date() : null
      }
    })

    if (result.count > 0) {
      console.log('✅ Template status updated:', templateStatus.message_template_name, '→', newStatus)

      // Audit log for template approval/rejection
      if (newStatus === 'APPROVED' || newStatus === 'REJECTED') {
        await auditLog(
          newStatus === 'APPROVED' ? 'TEMPLATE_APPROVED' : 'TEMPLATE_REJECTED',
          'MessageTemplate',
          templateStatus.message_template_name,
          {
            templateName: templateStatus.message_template_name,
            language: templateStatus.message_template_language,
            reason: templateStatus.reason || null
          },
          user.id
        )
      }
    } else {
      console.log('⚠️ Template not found:', templateStatus.message_template_name)
    }
  } catch (error) {
    console.error('❌ Error handling template status:', error)
    throw error
  }
}
