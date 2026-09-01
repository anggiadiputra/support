/**
 * Customers Query Hooks
 *
 * TanStack Query hooks for customers data fetching with proper caching.
 * Uses hierarchical query keys and configured cache times for optimal performance.
 * Supports optimistic updates for immediate UI feedback.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 8.1, 8.2, 8.3
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { customersApi, type Customer, type CustomersFilters, type CustomerStats } from '@/lib/api/customers-api'
import { queryKeys } from '@/lib/query-keys'
import { CACHE_TIMES } from '@/lib/cache-config'

/**
 * Filters for customer statistics
 */
export interface CustomerStatsFilters {
  whatsappPhoneNumberId?: string
}

/**
 * Hook for fetching customer statistics
 *
 * Returns counts for total, consented, active window, and blacklisted customers.
 * Stats are cached and invalidated when customer data changes.
 * Supports filtering by whatsappPhoneNumberId for multi-number accounts.
 *
 * @param filters - Optional filters for phone number
 * @param enabled - Whether the query should be enabled (default: true)
 */
export function useCustomerStats(filters?: CustomerStatsFilters, enabled: boolean = true) {
  return useQuery<CustomerStats, Error>({
    queryKey: queryKeys.customers.stats(filters || {}),
    queryFn: () => customersApi.getStats(filters),
    ...CACHE_TIMES.customers,
    enabled,
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook for fetching customers list with pagination and filtering support
 *
 * Caches data for 3 minutes (stale time) and keeps in memory for 15 minutes (gc time).
 * Returns cached data immediately on subsequent visits while revalidating in background.
 * Different filter combinations have separate cache entries.
 *
 * Requirements: 4.1, 4.3, 4.4
 *
 * @param filters - Optional filters for pagination and search
 * @param enabled - Whether the query should be enabled (default: true)
 */
export function useCustomers(filters?: CustomersFilters, enabled: boolean = true) {
  return useQuery<Customer[], Error>({
    queryKey: queryKeys.customers.list(filters || {}),
    queryFn: () => customersApi.getCustomers(filters),
    ...CACHE_TIMES.customers,
    enabled,
    // Show cached data on error
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook for fetching a single customer by ID
 *
 * Uses separate cache key from list for granular cache control.
 * Customer details are cached independently from the list.
 *
 * Requirements: 4.3, 4.4
 *
 * @param id - Customer ID to fetch
 * @param enabled - Whether the query should be enabled (default: true when id is provided)
 */
export function useCustomerDetail(id: string | undefined, enabled: boolean = true) {
  return useQuery<Customer, Error>({
    queryKey: queryKeys.customers.detail(id || ''),
    queryFn: () => customersApi.getCustomer(id!),
    ...CACHE_TIMES.customers,
    enabled: enabled && !!id,
    // Show cached data on error
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Create customer input type
 */
export interface CreateCustomerInput {
  phoneNumber: string
  name?: string
  whatsappPhoneNumberId: string
  consentStatus: boolean
  consentSource: string
}

/**
 * Hook for creating a new customer with cache invalidation
 *
 * Invalidates all customers queries on success to ensure fresh data.
 * Also invalidates dashboard stats as customer counts may change.
 *
 * Requirements: 4.2, 8.1
 */
export function useCreateCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateCustomerInput) => customersApi.createCustomer(data),
    onSuccess: () => {
      // Invalidate all customers queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
      // Also invalidate dashboard stats as customer counts may change
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats() })
    },
  })
}

/**
 * Update customer input type
 */
export interface UpdateCustomerInput {
  id: string
  data: {
    name?: string
    email?: string | null
    pipelineStageId?: string | null
  }
}

/**
 * Hook for updating a customer with optimistic update
 *
 * Optimistically updates the customer data immediately in the cache,
 * then rolls back if the mutation fails.
 *
 * Requirements: 4.2, 8.1, 8.2, 8.3
 */
export function useUpdateCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: UpdateCustomerInput) => customersApi.updateCustomer(id, data),
    // Optimistic update: immediately update customer data
    onMutate: async ({ id, data }: UpdateCustomerInput) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.customers.detail(id) })
      await queryClient.cancelQueries({ queryKey: queryKeys.customers.lists() })

      // Snapshot the previous values
      const previousDetail = queryClient.getQueryData<Customer>(queryKeys.customers.detail(id))
      const previousLists = queryClient.getQueriesData<Customer[]>({ queryKey: queryKeys.customers.lists() })

      // Optimistically update the detail cache
      if (previousDetail) {
        queryClient.setQueryData<Customer>(queryKeys.customers.detail(id), {
          ...previousDetail,
          ...data,
          updatedAt: new Date().toISOString(),
        })
      }

      // Optimistically update all list caches that contain this customer
      previousLists.forEach(([queryKey, listData]) => {
        if (listData) {
          queryClient.setQueryData<Customer[]>(queryKey, 
            listData.map(customer => 
              customer.id === id 
                ? { ...customer, ...data, updatedAt: new Date().toISOString() } 
                : customer
            )
          )
        }
      })

      // Return context with previous values for rollback
      return { previousDetail, previousLists }
    },
    // Rollback on error
    onError: (_error, { id }, context) => {
      // Restore detail cache
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.customers.detail(id), context.previousDetail)
      }
      // Restore all list caches
      if (context?.previousLists) {
        context.previousLists.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
    },
    // Always refetch after error or success to ensure consistency
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats() })
    },
  })
}

/**
 * Hook for deleting a customer with cache invalidation
 *
 * Invalidates all customers queries on success to ensure fresh data.
 * Also invalidates dashboard stats as customer counts may change.
 *
 * Requirements: 4.2, 8.1
 */
export function useDeleteCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => customersApi.deleteCustomer(id),
    onSuccess: (_data, id) => {
      // Invalidate all customers queries
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
      // Also invalidate dashboard stats as customer counts may change
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats() })
    },
  })
}

/**
 * Hook for updating customer consent status
 *
 * Invalidates both list and detail caches on success.
 *
 * Requirements: 4.2, 8.1
 */
export function useUpdateCustomerConsent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, consentStatus }: { id: string; consentStatus: boolean }) =>
      customersApi.updateConsent(id, consentStatus),
    onSuccess: (_data, variables) => {
      // Invalidate specific customer detail
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(variables.id) })
      // Invalidate customers list as consent status may change
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.lists() })
    },
  })
}

/**
 * Hook for toggling customer blacklist status with optimistic update
 *
 * Optimistically updates the blacklist status immediately,
 * then rolls back if the mutation fails.
 *
 * Requirements: 4.2, 8.1, 8.2, 8.3
 */
export function useToggleCustomerBlacklist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, blacklisted }: { id: string; blacklisted: boolean }) =>
      customersApi.toggleBlacklist(id, blacklisted),
    // Optimistic update: immediately toggle blacklist status
    onMutate: async ({ id, blacklisted }: { id: string; blacklisted: boolean }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.customers.detail(id) })
      await queryClient.cancelQueries({ queryKey: queryKeys.customers.lists() })

      // Snapshot the previous values
      const previousDetail = queryClient.getQueryData<Customer>(queryKeys.customers.detail(id))
      const previousLists = queryClient.getQueriesData<Customer[]>({ queryKey: queryKeys.customers.lists() })

      // New blacklist value (toggle)
      const newBlacklisted = !blacklisted

      // Optimistically update the detail cache
      if (previousDetail) {
        queryClient.setQueryData<Customer>(queryKeys.customers.detail(id), {
          ...previousDetail,
          blacklisted: newBlacklisted,
          updatedAt: new Date().toISOString(),
        })
      }

      // Optimistically update all list caches
      previousLists.forEach(([queryKey, listData]) => {
        if (listData) {
          queryClient.setQueryData<Customer[]>(queryKey, 
            listData.map(customer => 
              customer.id === id 
                ? { ...customer, blacklisted: newBlacklisted, updatedAt: new Date().toISOString() } 
                : customer
            )
          )
        }
      })

      return { previousDetail, previousLists }
    },
    // Rollback on error
    onError: (_error, { id }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.customers.detail(id), context.previousDetail)
      }
      if (context?.previousLists) {
        context.previousLists.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
    },
    // Always refetch after error or success
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.lists() })
    },
  })
}

/**
 * Import customer input type for optimistic updates
 */
export interface ImportCustomerInput {
  phoneNumber: string
  name?: string
  consentStatus?: boolean
  consentSource?: string
}

/**
 * Hook for importing customers from CSV with optimistic update
 *
 * Optimistically adds imported customers to the list immediately,
 * then reconciles with server response or rolls back on error.
 *
 * Requirements: 4.2, 8.1, 8.2, 8.3
 */
export function useImportCustomers() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (customers: ImportCustomerInput[]) => customersApi.importCustomers(customers),
    // Optimistic update: immediately add customers to the list
    onMutate: async (newCustomers: ImportCustomerInput[]) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.customers.lists() })
      await queryClient.cancelQueries({ queryKey: queryKeys.customers.stats() })

      // Snapshot the previous values
      const previousLists = queryClient.getQueriesData<Customer[]>({ queryKey: queryKeys.customers.lists() })
      const previousStats = queryClient.getQueryData<CustomerStats>(queryKeys.customers.stats())

      // Create optimistic customers with temporary IDs
      const now = new Date().toISOString()
      const optimisticCustomers: Customer[] = newCustomers.map((c, index) => ({
        id: `temp-${Date.now()}-${index}`,
        phoneNumber: c.phoneNumber,
        name: c.name || null,
        email: null,
        consentStatus: c.consentStatus ? 'CONSENTED' : 'NOT_CONSENTED',
        blacklisted: false,
        leadScore: 0,
        pipelineStageId: null,
        pipelineStage: null,
        lastMessageAt: null,
        hasActiveWindow: false,
        createdAt: now,
        updatedAt: now,
        _isOptimistic: true, // Flag to identify optimistic entries
      } as Customer & { _isOptimistic?: boolean }))

      // Optimistically add to all list caches
      previousLists.forEach(([queryKey, listData]) => {
        if (listData) {
          queryClient.setQueryData<Customer[]>(queryKey, [...optimisticCustomers, ...listData])
        }
      })

      // Optimistically update stats
      if (previousStats) {
        const consentedCount = newCustomers.filter(c => c.consentStatus).length
        queryClient.setQueryData<CustomerStats>(queryKeys.customers.stats(), {
          ...previousStats,
          total: previousStats.total + newCustomers.length,
          consented: previousStats.consented + consentedCount,
        })
      }

      // Return context with previous values for rollback
      return { previousLists, previousStats, optimisticCustomers }
    },
    // Rollback on error
    onError: (_error, _variables, context) => {
      // Restore all list caches
      if (context?.previousLists) {
        context.previousLists.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
      // Restore stats
      if (context?.previousStats) {
        queryClient.setQueryData(queryKeys.customers.stats(), context.previousStats)
      }
    },
    // Always refetch after error or success to ensure consistency
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats() })
    },
  })
}
