export { Link } from "@/lib/compat/next-link"
export { useRouter, usePathname, redirect } from "@/lib/compat/next-navigation"

export const routing = {
  locales: ["id", "en"],
  defaultLocale: "id",
}

export function getPathname({ href }: { href: string }) {
  return href
}
