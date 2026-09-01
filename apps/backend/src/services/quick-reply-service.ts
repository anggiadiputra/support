import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import type { QuickReply, QuickReplyCategory } from '@prisma/client';

// =============================================================================
// DTOs
// =============================================================================

export interface CreateCategoryDto {
  name: string;
}

export interface UpdateCategoryDto {
  name?: string;
  order?: number;
}

export interface CreateQuickReplyDto {
  categoryId?: string;
  shortcut: string;
  title: string;
  content: string;
}

export interface UpdateQuickReplyDto {
  categoryId?: string;
  shortcut?: string;
  title?: string;
  content?: string;
}

export interface QuickReplyFilters {
  categoryId?: string;
  search?: string;
}

// =============================================================================
// Error Constants
// =============================================================================

export const QUICK_REPLY_ERRORS = {
  // Category errors
  CATEGORY_NAME_EXISTS: 'Category name already exists',
  CATEGORY_NOT_FOUND: 'Category not found',
  CATEGORY_NAME_TOO_LONG: 'Category name must not exceed 50 characters',

  // Quick reply errors
  SHORTCUT_EXISTS: 'Shortcut already exists',
  QUICK_REPLY_NOT_FOUND: 'Quick reply not found',
  INVALID_SHORTCUT_FORMAT: 'Shortcut must be lowercase alphanumeric with dashes only',
  SHORTCUT_TOO_LONG: 'Shortcut must not exceed 50 characters',
  TITLE_TOO_LONG: 'Title must not exceed 100 characters',
  CONTENT_TOO_LONG: 'Content must not exceed 4096 characters',
} as const;

// =============================================================================
// Validation Helpers
// =============================================================================

const SHORTCUT_REGEX = /^[a-z0-9-]+$/;
const MAX_SHORTCUT_LENGTH = 50;
const MAX_TITLE_LENGTH = 100;
const MAX_CONTENT_LENGTH = 4096;
const MAX_CATEGORY_NAME_LENGTH = 50;

function validateShortcut(shortcut: string): void {
  if (shortcut.length > MAX_SHORTCUT_LENGTH) {
    throw new Error(QUICK_REPLY_ERRORS.SHORTCUT_TOO_LONG);
  }
  if (!SHORTCUT_REGEX.test(shortcut)) {
    throw new Error(QUICK_REPLY_ERRORS.INVALID_SHORTCUT_FORMAT);
  }
}

function validateTitle(title: string): void {
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(QUICK_REPLY_ERRORS.TITLE_TOO_LONG);
  }
}

function validateContent(content: string): void {
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new Error(QUICK_REPLY_ERRORS.CONTENT_TOO_LONG);
  }
}

function validateCategoryName(name: string): void {
  if (name.length > MAX_CATEGORY_NAME_LENGTH) {
    throw new Error(QUICK_REPLY_ERRORS.CATEGORY_NAME_TOO_LONG);
  }
}

// =============================================================================
// QuickReplyService
// =============================================================================

/**
 * QuickReplyService
 *
 * Handles quick reply and category management including CRUD operations,
 * search, and reordering.
 */
export class QuickReplyService {
  // ============================================
  // Category Operations
  // ============================================

  /**
   * List all categories for a user, ordered by order field
   *
   * @param userId - The user's ID
   * @returns Array of categories
   */
  async listCategories(userId: string): Promise<QuickReplyCategory[]> {
    return prisma.quickReplyCategory.findMany({
      where: { userId },
      orderBy: { order: 'asc' },
    });
  }

  /**
   * Create a new category
   *
   * @param userId - The user's ID
   * @param data - Category creation data
   * @returns Created category
   * @throws Error if category name already exists
   */
  async createCategory(userId: string, data: CreateCategoryDto): Promise<QuickReplyCategory> {
    validateCategoryName(data.name);

    // Check for duplicate name
    const existing = await prisma.quickReplyCategory.findUnique({
      where: {
        userId_name: {
          userId,
          name: data.name,
        },
      },
    });

    if (existing) {
      throw new Error(QUICK_REPLY_ERRORS.CATEGORY_NAME_EXISTS);
    }

    // Get max order to append at end
    const maxOrder = await prisma.quickReplyCategory.aggregate({
      where: { userId },
      _max: { order: true },
    });

    const category = await prisma.quickReplyCategory.create({
      data: {
        userId,
        name: data.name,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    logger.info('Quick reply category created', { userId, categoryId: category.id });
    return category;
  }

  /**
   * Update an existing category
   *
   * @param userId - The user's ID
   * @param categoryId - Category ID
   * @param data - Category update data
   * @returns Updated category
   * @throws Error if category not found or name conflict
   */
  async updateCategory(
    userId: string,
    categoryId: string,
    data: UpdateCategoryDto
  ): Promise<QuickReplyCategory> {
    // Verify ownership
    const category = await prisma.quickReplyCategory.findFirst({
      where: { id: categoryId, userId },
    });

    if (!category) {
      throw new Error(QUICK_REPLY_ERRORS.CATEGORY_NOT_FOUND);
    }

    // Validate name if provided
    if (data.name !== undefined) {
      validateCategoryName(data.name);

      // Check for name conflict if name is being updated
      if (data.name !== category.name) {
        const existing = await prisma.quickReplyCategory.findUnique({
          where: {
            userId_name: {
              userId,
              name: data.name,
            },
          },
        });

        if (existing) {
          throw new Error(QUICK_REPLY_ERRORS.CATEGORY_NAME_EXISTS);
        }
      }
    }

    const updatedCategory = await prisma.quickReplyCategory.update({
      where: { id: categoryId },
      data: {
        name: data.name,
        order: data.order,
      },
    });

    logger.info('Quick reply category updated', { userId, categoryId });
    return updatedCategory;
  }

  /**
   * Delete a category
   * Quick replies in this category will have categoryId set to null (SET NULL)
   *
   * @param userId - The user's ID
   * @param categoryId - Category ID
   * @throws Error if category not found
   */
  async deleteCategory(userId: string, categoryId: string): Promise<void> {
    // Verify ownership
    const category = await prisma.quickReplyCategory.findFirst({
      where: { id: categoryId, userId },
    });

    if (!category) {
      throw new Error(QUICK_REPLY_ERRORS.CATEGORY_NOT_FOUND);
    }

    // Delete category - quick replies will be set to uncategorized via SET NULL
    await prisma.quickReplyCategory.delete({
      where: { id: categoryId },
    });

    logger.info('Quick reply category deleted', { userId, categoryId });
  }

  /**
   * Reorder categories by setting order field based on array position
   *
   * @param userId - The user's ID
   * @param categoryIds - Array of category IDs in desired order
   */
  async reorderCategories(userId: string, categoryIds: string[]): Promise<void> {
    // Verify all categories belong to user
    const categories = await prisma.quickReplyCategory.findMany({
      where: {
        id: { in: categoryIds },
        userId,
      },
    });

    if (categories.length !== categoryIds.length) {
      throw new Error(QUICK_REPLY_ERRORS.CATEGORY_NOT_FOUND);
    }

    // Update order for each category in a transaction
    await prisma.$transaction(
      categoryIds.map((id, index) =>
        prisma.quickReplyCategory.update({
          where: { id },
          data: { order: index },
        })
      )
    );

    logger.info('Quick reply categories reordered', { userId, count: categoryIds.length });
  }

  // ============================================
  // Quick Reply Operations
  // ============================================

  /**
   * List quick replies with optional filters
   *
   * @param userId - The user's ID
   * @param filters - Optional filters (categoryId, search)
   * @returns Array of quick replies
   */
  async listQuickReplies(
    userId: string,
    filters?: QuickReplyFilters
  ): Promise<QuickReply[]> {
    const where: {
      userId: string;
      categoryId?: string | null;
      OR?: { shortcut?: { contains: string }; title?: { contains: string } }[];
    } = { userId };

    if (filters?.categoryId !== undefined) {
      // null means uncategorized, string means specific category
      where.categoryId = filters.categoryId === '' ? null : filters.categoryId;
    }

    if (filters?.search) {
      where.OR = [
        { shortcut: { contains: filters.search } },
        { title: { contains: filters.search } },
      ];
    }

    return prisma.quickReply.findMany({
      where,
      include: { category: true },
      orderBy: [{ shortcut: 'asc' }],
    });
  }

  /**
   * Search quick replies by shortcut or title for autocomplete
   *
   * @param userId - The user's ID
   * @param query - Search query
   * @returns Array of matching quick replies
   */
  async searchQuickReplies(userId: string, query: string): Promise<QuickReply[]> {
    const lowerQuery = query.toLowerCase();

    return prisma.quickReply.findMany({
      where: {
        userId,
        OR: [
          { shortcut: { contains: lowerQuery } },
          { title: { contains: lowerQuery } },
        ],
      },
      include: { category: true },
      orderBy: [{ shortcut: 'asc' }],
      take: 10, // Limit for autocomplete
    });
  }

  /**
   * Create a new quick reply
   *
   * @param userId - The user's ID
   * @param createdById - ID of the user creating the quick reply
   * @param data - Quick reply creation data
   * @returns Created quick reply
   * @throws Error if validation fails or shortcut exists
   */
  async createQuickReply(
    userId: string,
    createdById: string,
    data: CreateQuickReplyDto
  ): Promise<QuickReply> {
    // Validate inputs
    validateShortcut(data.shortcut);
    validateTitle(data.title);
    validateContent(data.content);

    // Check for duplicate shortcut
    const existing = await prisma.quickReply.findUnique({
      where: {
        userId_shortcut: {
          userId,
          shortcut: data.shortcut,
        },
      },
    });

    if (existing) {
      throw new Error(QUICK_REPLY_ERRORS.SHORTCUT_EXISTS);
    }

    // Verify category exists if provided
    if (data.categoryId) {
      const category = await prisma.quickReplyCategory.findFirst({
        where: { id: data.categoryId, userId },
      });

      if (!category) {
        throw new Error(QUICK_REPLY_ERRORS.CATEGORY_NOT_FOUND);
      }
    }

    const quickReply = await prisma.quickReply.create({
      data: {
        userId,
        createdById,
        categoryId: data.categoryId ?? null,
        shortcut: data.shortcut,
        title: data.title,
        content: data.content,
      },
    });

    logger.info('Quick reply created', { userId, quickReplyId: quickReply.id });
    return quickReply;
  }

  /**
   * Update an existing quick reply
   *
   * @param userId - The user's ID
   * @param quickReplyId - Quick reply ID
   * @param data - Quick reply update data
   * @returns Updated quick reply
   * @throws Error if not found or validation fails
   */
  async updateQuickReply(
    userId: string,
    quickReplyId: string,
    data: UpdateQuickReplyDto
  ): Promise<QuickReply> {
    // Verify ownership
    const quickReply = await prisma.quickReply.findFirst({
      where: { id: quickReplyId, userId },
    });

    if (!quickReply) {
      throw new Error(QUICK_REPLY_ERRORS.QUICK_REPLY_NOT_FOUND);
    }

    // Validate inputs if provided
    if (data.shortcut !== undefined) {
      validateShortcut(data.shortcut);

      // Check for shortcut conflict if shortcut is being updated
      if (data.shortcut !== quickReply.shortcut) {
        const existing = await prisma.quickReply.findUnique({
          where: {
            userId_shortcut: {
              userId,
              shortcut: data.shortcut,
            },
          },
        });

        if (existing) {
          throw new Error(QUICK_REPLY_ERRORS.SHORTCUT_EXISTS);
        }
      }
    }

    if (data.title !== undefined) {
      validateTitle(data.title);
    }

    if (data.content !== undefined) {
      validateContent(data.content);
    }

    // Verify category exists if being updated
    if (data.categoryId !== undefined && data.categoryId !== null) {
      const category = await prisma.quickReplyCategory.findFirst({
        where: { id: data.categoryId, userId },
      });

      if (!category) {
        throw new Error(QUICK_REPLY_ERRORS.CATEGORY_NOT_FOUND);
      }
    }

    const updatedQuickReply = await prisma.quickReply.update({
      where: { id: quickReplyId },
      data: {
        categoryId: data.categoryId,
        shortcut: data.shortcut,
        title: data.title,
        content: data.content,
      },
    });

    logger.info('Quick reply updated', { userId, quickReplyId });
    return updatedQuickReply;
  }

  /**
   * Delete a quick reply
   *
   * @param userId - The user's ID
   * @param quickReplyId - Quick reply ID
   * @throws Error if not found
   */
  async deleteQuickReply(userId: string, quickReplyId: string): Promise<void> {
    // Verify ownership
    const quickReply = await prisma.quickReply.findFirst({
      where: { id: quickReplyId, userId },
    });

    if (!quickReply) {
      throw new Error(QUICK_REPLY_ERRORS.QUICK_REPLY_NOT_FOUND);
    }

    await prisma.quickReply.delete({
      where: { id: quickReplyId },
    });

    logger.info('Quick reply deleted', { userId, quickReplyId });
  }

  /**
   * Get a quick reply by its shortcut for quick lookup
   *
   * @param userId - The user's ID
   * @param shortcut - The shortcut to look up
   * @returns Quick reply or null
   */
  async getQuickReplyByShortcut(userId: string, shortcut: string): Promise<QuickReply | null> {
    return prisma.quickReply.findUnique({
      where: {
        userId_shortcut: {
          userId,
          shortcut,
        },
      },
    });
  }
}

// Export singleton instance
export const quickReplyService = new QuickReplyService();
