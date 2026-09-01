"use client"

import { useEffect, useState, useCallback, useRef } from "react"

export function useActiveSection(sectionIds: string[]) {
  const [activeSection, setActiveSection] = useState(sectionIds[0] || "")
  const initializedRef = useRef(false)

  const handleScroll = useCallback(() => {
    const scrollPosition = window.scrollY + 100 // Offset for header

    for (let i = sectionIds.length - 1; i >= 0; i--) {
      const element = document.getElementById(sectionIds[i])
      if (element) {
        const offsetTop = element.offsetTop
        if (scrollPosition >= offsetTop) {
          setActiveSection(sectionIds[i])
          return
        }
      }
    }

    // Default to first section
    setActiveSection(sectionIds[0] || "")
  }, [sectionIds])

  useEffect(() => {
    // Only run initialization once
    if (initializedRef.current) return
    initializedRef.current = true

    // Check initial hash after a small delay to avoid sync setState
    const hash = window.location.hash.slice(1)
    if (hash && sectionIds.includes(hash)) {
      requestAnimationFrame(() => {
        setActiveSection(hash)
        const element = document.getElementById(hash)
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      })
    }
  }, [sectionIds])

  useEffect(() => {
    // Listen to scroll
    const container = document.querySelector("main")
    if (container) {
      container.addEventListener("scroll", handleScroll)
      return () => container.removeEventListener("scroll", handleScroll)
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [handleScroll])

  return activeSection
}
