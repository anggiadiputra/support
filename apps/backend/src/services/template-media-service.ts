/**
 * Template Media Service
 * 
 * Handles media upload to WhatsApp Cloud API for template variables.
 * Media uploaded here returns a media_id that can be used in template headers.
 * 
 * Requirements: 3.3, 7.1
 */

import { prisma } from '../utils/database.js';
import { WhatsAppAPI } from '../utils/whatsapp.js';
import { logger } from '../utils/logger.js';
import { resolveCredentialsForSending } from '../utils/whatsapp-account-helper.js';

/**
 * Media type constraints per WhatsApp documentation
 */
export const MEDIA_CONSTRAINTS = {
  IMAGE: {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    allowedExtensions: ['.jpg', '.jpeg', '.png'],
  },
  VIDEO: {
    maxSize: 16 * 1024 * 1024, // 16MB
    allowedMimeTypes: ['video/mp4', 'video/3gpp'],
    allowedExtensions: ['.mp4', '.3gp', '.3gpp'],
  },
  DOCUMENT: {
    maxSize: 100 * 1024 * 1024, // 100MB
    allowedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    allowedExtensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'],
  },
} as const;

export type MediaType = keyof typeof MEDIA_CONSTRAINTS;

/**
 * Error codes for media operations
 */
export const MEDIA_ERROR_CODES = {
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  MEDIA_NOT_FOUND: 'MEDIA_NOT_FOUND',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
} as const;

/**
 * Media upload result
 */
export interface MediaUploadResult {
  mediaId: string;
  mimeType: string;
  fileSize: number;
  filename: string;
  expiresAt?: Date; // WhatsApp media expires after 30 days
}

/**
 * Media info from WhatsApp
 */
export interface MediaInfo {
  id: string;
  url: string;
  mimeType: string;
  sha256: string;
  fileSize: number;
}

/**
 * Validation result
 */
export interface MediaValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
}

/**
 * TemplateMediaService
 * 
 * Handles media upload to WhatsApp Cloud API for use in template headers.
 * 
 * Flow:
 * 1. User uploads file → Backend validates
 * 2. Backend uploads to WhatsApp Media API
 * 3. WhatsApp returns media_id
 * 4. media_id is used in template payload
 * 
 * Requirements: 3.3, 7.1
 */
export class TemplateMediaService {
  /**
   * Validate media file before upload
   * 
   * @param file - File buffer or Blob
   * @param type - Media type (IMAGE, VIDEO, DOCUMENT)
   * @param mimeType - File MIME type
   * @param fileSize - File size in bytes
   * @returns Validation result
   * 
   * Requirements: 7.1
   */
  validateMediaFile(
    type: MediaType,
    mimeType: string,
    fileSize: number
  ): MediaValidationResult {
    const constraints = MEDIA_CONSTRAINTS[type];

    if (!constraints) {
      return {
        valid: false,
        error: `Invalid media type: ${type}. Allowed types: IMAGE, VIDEO, DOCUMENT`,
        errorCode: MEDIA_ERROR_CODES.INVALID_FILE_TYPE,
      };
    }

    // Check file size
    if (fileSize > constraints.maxSize) {
      const maxSizeMB = constraints.maxSize / (1024 * 1024);
      const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
      return {
        valid: false,
        error: `File too large. Maximum size for ${type.toLowerCase()} is ${maxSizeMB}MB, got ${fileSizeMB}MB`,
        errorCode: MEDIA_ERROR_CODES.FILE_TOO_LARGE,
      };
    }

    // Check MIME type
    const allowedTypes = constraints.allowedMimeTypes as readonly string[];
    if (!allowedTypes.includes(mimeType)) {
      return {
        valid: false,
        error: `Invalid file type for ${type.toLowerCase()}. Allowed types: ${constraints.allowedMimeTypes.join(', ')}`,
        errorCode: MEDIA_ERROR_CODES.INVALID_FILE_TYPE,
      };
    }

    return { valid: true };
  }

  /**
   * Get media type from MIME type
   * 
   * @param mimeType - File MIME type
   * @returns Media type or null if not supported
   */
  getMediaTypeFromMimeType(mimeType: string): MediaType | null {
    for (const [type, constraints] of Object.entries(MEDIA_CONSTRAINTS)) {
      const allowedTypes = constraints.allowedMimeTypes as readonly string[];
      if (allowedTypes.includes(mimeType)) {
        return type as MediaType;
      }
    }
    return null;
  }

  /**
   * Upload media to WhatsApp Cloud API
   * 
   * @param userId - User ID for authorization and phone number lookup
   * @param file - File buffer
   * @param type - Media type (IMAGE, VIDEO, DOCUMENT)
   * @param mimeType - File MIME type
   * @param filename - Original filename
   * @returns Upload result with media_id
   * 
   * Requirements: 3.3
   */
  async uploadMedia(
    userId: string,
    file: Buffer,
    type: MediaType,
    mimeType: string,
    filename: string
  ): Promise<MediaUploadResult> {
    // Validate file
    const validation = this.validateMediaFile(type, mimeType, file.length);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Resolve WhatsApp account credentials for this user
    const credentials = await resolveCredentialsForSending(userId);

    if (!credentials) {
      throw new Error('WhatsApp Business Account not configured or disconnected. Please connect your WABA first.');
    }

    try {
      // Upload to WhatsApp Media API with per-account token
      const whatsapp = new WhatsAppAPI({ accessToken: credentials.accessToken });
      const result = await whatsapp.uploadMedia(
        credentials.phoneNumberId,
        file,
        mimeType,
        filename
      );

      if (!result?.id) {
        throw new Error('WhatsApp API did not return a media ID');
      }

      // WhatsApp media expires after 30 days
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      logger.info('Media uploaded to WhatsApp', {
        userId,
        mediaId: result.id,
        type,
        mimeType,
        fileSize: file.length,
      });

      return {
        mediaId: result.id,
        mimeType,
        fileSize: file.length,
        filename,
        expiresAt,
      };
    } catch (error: any) {
      logger.error('Failed to upload media to WhatsApp', {
        userId,
        type,
        mimeType,
        error: error.message,
        response: error.response?.data,
      });

      // Handle specific WhatsApp API errors
      if (error.response?.data?.error) {
        const waError = error.response.data.error;
        throw new Error(`WhatsApp upload failed: ${waError.message || 'Unknown error'}`);
      }

      throw new Error(`Failed to upload media: ${error.message}`);
    }
  }

  /**
   * Get media info from WhatsApp
   * 
   * @param userId - User ID for authorization
   * @param mediaId - WhatsApp media ID
   * @returns Media info including URL
   */
  async getMediaInfo(userId: string, mediaId: string): Promise<MediaInfo> {
    // Resolve WhatsApp account credentials for this user
    const credentials = await resolveCredentialsForSending(userId);

    if (!credentials) {
      throw new Error('WhatsApp Business Account not configured or disconnected. Please connect your WABA first.');
    }

    try {
      const whatsapp = new WhatsAppAPI({ accessToken: credentials.accessToken });
      const result = await whatsapp.getMediaUrl(mediaId);

      return {
        id: result.id,
        url: result.url,
        mimeType: result.mime_type,
        sha256: result.sha256,
        fileSize: result.file_size,
      };
    } catch (error: any) {
      logger.error('Failed to get media info', {
        userId,
        mediaId,
        error: error.message,
      });

      if (error.response?.status === 404) {
        throw new Error('Media not found or expired');
      }

      throw new Error(`Failed to get media info: ${error.message}`);
    }
  }

  /**
   * Get human-readable size limit message
   * 
   * @param type - Media type
   * @returns Size limit message
   */
  getSizeLimitMessage(type: MediaType): string {
    const constraints = MEDIA_CONSTRAINTS[type];
    if (!constraints) return 'Unknown media type';
    
    const maxSizeMB = constraints.maxSize / (1024 * 1024);
    return `Maximum file size for ${type.toLowerCase()}: ${maxSizeMB}MB`;
  }

  /**
   * Get allowed formats message
   * 
   * @param type - Media type
   * @returns Allowed formats message
   */
  getAllowedFormatsMessage(type: MediaType): string {
    const constraints = MEDIA_CONSTRAINTS[type];
    if (!constraints) return 'Unknown media type';
    
    return `Allowed formats for ${type.toLowerCase()}: ${constraints.allowedExtensions.join(', ')}`;
  }
}

// Export singleton instance
export const templateMediaService = new TemplateMediaService();
