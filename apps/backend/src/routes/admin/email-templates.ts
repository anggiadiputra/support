/**
 * Admin Email Templates Routes
 *
 * CRUD endpoints for managing email templates.
 * All routes require ADMIN role.
 */

import { Hono } from 'hono';
import { emailTemplateService } from '../../services/email/email-template-service.js';
import { auditLog } from '../../utils/auditLog.js';

const app = new Hono();

/**
 * GET /api/v1/admin/email-templates
 * List all email templates
 */
app.get('/', async (c) => {
  try {
    const templates = await emailTemplateService.listTemplates();
    return c.json({ success: true, data: templates });
  } catch (error) {
    console.error('Failed to list email templates:', error);
    return c.json(
      { error: { code: 'InternalServerError', message: 'Failed to list email templates' } },
      500
    );
  }
});

/**
 * POST /api/v1/admin/email-templates/seed
 * Seed default templates into the database
 */
app.post('/seed', async (c) => {
  try {
    const adminId = (c as any).user?.id;
    const count = await emailTemplateService.seedDefaults(adminId);

    if (adminId) {
      const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
      await auditLog('email_templates_seed', 'EmailTemplate', 'all', { seeded: count }, adminId, ipAddress);
    }

    return c.json({ success: true, message: `${count} templates seeded`, data: { seeded: count } });
  } catch (error) {
    console.error('Failed to seed email templates:', error);
    return c.json(
      { error: { code: 'InternalServerError', message: 'Failed to seed email templates' } },
      500
    );
  }
});

/**
 * GET /api/v1/admin/email-templates/:slug
 * Get single template detail
 */
app.get('/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const template = await emailTemplateService.getTemplate(slug);

    if (!template) {
      return c.json(
        { error: { code: 'NotFound', message: `Template "${slug}" not found` } },
        404
      );
    }

    return c.json({ success: true, data: template });
  } catch (error) {
    console.error('Failed to get email template:', error);
    return c.json(
      { error: { code: 'InternalServerError', message: 'Failed to get email template' } },
      500
    );
  }
});

/**
 * PUT /api/v1/admin/email-templates/:slug
 * Update a template
 */
app.put('/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const body = await c.req.json();
    const adminId = (c as any).user?.id;

    // Validate required fields
    if (!body.subject || typeof body.subject !== 'string') {
      return c.json(
        { error: { code: 'ValidationError', message: 'Subject is required' } },
        400
      );
    }
    if (!body.htmlBody || typeof body.htmlBody !== 'string') {
      return c.json(
        { error: { code: 'ValidationError', message: 'HTML body is required' } },
        400
      );
    }
    if (!body.textBody || typeof body.textBody !== 'string') {
      return c.json(
        { error: { code: 'ValidationError', message: 'Text body is required' } },
        400
      );
    }

    const result = await emailTemplateService.updateTemplate(
      slug,
      {
        subject: body.subject,
        htmlBody: body.htmlBody,
        textBody: body.textBody,
        isActive: body.isActive ?? true,
      },
      adminId
    );

    if (!result) {
      return c.json(
        { error: { code: 'NotFound', message: `Template "${slug}" not found` } },
        404
      );
    }

    // Audit log
    if (adminId) {
      const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
      await auditLog('email_template_update', 'EmailTemplate', slug, { isActive: body.isActive }, adminId, ipAddress);
    }

    return c.json({ success: true, message: 'Template updated', data: result });
  } catch (error) {
    console.error('Failed to update email template:', error);
    return c.json(
      { error: { code: 'InternalServerError', message: 'Failed to update email template' } },
      500
    );
  }
});

/**
 * POST /api/v1/admin/email-templates/:slug/reset
 * Reset template to code default
 */
app.post('/:slug/reset', async (c) => {
  try {
    const slug = c.req.param('slug');
    const adminId = (c as any).user?.id;

    const result = await emailTemplateService.resetTemplate(slug, adminId);

    if (!result) {
      return c.json(
        { error: { code: 'NotFound', message: `Template "${slug}" not found` } },
        404
      );
    }

    // Audit log
    if (adminId) {
      const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
      await auditLog('email_template_reset', 'EmailTemplate', slug, {}, adminId, ipAddress);
    }

    return c.json({ success: true, message: 'Template reset to default', data: result });
  } catch (error) {
    console.error('Failed to reset email template:', error);
    return c.json(
      { error: { code: 'InternalServerError', message: 'Failed to reset email template' } },
      500
    );
  }
});

/**
 * POST /api/v1/admin/email-templates/:slug/preview
 * Preview rendered template with sample data
 */
app.post('/:slug/preview', async (c) => {
  try {
    const slug = c.req.param('slug');
    const body = await c.req.json();

    const { subject, htmlBody, textBody } = body;

    if (!subject || !htmlBody || !textBody) {
      return c.json(
        { error: { code: 'ValidationError', message: 'subject, htmlBody, and textBody are required' } },
        400
      );
    }

    const result = emailTemplateService.previewTemplate(slug, subject, htmlBody, textBody);

    if (!result) {
      return c.json(
        { error: { code: 'NotFound', message: `Template "${slug}" not found` } },
        404
      );
    }

    return c.json({ success: true, data: result });
  } catch (error) {
    console.error('Failed to preview email template:', error);
    return c.json(
      { error: { code: 'InternalServerError', message: 'Failed to preview email template' } },
      500
    );
  }
});

export default app;
