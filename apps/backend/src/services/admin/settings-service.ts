/**
 * AdminSettingsService
 * 
 * Manages admin settings for channel integrations (WhatsApp, Instagram, SMTP, OpenAI).
 * Settings are stored in database with encryption for sensitive values, with fallback to .env.
 * 
 * Note: Google OAuth is configured via .env only (Better Auth limitation).
 */

import { prisma } from '../../utils/database.js';
import { EncryptionService } from '../encryption-service.js';
import { auditLog } from '../../utils/auditLog.js';
import { logger, extractAxiosError } from '../../utils/logger.js';
import axios from 'axios';
import https from 'https';
import * as nodemailer from 'nodemailer';
import { settingsCache, CACHE_KEYS } from '../settings-cache.js';

// Create HTTPS agent that forces IPv4 (fixes ETIMEDOUT on some servers)
const httpsAgent = new https.Agent({
  family: 4,
  rejectUnauthorized: true,
});
import { invalidateBrandingCache } from '../../routes/branding.js';
import { invalidateChannelStatusCache } from '../../routes/channels.js';
import type {
  SettingCategory,
  SettingsResponse,
  TestConnectionResult,
  UpdateSettingsResult,
  CategorySettings,
} from '../../types/admin-settings.js';
import {
  getSettingsKeyConfig,
  dbKeyToCamelCase,
  camelCaseToDbKey,
  isValidCategory,
  DEFAULT_BRANDING,
  type BrandingSettings,
} from '../../types/admin-settings.js';

export class AdminSettingsService {
  private encryptionService: EncryptionService;

  constructor() {
    this.encryptionService = new EncryptionService();
  }

  // ===========================================================================
  // Get Settings (Task 2.2)
  // Requirements: 1.3, 2.3, 6.3, 6.4
  // ===========================================================================

  /**
   * Get settings by category with masking for sensitive values
   * Prioritizes database values over .env values
   * Falls back to .env if database is empty or on error
   */
  async getSettings<T extends CategorySettings>(
    category: SettingCategory,
    maskSensitive: boolean = true
  ): Promise<SettingsResponse<T>> {
    if (!isValidCategory(category)) {
      throw new Error(`Invalid settings category: ${category}`);
    }

    try {
      // Try to fetch from database first
      const dbSettings = await prisma.systemSetting.findMany({
        where: { category },
      });

      if (dbSettings.length > 0) {
        // Build settings object from database
        const settings = this.buildSettingsFromDb<T>(category, dbSettings, maskSensitive);
        return { data: settings, source: 'database' };
      }

      // Fallback to .env values
      const envSettings = this.getSettingsFromEnv<T>(category);
      return { data: envSettings, source: 'env' };
    } catch (error) {
      logger.error('Failed to get settings from database, falling back to env', {
        category,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Fallback to .env on error
      const envSettings = this.getSettingsFromEnv<T>(category);
      return { data: envSettings, source: 'env' };
    }
  }

  /**
   * Get raw (decrypted) value for internal use
   */
  async getRawValue(category: SettingCategory, key: string): Promise<string | null> {
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { category_key: { category, key } },
      });

      if (!setting) {
        // Fallback to env
        const keyConfig = getSettingsKeyConfig(category).find(k => k.key === key);
        if (keyConfig?.envKey) {
          return process.env[keyConfig.envKey] || null;
        }
        return null;
      }

      if (setting.isSensitive) {
        return this.encryptionService.decryptFromString(setting.value);
      }

      return setting.value;
    } catch (error) {
      logger.error('Failed to get raw setting value', {
        category,
        key,
        error: extractAxiosError(error),
      });
      return null;
    }
  }


  /**
   * Build settings object from database records
   */
  private buildSettingsFromDb<T extends CategorySettings>(
    category: SettingCategory,
    dbSettings: Array<{ key: string; value: string; isSensitive: boolean }>,
    maskSensitive: boolean
  ): T {
    const keyConfigs = getSettingsKeyConfig(category);
    const settings: Record<string, unknown> = {};

    for (const config of keyConfigs) {
      const dbSetting = dbSettings.find(s => s.key === config.key);
      const propName = dbKeyToCamelCase(config.key);

      if (dbSetting) {
        let value: unknown = dbSetting.value;

        // Decrypt sensitive values
        if (dbSetting.isSensitive && dbSetting.value) {
          try {
            const decrypted = this.encryptionService.decryptFromString(dbSetting.value);
            logger.debug('Decrypted sensitive value', {
              key: config.key,
              category,
              decryptedPreview: decrypted ? decrypted.slice(0, 10) + '...' : 'empty'
            });
            value = maskSensitive ? this.encryptionService.mask(decrypted) : decrypted;
          } catch (decryptError) {
            logger.error('Failed to decrypt sensitive value - likely encrypted with different key', {
              key: config.key,
              category,
              error: decryptError instanceof Error ? decryptError.message : 'Unknown error',
              suggestion: 'Please re-enter this value in admin settings to re-encrypt with current encryption key'
            });
            value = maskSensitive ? '****' : '';
          }
        }

        // Convert types for specific fields
        if (config.key === 'port' || config.key === 'lite_price_monthly' || config.key === 'pro_price_monthly') {
          value = parseInt(value as string, 10) || 0;
        } else if (config.key === 'secure' || config.key === 'enabled') {
          value = value === 'true' || value === true;
        }

        settings[propName] = value;
      } else {
        // Fallback to env for missing keys
        const envValue = config.envKey ? process.env[config.envKey] : undefined;
        let value: unknown = envValue || '';

        if (config.sensitive && envValue && maskSensitive) {
          value = this.encryptionService.mask(envValue);
        }

        // Convert types
        if (config.key === 'port' || config.key === 'lite_price_monthly' || config.key === 'pro_price_monthly') {
          value = parseInt(value as string, 10) || 0;
        } else if (config.key === 'secure' || config.key === 'enabled') {
          value = value === 'true' || value === true;
        }

        settings[propName] = value;
      }
    }

    return settings as T;
  }

  /**
   * Get settings from environment variables
   */
  private getSettingsFromEnv<T extends CategorySettings>(category: SettingCategory): T {
    const keyConfigs = getSettingsKeyConfig(category);
    const settings: Record<string, unknown> = {};

    for (const config of keyConfigs) {
      const propName = dbKeyToCamelCase(config.key);
      let value: unknown = config.envKey ? process.env[config.envKey] || '' : '';

      // Mask sensitive values
      if (config.sensitive && value) {
        value = this.encryptionService.mask(value as string);
      }

      // Convert types
      if (config.key === 'port' || config.key === 'lite_price_monthly' || config.key === 'pro_price_monthly') {
        value = parseInt(value as string, 10) || 0;
      } else if (config.key === 'secure' || config.key === 'enabled') {
        value = value === 'true' || value === true;
      }

      settings[propName] = value;
    }

    return settings as T;
  }

  // ===========================================================================
  // Update Settings (Task 2.3)
  // Requirements: 1.2, 2.2, 3.2, 4.2, 5.2, 6.2
  // ===========================================================================

  /**
   * Update settings for a category
   * Encrypts sensitive values before storing
   * Creates audit log entry
   */
  async updateSettings(
    category: SettingCategory,
    settings: Partial<CategorySettings>,
    adminId: string,
    ipAddress?: string
  ): Promise<UpdateSettingsResult> {
    if (!isValidCategory(category)) {
      throw new Error(`Invalid settings category: ${category}`);
    }

    // Validate branding settings if applicable
    if (category === 'branding') {
      this.validateBrandingSettings(settings as Partial<BrandingSettings>);
    }

    const keyConfigs = getSettingsKeyConfig(category);
    const changedFields: string[] = [];

    try {
      // Process each setting
      for (const [propName, value] of Object.entries(settings)) {
        const dbKey = camelCaseToDbKey(propName);
        const keyConfig = keyConfigs.find(k => k.key === dbKey);

        if (!keyConfig) {
          logger.warn(`Unknown setting key: ${dbKey} for category ${category}`);
          continue;
        }

        // Skip if value is masked (unchanged)
        if (typeof value === 'string' && value.includes('****')) {
          continue;
        }

        // Convert value to string for storage
        let stringValue: string;
        if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
          stringValue = JSON.stringify(value);
        } else {
          stringValue = String(value);
        }

        // Encrypt sensitive values
        if (keyConfig.sensitive && stringValue) {
          stringValue = this.encryptionService.encryptToString(stringValue);
        }

        // Upsert the setting
        await prisma.systemSetting.upsert({
          where: { category_key: { category, key: dbKey } },
          update: {
            value: stringValue,
            isSensitive: keyConfig.sensitive,
            updatedAt: new Date(),
            updatedBy: adminId,
          },
          create: {
            category,
            key: dbKey,
            value: stringValue,
            isSensitive: keyConfig.sensitive,
            updatedBy: adminId,
          },
        });

        changedFields.push(dbKey);
      }

      // Create audit log entry (without values for security)
      await auditLog(
        'settings_updated',
        'system_settings',
        category,
        { changedFields, category },
        adminId,
        ipAddress
      );

      // Invalidate settings cache for this category
      this.invalidateSettingsCache(category);

      // Also invalidate public branding cache if branding was updated
      if (category === 'branding') {
        invalidateBrandingCache();
      }

      // Also invalidate channel status cache if instagram/messenger settings were updated
      if (category === 'instagram' || category === 'messenger') {
        invalidateChannelStatusCache();
      }

      logger.info('Settings updated', { category, changedFields, adminId });

      return {
        success: true,
        message: `${category} settings updated successfully`,
      };
    } catch (error) {
      logger.error('Failed to update settings', {
        category,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new Error(`Failed to update ${category} settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  // ===========================================================================
  // Test Connection (Task 2.4)
  // Requirements: 1.4, 2.4, 3.3, 5.3
  // ===========================================================================

  /**
   * Test connection for a category
   */
  async testConnection(
    category: SettingCategory,
    testEmail?: string
  ): Promise<TestConnectionResult> {
    switch (category) {
      case 'whatsapp':
        return this.testWhatsAppConnection();
      case 'instagram':
        return this.testInstagramConnection();
      case 'smtp':
        return this.testSmtpConnection(testEmail);
      case 'openai':
        return this.testOpenAIConnection();
      case 'duitku':
        return this.testDuitkuConnection();
      case 'xendit':
        return this.testXenditConnection();
      default:
        return { success: false, message: `Test not available for ${category}` };
    }
  }

  /**
   * Test WhatsApp/Meta API connection
   * 
   * NOTE: access_token is NOT stored in system settings anymore.
   * Each WABA uses its own OAuth token stored in WhatsAppAccount table (per Meta policy).
   * This test validates that the Meta App credentials (app_id, app_secret) are configured.
   */
  private async testWhatsAppConnection(): Promise<TestConnectionResult> {
    try {
      const appId = await this.getRawValue('whatsapp', 'app_id');
      const appSecret = await this.getRawValue('whatsapp', 'app_secret');

      if (!appId || !appSecret) {
        return {
          success: false,
          message: 'WhatsApp credentials not configured (App ID and App Secret required)',
        };
      }

      // Generate app access token for validation (app_id|app_secret)
      // This validates that the Meta App credentials are correct
      const appAccessToken = `${appId}|${appSecret}`;

      const response = await axios.get(
        `https://graph.facebook.com/v23.0/${appId}`,
        {
          params: {
            access_token: appAccessToken,
            fields: 'id,name',
          },
          timeout: 30000,
          httpsAgent,
        }
      );

      if (response.data?.id) {
        return {
          success: true,
          message: 'WhatsApp/Meta App credentials verified successfully',
          details: {
            appId: response.data.id,
            appName: response.data.name,
            note: 'Individual WABA tokens are stored per-account after OAuth',
          },
        };
      }

      return {
        success: false,
        message: 'Failed to verify Meta App credentials',
        details: response.data,
      };
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error?.message || error.message
        : error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        message: `WhatsApp connection failed: ${message}`,
      };
    }
  }

  /**
   * Test Instagram API connection
   */
  private async testInstagramConnection(): Promise<TestConnectionResult> {
    try {
      const appId = await this.getRawValue('instagram', 'app_id');
      const appSecret = await this.getRawValue('instagram', 'app_secret');

      if (!appId || !appSecret) {
        return {
          success: false,
          message: 'Instagram credentials not configured',
        };
      }

      return {
        success: true,
        message: 'Instagram credentials configured',
        details: {
          appId: appId.substring(0, 5) + '...',
          hasAppSecret: !!appSecret,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Instagram validation failed: ${message}`,
      };
    }
  }

  /**
   * Test SMTP connection
   */
  private async testSmtpConnection(testEmail?: string): Promise<TestConnectionResult> {
    try {
      const host = await this.getRawValue('smtp', 'host');
      const port = await this.getRawValue('smtp', 'port');
      const user = await this.getRawValue('smtp', 'user');
      const password = await this.getRawValue('smtp', 'password');
      const fromEmail = await this.getRawValue('smtp', 'from_email');
      const fromName = await this.getRawValue('smtp', 'from_name');
      const secure = await this.getRawValue('smtp', 'secure');

      if (!host || !port) {
        return {
          success: false,
          message: 'SMTP settings not configured',
        };
      }

      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(port, 10),
        secure: secure === 'true',
        auth: user && password ? { user, pass: password } : undefined,
      });

      // Verify connection
      await transporter.verify();

      // Send test email if address provided
      if (testEmail) {
        await transporter.sendMail({
          from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
          to: testEmail,
          subject: 'Test Email from Admin Settings',
          text: 'This is a test email to verify SMTP configuration.',
          html: '<p>This is a test email to verify SMTP configuration.</p>',
        });

        return {
          success: true,
          message: `Test email sent successfully to ${testEmail}`,
        };
      }

      return {
        success: true,
        message: 'SMTP connection verified successfully',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `SMTP connection failed: ${message}`,
      };
    }
  }

  /**
   * Test OpenAI API connection (supports custom base URL)
   */
  private async testOpenAIConnection(): Promise<TestConnectionResult> {
    try {
      const apiKey = await this.getRawValue('openai', 'api_key');
      const baseUrl = await this.getRawValue('openai', 'base_url');
      const enabled = await this.getRawValue('openai', 'enabled');

      if (!apiKey) {
        return {
          success: false,
          message: 'OpenAI API key not configured',
        };
      }

      if (enabled === 'false') {
        return {
          success: true,
          message: 'OpenAI is disabled but API key is configured',
        };
      }

      // Use configured base URL or default to OpenAI
      const modelsUrl = baseUrl
        ? `${baseUrl.replace(/\/$/, '')}/models`
        : 'https://api.openai.com/v1/models';

      const response = await axios.get(modelsUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 15000,
      });

      return {
        success: true,
        message: baseUrl ? 'OpenAI-compatible API connection successful' : 'OpenAI API connection successful',
        details: {
          modelsCount: response.data?.data?.length || 0,
          endpoint: baseUrl || 'OpenAI (default)',
        },
      };
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error?.message || error.message
        : error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        message: `OpenAI connection failed: ${message}`,
      };
    }
  }

  /**
   * Fetch available models from OpenAI-compatible endpoint
   * Returns list of models that can be used for chat and embedding
   */
  async fetchOpenAIModels(): Promise<{ models: Array<{ id: string; owned_by: string }> }> {
    try {
      const apiKey = await this.getRawValue('openai', 'api_key');
      const baseUrl = await this.getRawValue('openai', 'base_url');

      if (!apiKey) {
        throw new Error('OpenAI API key not configured');
      }

      // Use configured base URL or default to OpenAI
      const modelsUrl = baseUrl
        ? `${baseUrl.replace(/\/$/, '')}/models`
        : 'https://api.openai.com/v1/models';

      const response = await axios.get(modelsUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 15000,
      });

      // Extract model list from response
      const models = (response.data?.data || []).map((model: any) => ({
        id: model.id,
        owned_by: model.owned_by || 'unknown',
      }));

      // Sort models by id for consistent ordering
      models.sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));

      return { models };
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error?.message || error.message
        : error instanceof Error ? error.message : 'Unknown error';

      throw new Error(`Failed to fetch models: ${message}`);
    }
  }

  /**
   * Test Duitku payment gateway connection
   */
  private async testDuitkuConnection(): Promise<TestConnectionResult> {
    try {
      const merchantCode = await this.getRawValue('duitku', 'merchant_code');
      const apiKey = await this.getRawValue('duitku', 'api_key');
      const enabled = await this.getRawValue('duitku', 'enabled');
      const environment = await this.getRawValue('duitku', 'environment') || 'sandbox';

      if (!merchantCode || !apiKey) {
        return {
          success: false,
          message: 'Duitku credentials not configured',
        };
      }

      if (enabled === 'false') {
        return {
          success: true,
          message: 'Duitku is disabled but credentials are configured',
        };
      }

      const baseUrl = environment === 'production'
        ? 'https://snap.duitku.com'
        : 'https://snapdev.duitku.com';

      const timestamp = new Date().toISOString();
      const stringToSign = `${merchantCode}|${timestamp}`;

      const crypto = await import('crypto');
      const signature = crypto
        .createHmac('sha256', apiKey)
        .update(stringToSign)
        .digest('base64');

      const response = await axios.post(
        `${baseUrl}/v1.0/access-token/b2b`,
        {
          grantType: 'client_credentials',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-TIMESTAMP': timestamp,
            'X-CLIENT-KEY': merchantCode,
            'X-SIGNATURE': signature,
          },
          timeout: 15000,
        }
      );

      if (response.data?.accessToken) {
        return {
          success: true,
          message: 'Duitku API connection successful',
          details: {
            environment,
            expiresIn: response.data.expiresIn || 900,
          },
        };
      }

      return {
        success: false,
        message: 'Failed to get access token from Duitku',
        details: response.data,
      };
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.responseMessage || error.response?.data?.message || error.message
        : error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        message: `Duitku connection failed: ${message}`,
      };
    }
  }

  /**
   * Test Xendit payment gateway connection
   * Requirements: 6.1, 6.2, 6.3, 6.4
   */
  private async testXenditConnection(): Promise<TestConnectionResult> {
    try {
      const secretKey = await this.getRawValue('xendit', 'secret_key');
      const enabled = await this.getRawValue('xendit', 'enabled');
      const environment = await this.getRawValue('xendit', 'environment') || 'sandbox';

      if (!secretKey) {
        return {
          success: false,
          message: 'Xendit credentials not configured',
        };
      }

      if (enabled === 'false') {
        return {
          success: true,
          message: 'Xendit is disabled but credentials are configured',
        };
      }

      // Test connection by fetching balance (simple API call to verify credentials)
      const response = await axios.get('https://api.xendit.co/balance', {
        auth: {
          username: secretKey,
          password: '',
        },
        timeout: 15000,
      });

      if (response.status === 200) {
        return {
          success: true,
          message: 'Xendit API connection successful',
          details: {
            environment,
            balance: response.data?.balance,
          },
        };
      }

      return {
        success: false,
        message: 'Failed to verify Xendit credentials',
        details: response.data,
      };
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        message: `Xendit connection failed: ${message}`,
      };
    }
  }

  // ===========================================================================
  // Reset to Default (Task 2.5)
  // ===========================================================================

  /**
   * Reset settings to .env values
   */
  async resetToDefault(
    category: SettingCategory,
    adminId: string,
    ipAddress?: string
  ): Promise<UpdateSettingsResult> {
    if (!isValidCategory(category)) {
      throw new Error(`Invalid settings category: ${category}`);
    }

    const keyConfigs = getSettingsKeyConfig(category);
    const resetFields: string[] = [];

    try {
      for (const config of keyConfigs) {
        const envValue = config.envKey ? process.env[config.envKey] : undefined;

        if (envValue !== undefined) {
          let stringValue = envValue;
          if (config.sensitive && stringValue) {
            stringValue = this.encryptionService.encryptToString(stringValue);
          }

          await prisma.systemSetting.upsert({
            where: { category_key: { category, key: config.key } },
            update: {
              value: stringValue,
              isSensitive: config.sensitive,
              updatedAt: new Date(),
              updatedBy: adminId,
            },
            create: {
              category,
              key: config.key,
              value: stringValue,
              isSensitive: config.sensitive,
              updatedBy: adminId,
            },
          });

          resetFields.push(config.key);
        } else {
          await prisma.systemSetting.deleteMany({
            where: { category, key: config.key },
          });
        }
      }

      await auditLog(
        'settings_reset',
        'system_settings',
        category,
        { resetFields, category },
        adminId,
        ipAddress
      );

      this.invalidateSettingsCache(category);

      // Also invalidate public branding cache if branding was reset
      if (category === 'branding') {
        invalidateBrandingCache();
      }

      // Also invalidate channel status cache if instagram/messenger settings were reset
      if (category === 'instagram' || category === 'messenger') {
        invalidateChannelStatusCache();
      }

      logger.info('Settings reset to default', { category, resetFields, adminId });

      return {
        success: true,
        message: `${category} settings reset to default values`,
      };
    } catch (error) {
      logger.error('Failed to reset settings', {
        category,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new Error(`Failed to reset ${category} settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get all settings for a category (decrypted, for internal service use)
   */
  async getDecryptedSettings<T extends CategorySettings>(
    category: SettingCategory
  ): Promise<T> {
    const response = await this.getSettings<T>(category, false);
    return response.data;
  }

  /**
   * Get branding settings with defaults for missing values
   * Used by public branding endpoint
   * Requirements: 7.1, 7.2
   */
  async getBrandingSettings(): Promise<BrandingSettings> {
    try {
      const dbSettings = await prisma.systemSetting.findMany({
        where: { category: 'branding' }
      });

      // Build branding object with defaults for missing values
      const branding: BrandingSettings = { ...DEFAULT_BRANDING };

      for (const setting of dbSettings) {
        const propName = dbKeyToCamelCase(setting.key) as keyof BrandingSettings;
        if (propName in branding && setting.value) {
          // Parse JSON for externalLinks
          if (propName === 'externalLinks') {
            try {
              branding.externalLinks = JSON.parse(setting.value);
            } catch {
              branding.externalLinks = [];
            }
          } else {
            (branding as unknown as Record<string, string>)[propName] = setting.value;
          }
        }
      }

      return branding;
    } catch (error) {
      logger.error('Failed to get branding settings, returning defaults', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return DEFAULT_BRANDING;
    }
  }

  /**
   * Check if settings exist in database for a category
   */
  async hasDbSettings(category: SettingCategory): Promise<boolean> {
    const count = await prisma.systemSetting.count({
      where: { category },
    });
    return count > 0;
  }

  /**
   * Validate branding settings
   * Requirements: 2.2 - Validate email format and phone number format
   */
  private validateBrandingSettings(settings: Partial<BrandingSettings>): void {
    // Validate email format if provided
    if (settings.supportEmail && settings.supportEmail.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(settings.supportEmail)) {
        throw new Error('Invalid email format for support email');
      }
    }

    // Validate phone number format if provided (basic validation for international format)
    if (settings.supportWhatsapp && settings.supportWhatsapp.trim() !== '') {
      // Allow formats like: +6281234567890, +62 812-3456-7890, 081234567890
      const phoneRegex = /^[+]?[\d\s\-()]{8,20}$/;
      if (!phoneRegex.test(settings.supportWhatsapp)) {
        throw new Error('Invalid phone number format for support WhatsApp');
      }
    }

    // Validate logo URL if provided
    if (settings.logoUrl && settings.logoUrl.trim() !== '') {
      try {
        new URL(settings.logoUrl);
      } catch {
        throw new Error('Invalid URL format for logo URL');
      }
    }

    // Validate Terms URL if provided
    if (settings.termsUrl && settings.termsUrl.trim() !== '') {
      try {
        new URL(settings.termsUrl);
      } catch {
        throw new Error('Invalid URL format for Terms URL');
      }
    }

    // Validate Privacy URL if provided
    if (settings.privacyUrl && settings.privacyUrl.trim() !== '') {
      try {
        new URL(settings.privacyUrl);
      } catch {
        throw new Error('Invalid URL format for Privacy URL');
      }
    }

    // Validate external links if provided
    if (settings.externalLinks && Array.isArray(settings.externalLinks)) {
      if (settings.externalLinks.length > 3) {
        throw new Error('Maximum 3 external links allowed');
      }
      for (const link of settings.externalLinks) {
        if (!link.label || link.label.trim() === '') {
          throw new Error('External link label is required');
        }
        if (!link.url || link.url.trim() === '') {
          throw new Error('External link URL is required');
        }
        try {
          new URL(link.url);
        } catch {
          throw new Error(`Invalid URL format for external link: ${link.label}`);
        }
      }
    }
  }

  /**
   * Invalidate settings cache for a category
   */
  private invalidateSettingsCache(category: SettingCategory): void {
    settingsCache.invalidate(CACHE_KEYS.category(category));
    logger.debug('Settings cache invalidated', { category });

    // Also clear messenger-specific webhook settings cache
    if (category === 'messenger') {
      try {
        const messengerService = require('../messenger/index.js');
        if (messengerService && typeof messengerService.clearWebhookCache === 'function') {
          messengerService.clearWebhookCache();
          logger.info('Messenger webhook cache cleared after settings update');
        }
      } catch (error) {
        // Module might not be loaded yet, skip
      }
    }
  }
}

// Export singleton instance
export const adminSettingsService = new AdminSettingsService();
