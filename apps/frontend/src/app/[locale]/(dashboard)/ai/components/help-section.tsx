"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Copy, Check, FileText, Sparkles } from "lucide-react"

const examplePrompts = [
  {
    title: "Customer Support (Natural)",
    description: "AI menjawab natural, knowledge base sebagai referensi tambahan",
    badge: "Recommended",
    badgeVariant: "default" as const,
    prompt: `Kamu adalah asisten customer support yang ramah dan helpful untuk [Nama Perusahaan].

Jawab pertanyaan pelanggan dengan natural dan informatif. Kamu boleh menggunakan pengetahuan umum untuk memberikan jawaban yang lengkap dan membantu.

Jika ada informasi spesifik tentang produk/layanan kami di Knowledge Base, gunakan itu sebagai referensi utama. Tapi kamu tetap boleh menambahkan penjelasan umum agar jawaban lebih lengkap.

Bersikaplah ramah, sopan, dan selalu berusaha membantu pelanggan.`,
  },
  {
    title: "Strict Knowledge Base Only",
    description: "AI hanya menjawab berdasarkan knowledge base saja",
    badge: "Strict",
    badgeVariant: "secondary" as const,
    prompt: `Kamu adalah asisten yang HANYA menjawab berdasarkan informasi di Knowledge Base.

Aturan ketat:
- Jawab HANYA menggunakan informasi dari Knowledge Base
- Jika informasi tidak ada, katakan: "Maaf, saya tidak memiliki informasi tersebut."
- JANGAN mengarang atau menggunakan pengetahuan luar
- Tetap ramah dan sopan`,
  },
  {
    title: "Sales & Produk",
    description: "Untuk menjelaskan produk dan closing penjualan",
    badge: "Sales",
    badgeVariant: "outline" as const,
    prompt: `Kamu adalah sales assistant untuk [Nama Perusahaan]. Bantu pelanggan memahami produk dan layanan kami.

Tugas:
- Jelaskan fitur dan manfaat produk dengan antusias
- Jawab pertanyaan tentang harga dan paket
- Bantu pelanggan memilih produk yang sesuai kebutuhan
- Arahkan untuk melakukan pemesanan jika sudah tertarik

Gunakan informasi produk dari Knowledge Base, tapi boleh menambahkan penjelasan agar lebih menarik. Bersikap profesional dan persuasif.`,
  },
  {
    title: "FAQ Assistant",
    description: "Menjawab pertanyaan umum dengan cepat",
    badge: "FAQ",
    badgeVariant: "outline" as const,
    prompt: `Kamu adalah asisten FAQ untuk [Nama Perusahaan].

Jawab pertanyaan dengan singkat, jelas, dan langsung ke poin. Gunakan informasi dari Knowledge Base sebagai sumber utama.

Jika pertanyaan tidak ada di FAQ, berikan jawaban umum yang helpful atau arahkan untuk menghubungi tim support.

Format jawaban: singkat dan mudah dipahami.`,
  },
  {
    title: "Friendly Chat (Bahasa Gaul)",
    description: "AI dengan gaya bahasa santai dan gaul",
    badge: "Casual",
    badgeVariant: "outline" as const,
    prompt: `Kamu adalah asisten yang friendly dan gaul untuk [Nama Perusahaan]. 

Gaya bahasa:
- Santai dan tidak kaku
- Boleh pakai bahasa gaul yang sopan
- Tetap informatif tapi fun
- Pakai emoji sesekali 😊

Jawab pertanyaan dengan helpful tapi tetap santai. Gunakan info dari Knowledge Base kalau ada, tapi deliver dengan cara yang fun dan engaging.`,
  },
  {
    title: "English Support",
    description: "For English-speaking customers",
    badge: "English",
    badgeVariant: "outline" as const,
    prompt: `You are a helpful customer support assistant for [Company Name].

Guidelines:
- Answer questions helpfully and professionally
- Use Knowledge Base information as your primary source
- You may add general explanations to make answers more complete
- If you don't know something specific, say so politely
- Be friendly and professional`,
  },
  {
    title: "Minimal / Simple",
    description: "Prompt paling sederhana",
    badge: "Simple",
    badgeVariant: "outline" as const,
    prompt: `Kamu adalah asisten helpful. Jawab pertanyaan dengan ramah dan informatif. Gunakan Knowledge Base sebagai referensi.`,
  },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="h-8 px-3"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 mr-1.5" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          Copy
        </>
      )}
    </Button>
  )
}

export function HelpSection() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Contoh System Prompt</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Pilih dan sesuaikan template prompt untuk AI Agent Anda. 
            Klik tombol Copy untuk menyalin ke clipboard.
          </p>
        </div>
      </div>

      {/* Prompt Cards */}
      <div className="grid gap-4">
        {examplePrompts.map((example, index) => (
          <Card key={index} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{example.title}</CardTitle>
                    <Badge variant={example.badgeVariant} className="text-xs">
                      {example.badge}
                    </Badge>
                  </div>
                  <CardDescription>{example.description}</CardDescription>
                </div>
                <CopyButton text={example.prompt} />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap border">
                {example.prompt}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tips Section */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Tips Membuat System Prompt
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="font-medium">✅ Yang Sebaiknya Ada:</p>
              <ul className="text-muted-foreground space-y-0.5 text-xs">
                <li>• Definisi peran/persona AI</li>
                <li>• Instruksi penggunaan Knowledge Base</li>
                <li>• Bahasa yang harus digunakan</li>
                <li>• Cara handle jika tidak tahu</li>
              </ul>
            </div>
            <div className="space-y-1">
              <p className="font-medium">❌ Yang Harus Dihindari:</p>
              <ul className="text-muted-foreground space-y-0.5 text-xs">
                <li>• Prompt terlalu panjang (&gt;500 kata)</li>
                <li>• Instruksi yang saling bertentangan</li>
                <li>• Terlalu banyak aturan ketat</li>
                <li>• Tidak menyebut Knowledge Base</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
