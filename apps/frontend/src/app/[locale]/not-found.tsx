"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft, Home } from "lucide-react"

import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { NotFoundMascot } from "@/components/mascot"

export default function NotFound() {
  const router = useRouter()

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-4">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        {/* Mascot */}
        <NotFoundMascot size={140} className="mb-4" />

        {/* Error Code */}
        <h1 className="text-7xl font-bold tracking-tighter text-foreground">
          404
        </h1>

        {/* Title */}
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Halaman Tidak Ditemukan
        </h2>

        {/* Description */}
        <p className="mt-2 text-muted-foreground">
          Maaf, halaman yang Anda cari tidak ada atau telah dipindahkan.
        </p>

        {/* Actions */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Kembali
          </Button>
          <Button asChild>
            <Link href="/">
              <Home className="h-4 w-4" />
              Ke Beranda
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
