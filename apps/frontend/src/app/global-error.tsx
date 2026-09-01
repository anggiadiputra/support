'use client'

// Root global error page - outside locale context, uses English fallback
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <div className="h-svh w-full flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">Application Error</h1>
            <p className="text-gray-500 mb-6">
              The application encountered a problem. Please reload the page.
            </p>
            <button
              onClick={reset}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
