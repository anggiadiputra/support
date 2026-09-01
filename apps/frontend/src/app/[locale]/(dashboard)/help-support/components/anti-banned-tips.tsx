import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ShieldAlert, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react"

export function AntiBannedTips() {
  return (
    <div className="space-y-6">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Disclaimer Penting!</AlertTitle>
        <AlertDescription>
          Tidak ada jaminan 100% "anti-banned". Semua keputusan suspend atau banned akun sepenuhnya berada di tangan Meta/WhatsApp. 
          Panduan ini hanya berisi best practices untuk meminimalkan risiko pelanggaran policy Meta.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Panduan Mematuhi Policy WhatsApp Business
          </CardTitle>
          <CardDescription>
            Best practices untuk mengikuti aturan Meta dan meminimalkan risiko pelanggaran
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="violations">
              <AccordionTrigger className="text-left">
                Penyebab Utama Account Banned
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                <div className="flex gap-2">
                  <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Spam dan Pesan Massal Berlebihan</p>
                    <p className="text-sm text-muted-foreground">Mengirim pesan broadcast dalam jumlah besar ke kontak yang tidak opt-in atau mengirim pesan yang sama berulang kali.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">High Block & Report Rate</p>
                    <p className="text-sm text-muted-foreground">Banyak user yang memblokir atau melaporkan nomor Anda sebagai spam.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Konten yang Melanggar Policy</p>
                    <p className="text-sm text-muted-foreground">Mengirim konten ilegal, pornografi, kekerasan, atau menjual barang terlarang.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Menggunakan Nomor Pribadi untuk Bisnis</p>
                    <p className="text-sm text-muted-foreground">Nomor yang sudah terdaftar di WhatsApp personal tidak boleh digunakan untuk WABA.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Automated Bot yang Tidak Natural</p>
                    <p className="text-sm text-muted-foreground">Bot yang terlalu robotik atau tidak memberikan value kepada user.</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="consent">
              <AccordionTrigger className="text-left">
                Pentingnya Opt-In dan Consent Management
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                <Alert>
                  <AlertDescription className="text-sm">
                    <strong>Aturan Emas:</strong> Jangan pernah mengirim pesan marketing ke nomor yang belum memberikan izin (opt-in) secara eksplisit.
                  </AlertDescription>
                </Alert>
                <div className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Cara Mendapatkan Opt-In yang Benar</p>
                    <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1 mt-1">
                      <li>Form registrasi dengan checkbox "Saya setuju menerima info via WhatsApp"</li>
                      <li>Landing page dengan tombol "Chat WhatsApp" yang clear</li>
                      <li>QR Code di toko fisik dengan label jelas</li>
                      <li>Website widget chat yang user inisiasi sendiri</li>
                    </ul>
                  </div>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Dokumentasikan Opt-In</p>
                    <p className="text-sm text-muted-foreground">Simpan bukti consent di database (platform ini sudah menyediakan fitur ConsentLog untuk ini).</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Berikan Opt-Out Option</p>
                    <p className="text-sm text-muted-foreground">Setiap pesan marketing harus menyertakan cara untuk berhenti berlangganan, misalnya: "Balas STOP untuk berhenti menerima promo".</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="quality-rating">
              <AccordionTrigger className="text-left">
                Menjaga Quality Rating Tetap Hijau
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                <div className="bg-muted p-4 rounded-md space-y-2">
                  <p className="font-medium text-sm">Status Quality Rating:</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>🟢 <strong>GREEN (Connected):</strong> Aman, tidak ada masalah</li>
                    <li>🟡 <strong>YELLOW (Flagged):</strong> Warning, kurangi aktivitas marketing</li>
                    <li>🔴 <strong>RED (Restricted):</strong> Berbahaya, risiko banned tinggi</li>
                  </ul>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Monitor Rating Setiap Hari</p>
                    <p className="text-sm text-muted-foreground">Cek halaman Quality di dashboard untuk memantau status real-time.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Jika Status YELLOW</p>
                    <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1 mt-1">
                      <li>Stop semua campaign marketing selama 3-7 hari</li>
                      <li>Fokus hanya pada customer support dan transactional messages</li>
                      <li>Review template yang sering direject</li>
                      <li>Analisa apakah ada pesan yang banyak diblokir</li>
                    </ul>
                  </div>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Jika Status RED</p>
                    <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1 mt-1">
                      <li>HENTIKAN SEMUA aktivitas pengiriman pesan</li>
                      <li>Hubungi tim support untuk assistance</li>
                      <li>Review seluruh campaign dan konten pesan</li>
                      <li>Siapkan rencana perbaikan sebelum melanjutkan</li>
                    </ul>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="best-practices">
              <AccordionTrigger className="text-left">
                Best Practices untuk Keamanan Akun
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                <div className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Gunakan Warming Up untuk Nomor Baru</p>
                    <p className="text-sm text-muted-foreground">
                      Minggu 1: Max 50 pesan/hari | Minggu 2: Max 100 pesan/hari | Minggu 3: Max 200 pesan/hari | Minggu 4+: Scale up bertahap
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Batasi Broadcast Marketing</p>
                    <p className="text-sm text-muted-foreground">Maksimal 1-2 campaign per minggu. Jangan kirim pesan promo setiap hari.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Prioritaskan Customer Support</p>
                    <p className="text-sm text-muted-foreground">Fokus pada membalas customer dengan cepat dan helpful. Support messages tidak dihitung sebagai spam.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Segmentasi Audience</p>
                    <p className="text-sm text-muted-foreground">Kirim pesan yang relevan ke audience yang tepat. Jangan blast ke semua kontak.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Manfaatkan AI Auto-Reply</p>
                    <p className="text-sm text-muted-foreground">AI dapat membantu response time tanpa meningkatkan risiko spam karena sifatnya reaktif (membalas, bukan inisiasi).</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Jangan Beli Database Kontak</p>
                    <p className="text-sm text-muted-foreground">Hanya gunakan kontak yang organik dari bisnis Anda sendiri.</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="recovery">
              <AccordionTrigger className="text-left">
                Apa yang Harus Dilakukan Jika Kena Banned
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                <Alert>
                  <AlertDescription className="text-sm">
                    WhatsApp Business API banned biasanya bersifat <strong>permanent</strong>. Pencegahan jauh lebih baik daripada mencoba recovery.
                  </AlertDescription>
                </Alert>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div>
                    <p className="font-medium text-foreground">1. Hubungi Meta Support</p>
                    <p>Submit appeal melalui Business Manager → Support. Jelaskan situasi dan langkah perbaikan yang akan Anda lakukan.</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">2. Review Seluruh Campaign</p>
                    <p>Identifikasi campaign atau template yang mungkin melanggar policy. Hapus atau revisi sebelum mengajukan appeal.</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">3. Dokumentasikan Opt-In</p>
                    <p>Siapkan bukti bahwa kontak Anda sudah memberikan consent untuk dihubungi.</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">4. Backup Plan</p>
                    <p>Jika appeal ditolak, Anda mungkin perlu menggunakan nomor WhatsApp baru dengan Business Account yang berbeda.</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">5. Konsultasi dengan Tim Support</p>
                    <p>Tim kami dapat membantu menganalisa masalah dan memberikan guidance untuk recovery atau setup akun baru dengan benar.</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Catatan Penting</AlertTitle>
            <AlertDescription className="text-sm">
              WhatsApp Business API adalah tools untuk berkomunikasi dengan customer secara profesional, bukan untuk spam marketing. 
              Prioritaskan memberikan value dan pengalaman positif kepada user. Meta memiliki sistem otomatis dan manual untuk memonitor pelanggaran policy.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
