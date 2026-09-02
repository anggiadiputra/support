import '@testing-library/jest-dom/vitest'

if (typeof window !== 'undefined') {
  const storage: Record<string, string> = {}
  const localStorageMock: Storage = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => {
      storage[key] = String(value)
    },
    removeItem: (key: string) => {
      delete storage[key]
    },
    clear: () => {
      for (const key of Object.keys(storage)) {
        delete storage[key]
      }
    },
    key: (index: number) => Object.keys(storage)[index] ?? null,
    get length() {
      return Object.keys(storage).length
    },
  }

  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  })
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
  })
}
