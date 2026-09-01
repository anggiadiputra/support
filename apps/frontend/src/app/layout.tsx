import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || "Messaging Platform",
  description: `${process.env.NEXT_PUBLIC_APP_NAME || "Messaging Platform"} - kelola whatsapp dan instagram mudah`,
  icons: {
    icon: "/favicon.svg",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} group/body antialiased`}>{children}</body>
    </html>
  )
}
