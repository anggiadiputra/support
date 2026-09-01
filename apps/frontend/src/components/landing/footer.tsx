import { IconMessage } from "@tabler/icons-react"

export function Footer() {
  return (
    <footer className="bg-background border-t py-12">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
              <IconMessage className="size-6 text-primary" />
            </div>
            <span className="text-lg font-bold">{process.env.NEXT_PUBLIC_APP_NAME || "Messaging Platform"}</span>
          </div>

          <p className="text-center text-sm text-muted-foreground md:text-left">
            &copy; {new Date().getFullYear()} {process.env.NEXT_PUBLIC_APP_NAME || "Messaging Platform"}. All rights reserved.
          </p>

          <div className="flex gap-4 text-sm text-muted-foreground">
            <a href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </a>
            <a href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </a>
            <a href="/contact" className="hover:text-foreground transition-colors">
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
