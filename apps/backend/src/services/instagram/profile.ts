/**
 * Instagram Profile Module
 * 
 * Contains functions for fetching Instagram account and user profiles.
 * Extracted from InstagramService.ts for better modularity.
 */

import axios, { AxiosInstance } from 'axios';
import { IGAccountProfile, IGUserProfile } from './types.js';
import { IGErrorCode, InstagramError } from './errors.js';
import { logger, extractAxiosError } from '../../utils/logger.js';

// ============================================================================
// Profile Functions
// ============================================================================

/**
 * Get the connected Instagram account profile
 * 
 * @param client - Axios instance for HTTP requests
 * @param accessToken - Instagram access token
 * @param igUserId - Instagram user ID (from OAuth) - kept for compatibility
 * @returns Account profile information
 */
export async function getAccountProfile(
  client: AxiosInstance,
  accessToken: string,
  igUserId: string
): Promise<IGAccountProfile> {
  try {
    // Use /me endpoint for Instagram API with Instagram Login
    // The igUserId parameter is kept for compatibility but we use /me
    const response = await client.get(`https://graph.instagram.com/me`, {
      params: {
        fields: 'user_id,username,name,profile_picture_url,account_type',
        access_token: accessToken,
      },
    });

    const data = response.data;

    return {
      id: data.user_id || data.id, // user_id is the Instagram-scoped ID
      username: data.username,
      name: data.name,
      profilePictureUrl: data.profile_picture_url,
      accountType: data.account_type,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const metaError = error.response?.data?.error;
      throw new InstagramError(
        IGErrorCode.INTERNAL_ERROR,
        `Failed to fetch account profile: ${metaError?.message || error.message}`,
        error.response?.status || 500,
        true,
        undefined,
        metaError ? {
          code: metaError.code,
          message: metaError.message,
          type: metaError.type,
          subcode: metaError.error_subcode,
        } : undefined
      );
    }

    throw new InstagramError(
      IGErrorCode.INTERNAL_ERROR,
      `Failed to fetch account profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      true
    );
  }
}

/**
 * Get an Instagram user's profile (message sender)
 * Handles blocked user errors gracefully
 * 
 * @param client - Axios instance for HTTP requests
 * @param accessToken - Instagram access token
 * @param igsid - Instagram-scoped user ID of the message sender
 * @returns User profile information or null if blocked/unavailable
 */
export async function getUserProfile(
  client: AxiosInstance,
  accessToken: string,
  igsid: string
): Promise<IGUserProfile | null> {
  try {
    const response = await client.get(`https://graph.instagram.com/${igsid}`, {
      params: {
        fields: 'name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user',
        access_token: accessToken,
      },
    });

    const data = response.data;

    return {
      id: igsid,
      name: data.name,
      username: data.username,
      profilePic: data.profile_pic,
      followerCount: data.follower_count,
      isUserFollowBusiness: data.is_user_follow_business,
      isBusinessFollowUser: data.is_business_follow_user,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const metaError = error.response?.data?.error;
      
      // Handle blocked user error gracefully (code 200 or specific subcode)
      // Return null instead of throwing to allow message processing to continue
      if (metaError?.code === 200 || metaError?.error_subcode === 2534015) {
        console.log(`User ${igsid} has blocked the business or profile is unavailable`);
        return null;
      }

      // For other errors, log but still return null to not block message processing
      logger.error('Failed to fetch IG user profile (axios error)', {
        igsid,
        message: metaError?.message || error.message,
      });
      return null;
    }

    logger.error('Failed to fetch IG user profile', {
      igsid,
      error: extractAxiosError(error),
    });
    return null;
  }
}
