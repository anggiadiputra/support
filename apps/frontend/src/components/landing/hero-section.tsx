"use client"

import { Button } from "@/components/ui/button"
import { IconBrandWhatsapp, IconRocket } from "@tabler/icons-react"
import Link from "next/link"

export function HeroSection() {
  return (
    <section className="container mx-auto px-4 py-20 md:py-32">
      <div className="mx-auto max-w-4xl text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted px-4 py-2 text-sm">
          <IconBrandWhatsapp className="h-4 w-4 text-green-600" />
          <span>WhatsApp Business API Platform</span>
        </div>
        
        {/* Heading */}
        <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
          Kirim Pesan WhatsApp
          <br />
          <span className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
            Lebih Mudah & Cepat
          </span>
        </h1>
        
        {/* Description */}
        <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground md:text-xl">
          Platform WhatsApp Business API terlengkap untuk mengelola komunikasi bisnis Anda. 
          Kirim pesan, kelola kontak, dan tingkatkan engagement pelanggan.
        </p>
        
        {/* CTA Buttons */}
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button asChild size="lg" className="rounded-full px-8">
            <Link href="/register">
              Mulai Gratis
              <IconRocket className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full px-8">
            <Link href="/login">
              Login
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
