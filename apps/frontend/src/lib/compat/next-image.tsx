import * as React from "react"
import { cn } from "@/lib/utils"

export interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string
  alt: string
  width?: number | string
  height?: number | string
  fill?: boolean
  priority?: boolean
  quality?: number
  unoptimized?: boolean
}

export const Image = React.forwardRef<HTMLImageElement, ImageProps>(
  ({ src, alt, width, height, fill, priority, className, style, ...props }, ref) => {
    return (
      <img
        ref={ref}
        src={src}
        alt={alt || ""}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        loading={priority ? "eager" : "lazy"}
        className={cn(
          fill && "absolute inset-0 h-full w-full object-cover",
          className
        )}
        style={style}
        {...props}
      />
    )
  }
)

Image.displayName = "NextImageCompat"
export default Image
