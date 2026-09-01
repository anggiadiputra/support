"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface BottomNavContextType {
  isHidden: boolean
  setIsHidden: (hidden: boolean) => void
}

const BottomNavContext = createContext<BottomNavContextType | undefined>(undefined)

export function BottomNavProvider({ children }: { children: ReactNode }) {
  const [isHidden, setIsHidden] = useState(false)

  return (
    <BottomNavContext.Provider value={{ isHidden, setIsHidden }}>
      {children}
    </BottomNavContext.Provider>
  )
}

export function useBottomNav() {
  const context = useContext(BottomNavContext)
  if (!context) {
    return { isHidden: false, setIsHidden: () => {} }
  }
  return context
}

// Wrapper component for content with dynamic padding
export function ContentWrapper({ 
  children, 
  className 
}: { 
  children: ReactNode
  className?: string 
}) {
  const { isHidden } = useBottomNav()
  
  return (
    <div
      id="content"
      className={cn(
        "flex h-full w-full flex-col md:pb-0",
        isHidden ? "pb-0" : "pb-16",
        className
      )}
    >
      {children}
    </div>
  )
}
