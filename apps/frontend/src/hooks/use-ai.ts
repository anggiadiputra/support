/**
 * AI Query Hooks
 *
 * TanStack Query hooks for AI features - config, documents, and agents.
 * Supports optimistic updates and polling for document processing status.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  aiApi,
  type AIConfig,
  type AIAgent,
  type KnowledgeDocument,
} from '@/lib/api/ai-api'

/**
 * Query keys for AI
 */
export const aiKeys = {
  all: ['ai'] as const,
  config: (wabaId?: string) => [...aiKeys.all, 'config', wabaId || 'default'] as const,
  documents: () => [...aiKeys.all, 'documents'] as const,
  agents: () => [...aiKeys.all, 'agents'] as const,
  agent: (id: string) => [...aiKeys.all, 'agent', id] as const,
}

/**
 * Cache configuration for AI
 */
const AI_CACHE = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 30 * 60 * 1000, // 30 minutes
}

/**
 * Hook for fetching AI config
 */
export function useAIConfig(wabaId?: string, enabled: boolean = true) {
  return useQuery<{ data: AIConfig; isCustomized?: boolean }, Error>({
    queryKey: aiKeys.config(wabaId),
    queryFn: () => aiApi.getConfig(wabaId),
    ...AI_CACHE,
    enabled,
  })
}

/**
 * Hook for updating AI config
 */
export function useUpdateAIConfig() {
  const queryClient = useQueryClient()

  return useMutation<AIConfig, Error, { data: Partial<AIConfig>; wabaId?: string }>({
    mutationFn: ({ data, wabaId }) => aiApi.updateConfig(data, wabaId),
    onSuccess: (_, { wabaId }) => {
      queryClient.invalidateQueries({ queryKey: aiKeys.config(wabaId) })
    },
  })
}

/**
 * Hook for fetching knowledge documents
 * Auto-polls when any document is still processing
 */
export function useAIDocuments(enabled: boolean = true) {
  return useQuery<KnowledgeDocument[], Error>({
    queryKey: aiKeys.documents(),
    queryFn: () => aiApi.getDocuments(),
    ...AI_CACHE,
    enabled,
    placeholderData: (previousData) => previousData,
    // Auto-poll when any document is still processing
    refetchInterval: (query) => {
      const docs = query.state.data
      const hasProcessing = docs?.some(
        (d) => d.status === 'PROCESSING' || d.status === 'PENDING'
      )
      return hasProcessing ? 5000 : false // Poll every 5s if processing
    },
  })
}

/**
 * Hook for uploading a document
 * Handles optimistic updates and triggers polling for processing status
 */
export function useUploadDocument() {
  const queryClient = useQueryClient()

  return useMutation<
    KnowledgeDocument,
    Error,
    File,
    { tempId: string; optimisticDoc: KnowledgeDocument }
  >({
    mutationFn: async (file) => {
      const result = await aiApi.uploadDocument(file)
      return result.document || result.data || result
    },
    onMutate: async (file) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: aiKeys.documents() })

      // Generate temp ID for optimistic update
      const tempId = `temp-${Date.now()}`
      const optimisticDoc: KnowledgeDocument = {
        id: tempId,
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      }

      // Optimistic: add to list immediately
      queryClient.setQueryData<KnowledgeDocument[]>(aiKeys.documents(), (old) => {
        if (!old) return [optimisticDoc]
        return [optimisticDoc, ...old]
      })

      return { tempId, optimisticDoc }
    },
    onSuccess: (uploadedDoc, _, context) => {
      // Replace temp doc with real doc
      queryClient.setQueryData<KnowledgeDocument[]>(aiKeys.documents(), (old) => {
        if (!old) return [uploadedDoc]
        return old.map((d) =>
          d.id === context?.tempId
            ? { ...uploadedDoc, status: 'PROCESSING' as const }
            : d
        )
      })
    },
    onError: (_error, _file, context) => {
      // Rollback: remove optimistic doc
      if (context?.tempId) {
        queryClient.setQueryData<KnowledgeDocument[]>(aiKeys.documents(), (old) => {
          if (!old) return old
          return old.filter((d) => d.id !== context.tempId)
        })
      }
    },
  })
}

/**
 * Hook for polling document processing status
 */
export function usePollDocumentStatus(docId: string | null, enabled: boolean = true) {
  return useQuery<KnowledgeDocument | null, Error>({
    queryKey: [...aiKeys.documents(), 'poll', docId],
    queryFn: async () => {
      if (!docId) return null
      const docs = await aiApi.getDocuments()
      return docs.find((d: KnowledgeDocument) => d.id === docId) || null
    },
    enabled: enabled && !!docId,
    refetchInterval: (query) => {
      const doc = query.state.data
      // Continue polling if still processing
      if (doc?.status === 'PROCESSING' || doc?.status === 'PENDING') {
        return 5000 // Poll every 5 seconds
      }
      return false // Stop polling
    },
  })
}

/**
 * Hook for deleting a document
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient()

  return useMutation<
    void,
    Error,
    string,
    { previousDocs: KnowledgeDocument[] | undefined }
  >({
    mutationFn: (id) => aiApi.deleteDocument(id),
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: aiKeys.documents() })

      // Snapshot previous value
      const previousDocs = queryClient.getQueryData<KnowledgeDocument[]>(aiKeys.documents())

      // Optimistically remove
      queryClient.setQueryData<KnowledgeDocument[]>(aiKeys.documents(), (old) => {
        if (!old) return old
        return old.filter((d) => d.id !== id)
      })

      return { previousDocs }
    },
    onError: (_error, _id, context) => {
      // Rollback on error
      if (context?.previousDocs) {
        queryClient.setQueryData(aiKeys.documents(), context.previousDocs)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.documents() })
    },
  })
}

/**
 * Hook for fetching AI agents
 */
export function useAIAgents(enabled: boolean = true) {
  return useQuery<AIAgent[], Error>({
    queryKey: aiKeys.agents(),
    queryFn: () => aiApi.getAgents(),
    ...AI_CACHE,
    enabled,
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Input types for agent mutations
 */
export interface CreateAgentInput {
  name: string
  systemPrompt: string
  documentIds: string[]
  assignedPhoneNumberIds?: string[]
}

export interface UpdateAgentInput {
  id: string
  data: {
    name: string
    systemPrompt: string
    documentIds: string[]
    assignedPhoneNumberIds?: string[]
  }
}

/**
 * Hook for creating an agent
 */
export function useCreateAgent() {
  const queryClient = useQueryClient()

  return useMutation<AIAgent, Error, CreateAgentInput>({
    mutationFn: (input) => aiApi.createAgent(input),
    onSuccess: () => {
      // Invalidate to get fresh data with correct knowledgeDocumentCount
      queryClient.invalidateQueries({ queryKey: aiKeys.agents() })
    },
  })
}

/**
 * Hook for updating an agent
 */
export function useUpdateAgent() {
  const queryClient = useQueryClient()

  return useMutation<AIAgent, Error, UpdateAgentInput>({
    mutationFn: ({ id, data }) => aiApi.updateAgent(id, data),
    onSuccess: () => {
      // Invalidate to get fresh data with correct knowledgeDocumentCount
      queryClient.invalidateQueries({ queryKey: aiKeys.agents() })
    },
  })
}

/**
 * Hook for deleting an agent
 */
export function useDeleteAgent() {
  const queryClient = useQueryClient()

  return useMutation<
    boolean,
    Error,
    string,
    { previousAgents: AIAgent[] | undefined }
  >({
    mutationFn: (id) => aiApi.deleteAgent(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: aiKeys.agents() })

      const previousAgents = queryClient.getQueryData<AIAgent[]>(aiKeys.agents())

      queryClient.setQueryData<AIAgent[]>(aiKeys.agents(), (old) => {
        if (!old) return old
        return old.filter((a) => a.id !== id)
      })

      return { previousAgents }
    },
    onError: (_error, _id, context) => {
      if (context?.previousAgents) {
        queryClient.setQueryData(aiKeys.agents(), context.previousAgents)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.agents() })
    },
  })
}

/**
 * Hook for testing chat with an agent
 * Supports conversation history for context retention during test sessions
 */
export function useTestChat() {
  return useMutation<
    { response: string; isError: boolean },
    Error,
    { message: string; agentId: string; history?: { role: 'user' | 'assistant'; content: string }[] }
  >({
    mutationFn: ({ message, agentId, history }) => aiApi.testChat(message, agentId, history),
  })
}
