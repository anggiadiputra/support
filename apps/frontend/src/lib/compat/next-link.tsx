import * as React from "react"
import { Link as RouterLink, LinkProps as RouterLinkProps } from "react-router-dom"

export interface LinkProps extends Omit<RouterLinkProps, "to"> {
  href: string | { pathname?: string; query?: Record<string, string> }
  prefetch?: boolean
  replace?: boolean
  scroll?: boolean
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ href, replace, ...props }, ref) => {
    let to = "/"
    if (typeof href === "string") {
      to = href
    } else if (href && typeof href === "object") {
      to = href.pathname || "/"
      if (href.query) {
        const search = new URLSearchParams(href.query).toString()
        if (search) to += `?${search}`
      }
    }

    return (
      <RouterLink
        to={to}
        replace={replace}
        ref={ref}
        {...props}
      />
    )
  }
)

Link.displayName = "NextLinkCompat"
export default Link
