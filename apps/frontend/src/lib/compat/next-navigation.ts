import {
  useNavigate,
  useLocation,
  useSearchParams as useRouterSearchParams,
  useParams as useRouterParams,
} from "react-router-dom"

export interface NavigateOptions {
  scroll?: boolean
  locale?: string
}

export function useRouter() {
  const navigate = useNavigate()

  return {
    push: (href: string, _options?: NavigateOptions) => navigate(href),
    replace: (href: string, _options?: NavigateOptions) => navigate(href, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    refresh: () => {
      window.location.reload()
    },
    prefetch: (_href?: string, _options?: unknown) => {},
  }
}

export function usePathname(): string {
  const location = useLocation()
  return location.pathname
}

export function useSearchParams(): URLSearchParams {
  const [searchParams] = useRouterSearchParams()
  return searchParams
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
  const params = useRouterParams()
  return params as T
}

export function redirect(url: string): never {
  window.location.href = url
  throw new Error(`Redirecting to ${url}`)
}

export function notFound(): never {
  throw new Error("Page not found")
}
