/**
 * Media Download Service
 * Handles downloading and storing media from WhatsApp Cloud API
 * 
 * WhatsApp sends media_id when receiving media, not direct URLs.
 * URLs from getMediaUrl() are temporary (valid 5 minutes).
 * This service downloads media immediately and stores it locally for permanent access.
 * 
 * Requirements: 6.1, 6.2, 6.3
 */

import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { WhatsAppAPI } from '../utils/whatsapp.js'
import { logger } from '../utils/logger.js'

// Types
export interface MediaDownloadResult {
  success: boolean
  localUrl?: string      // Public URL after download
  error?: string
  mediaId: string        // Original WhatsApp media ID
  mimeType?: string
  fileSize?: number
}

/**
 * Map MIME types to file extensions
 * Supports common WhatsApp media types
 * Requirements: 6.2
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExtension: Record<string, string> = {
    // Images
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    
    // Videos
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'video/3gp': '3gp',
    'video/quicktime': 'mov',
    
    // Audio
    'audio/ogg': 'ogg',
    'audio/ogg; codecs=opus': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/amr': 'amr',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    
    // Documents
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
  }

  // Handle mime types with parameters (e.g., "audio/ogg; codecs=opus")
  const baseMimeType = mimeType.split(';')[0].trim().toLowerCase()
  
  return mimeToExtension[baseMimeType] || mimeToExtension[mimeType] || 'bin'
}

/**
 * Generate a random string for unique filenames
 */
function generateRandomString(length: number = 8): string {
  return Math.random().toString(36).substring(2, 2 + length)
}

/**
 * Ensure the media uploads directory exists
 */
async function ensureMediaDirectory(): Promise<string> {
  const mediaDir = path.join(process.cwd(), 'uploads', 'media')
  if (!existsSync(mediaDir)) {
    await mkdir(mediaDir, { recursive: true })
  }
  return mediaDir
}

export class MediaDownloadService {
  /**
   * Download media from WhatsApp and save locally
   * Requirements: 6.1, 6.2, 6.3
   *
   * @param mediaId - WhatsApp media ID
   * @param accessToken - Per-account access token (REQUIRED - no global fallback per Meta policy)
   * @returns Download result with local URL or error
   */
  async downloadAndStore(mediaId: string, accessToken: string): Promise<MediaDownloadResult> {
    try {
      // Validate access token is provided (required per Meta policy)
      if (!accessToken) {
        return {
          success: false,
          error: 'Access token is required for media download (per-account token)',
          mediaId
        }
      }
      
      // Create WhatsApp client with per-account token
      const whatsapp = new WhatsAppAPI({ accessToken })

      // 2. Get media URL from WhatsApp (valid 5 minutes)
      const mediaInfo = await whatsapp.getMediaUrl(mediaId)
      
      if (!mediaInfo.url) {
        return {
          success: false,
          error: 'No URL returned from WhatsApp API',
          mediaId
        }
      }

      // 3. Download media content
      const buffer = await whatsapp.downloadMedia(mediaInfo.url)
      
      if (!buffer || buffer.length === 0) {
        return {
          success: false,
          error: 'Empty media content received',
          mediaId
        }
      }

      // 4. Determine file extension from mime type
      const mimeType = mediaInfo.mime_type || 'application/octet-stream'
      const ext = getExtensionFromMimeType(mimeType)

      // 5. Generate unique filename and save to local storage
      const mediaDir = await ensureMediaDirectory()
      const filename = `${Date.now()}-${generateRandomString()}.${ext}`
      const filePath = path.join(mediaDir, filename)
      
      await writeFile(filePath, Buffer.from(buffer))

      // 6. Generate public URL
      const baseUrl = process.env.PUBLIC_URL || 'https://api.kirim.chat'
      const publicUrl = `${baseUrl}/uploads/media/${filename}`

      logger.info('Media downloaded and stored successfully', {
        mediaId,
        filename,
        mimeType,
        fileSize: buffer.length
      })

      return {
        success: true,
        localUrl: publicUrl,
        mediaId,
        mimeType,
        fileSize: buffer.length
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      logger.error('Failed to download media', {
        mediaId,
        error: errorMessage
      })

      return {
        success: false,
        error: errorMessage,
        mediaId
      }
    }
  }

  /**
   * Get media URL - either from local storage or fetch from WhatsApp
   * This is a fallback method for media that wasn't downloaded initially
   * 
   * @param mediaId - WhatsApp media ID
   * @param accessToken - Per-account access token (REQUIRED - no global fallback per Meta policy)
   * @returns Public URL for the media
   */
  async getMediaUrl(mediaId: string, accessToken: string): Promise<string> {
    try {
      if (!accessToken) {
        throw new Error('Access token is required for media URL retrieval (per-account token)')
      }
      const whatsapp = new WhatsAppAPI({ accessToken })
      const mediaInfo = await whatsapp.getMediaUrl(mediaId)
      return mediaInfo.url
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Failed to get media URL', { mediaId, error: errorMessage })
      throw error
    }
  }
}

// Export singleton instance
export const mediaDownloadService = new MediaDownloadService()
