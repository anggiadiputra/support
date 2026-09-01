/**
 * Quick Reply Autocomplete Hook
 *
 * Provides autocomplete functionality for quick replies using `/` shortcut.
 * Detects `/shortcut` pattern at end of input and shows matching quick replies.
 */
import { useState, useCallback, useMemo, useEffect, useDeferredValue } from "react"
import { useQuickReplySearch } from "./use-quick-replies"
import type { QuickReply } from "@/lib/api/quick-replies-api"

interface UseQuickReplyAutocompleteOptions {
  inputValue: string
  enabled?: boolean
}

interface UseQuickReplyAutocompleteReturn {
  /** Whether autocomplete dropdown should be open */
  isOpen: boolean
  /** The search query extracted from input (without `/`) */
  query: string
  /** Matching quick replies */
  results: QuickReply[]
  /** Loading state */
  isLoading: boolean
  /** Currently selected index in results */
  selectedIndex: number
  /** Select a quick reply and get its content */
  selectQuickReply: (quickReply: QuickReply) => string
  /** Move selection up */
  moveUp: () => void
  /** Move selection down */
  moveDown: () => void
  /** Reset autocomplete state */
  reset: () => void
  /** Set selected index directly */
  setSelectedIndex: (index: number) => void
  /** Close autocomplete explicitly */
  close: () => void
}

/**
 * Extracts `/shortcut` pattern from end of input
 * Returns null if no pattern found, or the shortcut string without `/`
 */
function extractShortcutQuery(input: string): string | null {
  // Match `/` followed by word characters at the end of input
  // Supports: /hello, /greeting, /thanks123
  const match = input.match(/\/(\w*)$/)
  if (match) {
    return match[1] // Return the shortcut without `/`
  }
  return null
}

export function useQuickReplyAutocomplete({
  inputValue,
  enabled = true,
}: UseQuickReplyAutocompleteOptions): UseQuickReplyAutocompleteReturn {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Extract shortcut query from input
  const query = useMemo(() => {
    if (!enabled) return null
    return extractShortcutQuery(inputValue)
  }, [inputValue, enabled])

  // Determine if autocomplete should be open
  const isOpen = query !== null

  // Debounce the query to prevent firing search on every keystroke
  const deferredQuery = useDeferredValue(query)

  // Search for matching quick replies
  const { data: results = [], isLoading } = useQuickReplySearch(
    deferredQuery || "",
    {
      enabled: isOpen && (deferredQuery?.length ?? 0) > 0,
    }
  )

  // Reset selected index when results change
  // Use results IDs as dependency to avoid object reference issues
  const resultsKey = results.map((r) => r.id).join(",")
  useEffect(() => {
    setSelectedIndex(0)
  }, [resultsKey])

  // Select a quick reply and return its content
  const selectQuickReply = useCallback((quickReply: QuickReply): string => {
    return quickReply.content
  }, [])

  // Move selection up
  const moveUp = useCallback(() => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
  }, [results.length])

  // Move selection down
  const moveDown = useCallback(() => {
    setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
  }, [results.length])

  // Reset autocomplete state
  const reset = useCallback(() => {
    setSelectedIndex(0)
  }, [])

  // Close autocomplete explicitly
  const close = useCallback(() => {
    setSelectedIndex(0)
  }, [])

  return {
    isOpen,
    query: query || "",
    results,
    isLoading,
    selectedIndex,
    selectQuickReply,
    moveUp,
    moveDown,
    reset,
    setSelectedIndex,
    close,
  }
}

/**
 * Replace the `/shortcut` pattern in input with quick reply content
 */
export function replaceShortcutWithContent(
  input: string,
  content: string
): string {
  // Remove the `/shortcut` pattern and replace with content
  return input.replace(/\/\w*$/, content)
}
