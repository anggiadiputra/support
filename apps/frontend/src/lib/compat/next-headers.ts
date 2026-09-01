import Cookies from "js-cookie"

export function cookies() {
  return {
    get: (name: string) => {
      const val = Cookies.get(name)
      return val !== undefined ? { name, value: val } : undefined
    },
    set: (name: string, value: string, options?: Cookies.CookieAttributes) => {
      Cookies.set(name, value, options)
    },
    delete: (name: string) => {
      Cookies.remove(name)
    },
    getAll: () => {
      return Object.entries(Cookies.get()).map(([name, value]) => ({ name, value }))
    },
  }
}

export function headers() {
  return new Headers()
}
