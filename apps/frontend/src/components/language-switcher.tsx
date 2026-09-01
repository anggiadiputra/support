"use client"

import { IconCheck, IconLanguage } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { locales, localeNames, localeFlags, type Locale } from "@/i18n/config"
import { useLocalePreference } from "@/hooks/use-locale-preference"

interface LanguageSwitcherProps {
  className?: string
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { locale, setLocale } = useLocalePreference()

  const handleLocaleChange = (newLocale: Locale) => {
    setLocale(newLocale)
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("scale-95 rounded-full", className)}
          aria-label="Select language"
        >
          <span className="text-base" role="img" aria-label={localeNames[locale]}>
            {localeFlags[locale]}
          </span>
          <span className="sr-only">
            <IconLanguage className="size-[1.2rem]" />
            Select language
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => handleLocaleChange(loc)}
            className="cursor-pointer"
          >
            <span className="mr-2" role="img" aria-label={localeNames[loc]}>
              {localeFlags[loc]}
            </span>
            {localeNames[loc]}
            <IconCheck
              size={14}
              className={cn("ml-auto", locale !== loc && "hidden")}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
