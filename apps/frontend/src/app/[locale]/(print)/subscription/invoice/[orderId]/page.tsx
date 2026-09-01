'use client'

/**
 * Invoice Page
 * Displays printable invoice for completed payment transactions
 * Opens in new window without sidebar/bottom nav
 */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Printer, X, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

interface InvoiceData {
  orderId: string
  invoiceNumber: string
  amount: number
  discountAmount: number | null
  prorateCredit: number | null
  creditUsed: number | null
  paymentMethod: string
  targetTier: string
  transactionType: 'SUBSCRIPTION' | 'TOP_UP'
  durationDays: number
  status: string
  createdAt: string
  paidAt: string | null
  user: {
    name: string
    email: string
  }
  issuer: {
    name: string
    email: string
    website: string
  }
}

// Format date to Indonesian locale
function formatDate(dateString: string | null): string {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Format price to IDR
function formatPrice(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// Get duration label from days
function getDurationLabel(days: number): string {
  const daysToLabel: Record<number, string> = {
    30: '1 Bulan',
    90: '3 Bulan',
    180: '6 Bulan',
    365: '1 Tahun',
  }
  return daysToLabel[days] || `${days} Hari`
}

// Payment method labels
const paymentMethodLabels: Record<string, string> = {
  QRIS: 'QRIS',
  SHOPEEPAY: 'ShopeePay',
  VA_BCA: 'Virtual Account BCA',
  VA_BNI: 'Virtual Account BNI',
  VA_MANDIRI: 'Virtual Account Mandiri',
  VA_PERMATA: 'Virtual Account Permata',
}

export default function InvoicePage() {
  const params = useParams()
  const orderId = params.orderId as string

  const [invoice, setInvoice] = useState<InvoiceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const response = await fetch(`${API_URL}/api/v1/payment/invoice/${orderId}`, {
          method: 'GET',
          credentials: 'include',
        })

        const result = await response.json()

        if (result.success && result.data) {
          setInvoice(result.data)
        } else {
          setError(result.error?.message || 'Invoice tidak ditemukan')
        }
      } catch (err) {
        console.error('Failed to fetch invoice:', err)
        setError('Gagal memuat invoice')
      } finally {
        setLoading(false)
      }
    }

    if (orderId) {
      fetchInvoice()
    }
  }, [orderId])

  const handlePrint = () => {
    window.print()
  }

  const handleClose = () => {
    window.close()
  }

  // Calculate original amount before discounts
  const getOriginalAmount = (): number => {
    if (!invoice) return 0
    let original = invoice.amount
    if (invoice.discountAmount) original += invoice.discountAmount
    if (invoice.prorateCredit) original += invoice.prorateCredit
    return original
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-lg font-medium">Memuat invoice...</p>
        </div>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error || 'Invoice tidak ditemukan'}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={handleClose} className="mt-4">
          <X className="h-4 w-4 mr-2" />
          Tutup
        </Button>
      </div>
    )
  }

  const originalAmount = getOriginalAmount()
  const hasDiscount = (invoice.discountAmount && invoice.discountAmount > 0) || 
                      (invoice.prorateCredit && invoice.prorateCredit > 0)

  return (
    <>
      {/* Print Controls - Hidden when printing */}
      <div className="bg-white border-b p-4 print:hidden sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold">Invoice {invoice.invoiceNumber}</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleClose}>
              <X className="h-4 w-4 mr-1" />
              Tutup
            </Button>
            <Button size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" />
              Cetak
            </Button>
          </div>
        </div>
      </div>

      {/* Invoice Content */}
      <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 print:p-0 print:max-w-none">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 print:border-none print:shadow-none print:rounded-none">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{invoice.issuer.name}</h1>
              <p className="text-gray-600 mt-1">{invoice.issuer.email}</p>
              {invoice.issuer.website && (
                <p className="text-gray-600">{invoice.issuer.website}</p>
              )}
            </div>
            <div className="text-right">
              <h2 className="text-2xl font-bold text-gray-900">INVOICE</h2>
              <p className="text-gray-600 mt-1">{invoice.invoiceNumber}</p>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Ditagihkan Kepada</h3>
              <p className="text-gray-900 font-medium">{invoice.user.name}</p>
              <p className="text-gray-600">{invoice.user.email}</p>
            </div>
            <div className="text-right">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Tanggal Invoice</h3>
                <p className="text-gray-900">{formatDate(invoice.createdAt)}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Tanggal Bayar</h3>
                <p className="text-gray-900">{formatDate(invoice.paidAt)}</p>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-8">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 text-sm font-semibold text-gray-500 uppercase">Deskripsi</th>
                  <th className="text-right py-3 text-sm font-semibold text-gray-500 uppercase">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-4">
                    {invoice.transactionType === 'TOP_UP' ? (
                      <>
                        <p className="text-gray-900 font-medium">
                          Top Up Credit {invoice.issuer.name}
                        </p>
                        <p className="text-gray-500 text-sm">
                          Metode Pembayaran: {paymentMethodLabels[invoice.paymentMethod] || invoice.paymentMethod}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-gray-900 font-medium">
                          Langganan {invoice.issuer.name} {invoice.targetTier}
                        </p>
                        <p className="text-gray-500 text-sm">
                          Durasi: {getDurationLabel(invoice.durationDays)}
                        </p>
                        <p className="text-gray-500 text-sm">
                          Metode Pembayaran: {paymentMethodLabels[invoice.paymentMethod] || invoice.paymentMethod}
                        </p>
                      </>
                    )}
                  </td>
                  <td className="py-4 text-right text-gray-900">
                    {formatPrice(originalAmount)}
                  </td>
                </tr>

                {/* Discount Row */}
                {invoice.discountAmount && invoice.discountAmount > 0 && (
                  <tr className="border-b border-gray-100">
                    <td className="py-4 text-gray-600">
                      Diskon
                    </td>
                    <td className="py-4 text-right text-green-600">
                      -{formatPrice(invoice.discountAmount)}
                    </td>
                  </tr>
                )}

                {/* Prorate Credit Row */}
                {invoice.prorateCredit && invoice.prorateCredit > 0 && (
                  <tr className="border-b border-gray-100">
                    <td className="py-4 text-gray-600">
                      Kredit Prorate (Sisa Langganan Sebelumnya)
                    </td>
                    <td className="py-4 text-right text-green-600">
                      -{formatPrice(invoice.prorateCredit)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="flex justify-end mb-8">
            <div className="w-64">
              {hasDiscount && (
                <div className="flex justify-between py-2 text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatPrice(originalAmount)}</span>
                </div>
              )}
              <div className="flex justify-between py-3 border-t border-gray-200 text-lg font-bold">
                <span>Total Dibayar</span>
                <span className="text-gray-900">{formatPrice(invoice.amount)}</span>
              </div>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-green-100 text-green-800 font-semibold print:bg-green-100">
              LUNAS
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 pt-8 text-center text-gray-500 text-sm">
            <p>
              {invoice.transactionType === 'TOP_UP' 
                ? `Terima kasih telah melakukan top up di ${invoice.issuer.name}!`
                : `Terima kasih telah berlangganan ${invoice.issuer.name}!`
              }
            </p>
            <p className="mt-1">
              Invoice ini dihasilkan secara otomatis dan sah tanpa tanda tangan.
            </p>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style>
        {`
          @media print {
            body {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              background: white !important;
            }
            
            .print\\:hidden {
              display: none !important;
            }
            
            .print\\:p-0 {
              padding: 0 !important;
            }
            
            .print\\:max-w-none {
              max-width: none !important;
            }
            
            .print\\:border-none {
              border: none !important;
            }
            
            .print\\:shadow-none {
              box-shadow: none !important;
            }
            
            .print\\:rounded-none {
              border-radius: 0 !important;
            }
            
            .print\\:bg-green-100 {
              background-color: rgb(220 252 231) !important;
            }
          }
        `}
      </style>
    </>
  )
}
