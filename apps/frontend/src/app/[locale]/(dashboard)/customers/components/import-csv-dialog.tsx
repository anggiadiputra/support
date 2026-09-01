"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { IconDownload, IconUpload, IconFile, IconX, IconCheck, IconAlertTriangle } from "@tabler/icons-react"
import { useToast } from "@/hooks/use-toast"
import { useImportCustomers, type ImportCustomerInput } from "@/hooks/use-customers"

interface ImportCsvDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportCsvDialog({ open, onOpenChange }: ImportCsvDialogProps) {
  const { toast } = useToast()
  const importMutation = useImportCustomers()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportCustomerInput[]>([])
  const [parseError, setParseError] = useState<string | null>(null)

  const downloadTemplate = () => {
    const header = "phoneNumber,name,consentStatus,consentSource"
    const sample = [
      header,
      "6281234567890,John Doe,true,Import CSV",
      "628111222333,Jane Smith,false,",
    ].join("\n")

    const blob = new Blob([sample], { type: "text/csv;charset=utf-8;" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "customers_template.csv"
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  const parseCsv = (text: string): ImportCustomerInput[] => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (lines.length === 0) return []

    const headers = lines[0]
      .split(",")
      .map((h) => h.trim().toLowerCase())

    const findIdx = (keys: string[]) =>
      headers.findIndex((h) => keys.includes(h.toLowerCase()))

    const phoneIdx = findIdx(["phonenumber", "phone", "phone number", "phone_number"])
    const nameIdx = findIdx(["name", "full name", "nama"])
    const consentIdx = findIdx(["consentstatus", "consent", "consent status", "optin", "opt_in"])
    const consentSourceIdx = findIdx(["consentsource", "consent source", "source"])

    if (phoneIdx < 0) return []

    const rows = lines.slice(1)
    const customers: ImportCustomerInput[] = []

    for (const row of rows) {
      const cols = row.split(",")
      const phoneNumber = cols[phoneIdx]?.trim()
      if (!phoneNumber) continue

      const consentRaw = consentIdx >= 0 ? cols[consentIdx]?.trim().toLowerCase() : ""
      const consentStatus = ["yes", "true", "1", "y"].includes(consentRaw)

      customers.push({
        phoneNumber,
        name: nameIdx >= 0 ? cols[nameIdx]?.trim() : undefined,
        consentStatus,
        consentSource: consentSourceIdx >= 0 ? cols[consentSourceIdx]?.trim() : undefined,
      })
    }

    return customers
  }

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file)
    setParseError(null)

    try {
      const text = await file.text()
      const customers = parseCsv(text)

      if (customers.length === 0) {
        setParseError("Tidak ada data valid ditemukan. Pastikan kolom 'phoneNumber' ada di header.")
        setPreview([])
        return
      }

      setPreview(customers)
    } catch {
      setParseError("Gagal membaca file CSV.")
      setPreview([])
    }
  }

  const handleImport = () => {
    if (preview.length === 0) return

    importMutation.mutate(preview, {
      onSuccess: (data) => {
        toast({
          title: "Import berhasil",
          description: `${data.data?.success || preview.length} kontak berhasil diimport, ${data.data?.failed || 0} gagal.`,
        })
        handleClose()
      },
      onError: (error) => {
        console.error("Import customers error", error)
        toast({
          variant: "destructive",
          title: "Import gagal",
          description: "Tidak bisa mengimport kontak. Pastikan format CSV sudah benar.",
        })
      },
    })
  }

  const handleClose = () => {
    setSelectedFile(null)
    setPreview([])
    setParseError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
    onOpenChange(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && (file.type === "text/csv" || file.name.endsWith(".csv"))) {
      handleFileSelect(file)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Customers dari CSV</DialogTitle>
          <DialogDescription>
            Upload file CSV untuk menambahkan kontak secara massal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Download Template */}
          <div className="rounded-lg border border-dashed p-4">
            <div className="flex items-start gap-3">
              <IconDownload className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Download template CSV</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Gunakan template ini sebagai panduan format. Kolom yang tersedia:
                  <span className="font-mono"> phoneNumber</span>,
                  <span className="font-mono"> name</span>,
                  <span className="font-mono"> consentStatus</span>,
                  <span className="font-mono"> consentSource</span>
                </p>
                <Button variant="link" size="sm" className="h-auto p-0 mt-2" onClick={downloadTemplate}>
                  Download Template
                </Button>
              </div>
            </div>
          </div>

          {/* Upload Area */}
          <div
            className="rounded-lg border-2 border-dashed p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2">
                <IconFile className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">{selectedFile.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedFile(null)
                    setPreview([])
                    setParseError(null)
                    if (fileInputRef.current) fileInputRef.current.value = ""
                  }}
                >
                  <IconX className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <IconUpload className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">
                  Klik atau drag & drop file CSV di sini
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Format: .csv
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileSelect(file)
              }}
            />
          </div>

          {/* Parse Error */}
          {parseError && (
            <div className="rounded-lg bg-destructive/10 p-3 flex items-start gap-2">
              <IconAlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{parseError}</p>
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <IconCheck className="h-4 w-4 text-green-600" />
                <p className="text-sm font-medium">
                  {preview.length} kontak ditemukan
                </p>
              </div>
              <div className="max-h-40 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 pr-2 font-medium text-muted-foreground">No. Telepon</th>
                      <th className="text-left py-1 pr-2 font-medium text-muted-foreground">Nama</th>
                      <th className="text-left py-1 font-medium text-muted-foreground">Consent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 5).map((c, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1 pr-2 font-mono">{c.phoneNumber}</td>
                        <td className="py-1 pr-2">{c.name || "-"}</td>
                        <td className="py-1">{c.consentStatus ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 5 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    ...dan {preview.length - 5} kontak lainnya
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>
            Batal
          </Button>
          <Button
            size="sm"
            onClick={handleImport}
            disabled={preview.length === 0 || importMutation.isPending}
          >
            {importMutation.isPending ? "Mengimport..." : `Import ${preview.length > 0 ? preview.length : ""} Kontak`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
