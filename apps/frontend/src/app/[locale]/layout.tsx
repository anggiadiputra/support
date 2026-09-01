import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { locales, defaultLocale, Locale } from '@/i18n/config';
import { Providers } from '../providers';
import { Toaster } from '@/components/ui/toaster';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// Generate hreflang alternate links for SEO
function generateHreflangLinks(currentPath: string, baseUrl: string) {
  return locales.map((loc) => {
    const href = `${baseUrl}/${loc}${currentPath}`;
    return { locale: loc, href };
  });
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  // Validate locale - check if it's a valid locale
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  // Get messages for the locale
  const messages = await getMessages();

  // Get base URL from environment or default
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://yourdomain.com';
  
  // Get current path without locale prefix for hreflang generation
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || '';
  // Remove locale prefix from pathname to get the base path
  const pathWithoutLocale = pathname.replace(new RegExp(`^/${locale}`), '') || '';
  
  // Generate hreflang links
  const hreflangLinks = generateHreflangLinks(pathWithoutLocale, baseUrl);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.lang = "${locale}";`,
        }}
      />
      {/* Hreflang tags for SEO - alternate language versions */}
      {hreflangLinks.map(({ locale: loc, href }) => (
        <link
          key={loc}
          rel="alternate"
          hrefLang={loc}
          href={href}
        />
      ))}
      {/* x-default hreflang for language selection page */}
      <link
        rel="alternate"
        hrefLang="x-default"
        href={`${baseUrl}/${defaultLocale}${pathWithoutLocale}`}
      />
      <NextIntlClientProvider messages={messages}>
        <Providers>{children}</Providers>
        <Toaster />
      </NextIntlClientProvider>
    </>
  );
}
