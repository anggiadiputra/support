import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { prisma } from '../../utils/database.js'
import { getEffectiveUserId } from '../../middleware/resolveContext.js'
import { handleValidationError, logDetailedError } from '../../middleware/errorHandler.js'

const app = new Hono()

const createNoteSchema = z.object({
  content: z.string().min(1, 'Content is required').max(5000, 'Content too long')
})

// POST /api/v1/customers/:id/notes - Create a new note
app.post('/:id/notes', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const customerId = c.req.param('id')
    const body = await c.req.json()
    const data = createNoteSchema.parse(body)

    // Check if customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }
    })

    if (!customer) {
      return c.json({ error: { code: 'NotFound', message: 'Customer not found' } }, 404)
    }

    // Use effectiveUserId for agents to access business owner's customers
    const effectiveUserId = getEffectiveUserId(c)

    // Check access - allow if admin or if customer belongs to effective user
    if (c.user.role !== 'ADMIN' && effectiveUserId !== customer.userId) {
      return c.json({ error: { code: 'Forbidden', message: 'Access denied' } }, 403)
    }

    // Create note and activity in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create note
      const note = await tx.customerNote.create({
        data: {
          content: data.content,
          customerId,
          createdBy: c.user.id
        },
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      })

      // Also create activity record for Activity Timeline
      await tx.customerActivity.create({
        data: {
          type: 'NOTE_ADDED',
          title: 'Note added',
          description: data.content,
          customerId,
          userId: c.user.id,
          timestamp: new Date()
        }
      })

      return note
    })

    return c.json({
      success: true,
      data: {
        id: result.id,
        content: result.content,
        createdAt: result.createdAt,
        createdBy: result.creator.name || result.creator.email
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }
    logDetailedError(error, {
      path: c.req.path,
      method: c.req.method,
    })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to create note'
      }
    }, 500)
  }
})

// GET /api/v1/customers/:id/notes - Get all notes for a customer
app.get('/:id/notes', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const customerId = c.req.param('id')

    // Check if customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }
    })

    if (!customer) {
      return c.json({ error: { code: 'NotFound', message: 'Customer not found' } }, 404)
    }

    // Use effectiveUserId for agents to access business owner's customers
    const effectiveUserId = getEffectiveUserId(c)

    // Check access - allow if admin or if customer belongs to effective user
    if (c.user.role !== 'ADMIN' && effectiveUserId !== customer.userId) {
      return c.json({ error: { code: 'Forbidden', message: 'Access denied' } }, 403)
    }

    // Get notes
    const notes = await prisma.customerNote.findMany({
      where: { customerId },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const formattedNotes = notes.map(note => ({
      id: note.id,
      content: note.content,
      createdAt: note.createdAt,
      createdBy: note.creator.name || note.creator.email
    }))

    return c.json({ success: true, data: formattedNotes })
  } catch (error) {
    console.error('Get notes error:', error)
    return c.json({ 
      error: { 
        code: 'InternalServerError', 
        message: 'Failed to fetch notes' 
      } 
    }, 500)
  }
})

// DELETE /api/v1/customers/:id/notes/:noteId - Delete a note
app.delete('/:id/notes/:noteId', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const customerId = c.req.param('id')
    const noteId = c.req.param('noteId')

    // Check if note exists
    const note = await prisma.customerNote.findUnique({
      where: { id: noteId },
      include: {
        customer: true
      }
    })

    if (!note) {
      return c.json({ error: { code: 'NotFound', message: 'Note not found' } }, 404)
    }

    // Verify note belongs to the specified customer
    if (note.customerId !== customerId) {
      return c.json({ error: { code: 'BadRequest', message: 'Note does not belong to this customer' } }, 400)
    }

    // Use effectiveUserId for agents to access business owner's customers
    const effectiveUserId = getEffectiveUserId(c)

    // Check access - allow if admin, if customer belongs to effective user, or if user created the note
    const hasAccess = 
      c.user.role === 'ADMIN' || 
      effectiveUserId === note.customer.userId ||
      c.user.id === note.createdBy

    if (!hasAccess) {
      return c.json({ error: { code: 'Forbidden', message: 'Access denied' } }, 403)
    }

    // Delete note
    await prisma.customerNote.delete({
      where: { id: noteId }
    })

    return c.json({ success: true, message: 'Note deleted successfully' })
  } catch (error) {
    console.error('Delete note error:', error)
    return c.json({ 
      error: { 
        code: 'InternalServerError', 
        message: 'Failed to delete note' 
      } 
    }, 500)
  }
})

export default app