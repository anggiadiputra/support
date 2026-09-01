import { Hono } from 'hono';
import type { Context } from 'hono';
import { prisma } from '../../../../utils/database.js';
import { getApiKeyUserId } from '../../../../middleware/apiKeyAuth.js';

const app = new Hono();

/**
 * GET /api/v1/phone-numbers
 * List all WhatsApp phone numbers available to the authenticated user.
 * Use the returned `id` as `whatsapp_phone_number_id` when sending messages.
 */
app.get('/', async (c: Context) => {
  try {
    const userId = getApiKeyUserId(c);

    const phoneNumbers = await prisma.phoneNumber.findMany({
      where: {
        userId,
        whatsappAccount: {
          connectionStatus: 'connected',
        },
      },
      include: {
        whatsappAccount: {
          select: {
            wabaId: true,
            wabaName: true,
          },
        },
      },
      orderBy: [
        { isPrimary: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return c.json({
      success: true,
      data: phoneNumbers.map((pn) => ({
        id: pn.id,
        phone_number_id: pn.phoneNumberId,
        display_phone_number: pn.displayPhoneNumber,
        verified_name: pn.verifiedName,
        quality_rating: pn.qualityRating,
        is_primary: pn.isPrimary,
        waba_id: pn.whatsappAccount?.wabaId ?? null,
        business_name: pn.whatsappAccount?.wabaName ?? null,
      })),
    });
  } catch (error) {
    console.error('Public API - List phone numbers error:', error);
    return c.json(
      {
        error: {
          code: 'InternalError',
          message: 'Failed to fetch phone numbers',
        },
      },
      500
    );
  }
});

export default app;
