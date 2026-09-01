"use client"

import { useEffect, useRef, useCallback } from "react"

// Linear interpolation for smooth movement
function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor
}

interface NotFoundMascotProps {
  className?: string
  size?: number
}

export function NotFoundMascot({ className, size = 120 }: NotFoundMascotProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const leftPupilRef = useRef<SVGCircleElement>(null)
  const rightPupilRef = useRef<SVGCircleElement>(null)

  // Store current and target positions
  const mousePos = useRef({ x: 0, y: 0 })
  const currentPos = useRef({ x: 0, y: 0 })
  const animationFrameId = useRef<number | null>(null)

  const animate = useCallback(() => {
    const lerpFactor = 0.08

    currentPos.current.x = lerp(
      currentPos.current.x,
      mousePos.current.x,
      lerpFactor
    )
    currentPos.current.y = lerp(
      currentPos.current.y,
      mousePos.current.y,
      lerpFactor
    )

    const x = currentPos.current.x
    const y = currentPos.current.y

    if (leftPupilRef.current) {
      leftPupilRef.current.setAttribute("cx", String(22 + x))
      leftPupilRef.current.setAttribute("cy", String(30 + y))
    }
    if (rightPupilRef.current) {
      rightPupilRef.current.setAttribute("cx", String(42 + x))
      rightPupilRef.current.setAttribute("cy", String(30 + y))
    }

    animationFrameId.current = requestAnimationFrame(animate)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const containerCenterX = rect.left + rect.width / 2
      const containerCenterY = rect.top + rect.height / 2

      const deltaX = e.clientX - containerCenterX
      const deltaY = e.clientY - containerCenterY

      const maxMovement = 3
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
      const normalizedX =
        distance > 0
          ? (deltaX / distance) * Math.min(distance / 50, 1) * maxMovement
          : 0
      const normalizedY =
        distance > 0
          ? (deltaY / distance) * Math.min(distance / 50, 1) * maxMovement
          : 0

      mousePos.current = { x: normalizedX, y: normalizedY }
    }

    window.addEventListener("mousemove", handleMouseMove)
    animationFrameId.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current)
      }
    }
  }, [animate])

  return (
    <div ref={containerRef} className={className}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-lg"
        style={{ willChange: "transform" }}
      >
        {/* Background circle - chat bubble shape with muted color */}
        <circle cx="32" cy="32" r="28" className="fill-muted-foreground" />

        {/* Chat bubble tail */}
        <path d="M45 50 L55 60 L50 48" className="fill-muted-foreground" />

        {/* Left eye white */}
        <ellipse cx="22" cy="30" rx="8" ry="9" className="fill-white" />

        {/* Right eye white */}
        <ellipse cx="42" cy="30" rx="8" ry="9" className="fill-white" />

        {/* Left pupil - animated via ref */}
        <circle
          ref={leftPupilRef}
          cx="22"
          cy="30"
          r="4"
          className="fill-gray-900"
        />

        {/* Right pupil - animated via ref */}
        <circle
          ref={rightPupilRef}
          cx="42"
          cy="30"
          r="4"
          className="fill-gray-900"
        />

        {/* Left eye highlight */}
        <circle cx="20" cy="28" r="1.5" className="fill-white" />

        {/* Right eye highlight */}
        <circle cx="40" cy="28" r="1.5" className="fill-white" />

        {/* Confused/raised eyebrows */}
        <path
          d="M16 24 L28 22"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M48 24 L36 22"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Confused "o" mouth */}
        <ellipse cx="32" cy="46" rx="5" ry="4" className="fill-white" />

        {/* Question mark floating */}
        <text
          x="52"
          y="18"
          className="fill-white"
          fontSize="14"
          fontWeight="bold"
        >
          ?
        </text>
      </svg>
    </div>
  )
}
