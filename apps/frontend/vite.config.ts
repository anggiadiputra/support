import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

const rootDir = import.meta.dirname || process.cwd()

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, rootDir, ""),
    ...loadEnv(mode, process.cwd(), ""),
    ...process.env,
  }

  const defaultApiUrl = mode === "production" ? "https://api.whoops.web.id" : "http://localhost:3005"
  const defaultAppUrl = mode === "production" ? "https://app.whoops.web.id" : "http://localhost:3000"

  const apiUrl = env.VITE_API_URL || env.NEXT_PUBLIC_API_URL || defaultApiUrl
  const appUrl = env.VITE_APP_URL || env.NEXT_PUBLIC_APP_URL || defaultAppUrl

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    define: {
      "process.env.NODE_ENV": JSON.stringify(mode),
      "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(apiUrl),
      "process.env.NEXT_PUBLIC_APP_URL": JSON.stringify(appUrl),
      "process.env.NEXT_PUBLIC_APP_NAME": JSON.stringify(
        env.VITE_APP_NAME || env.NEXT_PUBLIC_APP_NAME || "Whoops"
      ),
      "process.env.NEXT_PUBLIC_API_KEY_PREFIX": JSON.stringify(
        env.VITE_API_KEY_PREFIX || env.NEXT_PUBLIC_API_KEY_PREFIX || "kc"
      ),
    },
    resolve: {
      alias: {
        "@": path.resolve(rootDir, "./src"),
        "next/link": path.resolve(rootDir, "./src/lib/compat/next-link.tsx"),
        "next/navigation": path.resolve(rootDir, "./src/lib/compat/next-navigation.ts"),
        "next/image": path.resolve(rootDir, "./src/lib/compat/next-image.tsx"),
        "next/headers": path.resolve(rootDir, "./src/lib/compat/next-headers.ts"),
        "next/font/google": path.resolve(rootDir, "./src/lib/compat/next-font.ts"),
        "next/font": path.resolve(rootDir, "./src/lib/compat/next-font.ts"),
        "next-intl/server": path.resolve(rootDir, "./src/lib/compat/next-intl.tsx"),
        "next-intl": path.resolve(rootDir, "./src/lib/compat/next-intl.tsx"),
      },
    },
    server: {
      port: 3000,
      host: true,
    },
    preview: {
      port: 3000,
      host: true,
    },
    build: {
      outDir: "dist",
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
    },
  }
})
