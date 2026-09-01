/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_APP_URL?: string
  readonly VITE_APP_NAME?: string
  readonly VITE_API_KEY_PREFIX?: string
  readonly NEXT_PUBLIC_API_URL?: string
  readonly NEXT_PUBLIC_APP_URL?: string
  readonly NEXT_PUBLIC_APP_NAME?: string
  readonly NEXT_PUBLIC_API_KEY_PREFIX?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
  readonly dirname?: string
}
