"use client"

import {
  LogOut,
  Settings,
  User,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useQueryClient } from "@tanstack/react-query"
import { Link, useRouter } from "@/i18n/routing"
import { authClient } from "@/lib/auth-client"
import { clearAllCacheOnLogout } from "@/lib/cache-utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { useBusinessAccount } from "@/hooks/use-business-account"

interface Props {
  user: {
    name: string
    email: string
    avatar: string
  }
}

export function NavUser({ user }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const { userRole } = useBusinessAccount()
  const queryClient = useQueryClient()
  const t = useTranslations("auth")
  const tNav = useTranslations("navigation")

  const isAgent = userRole === "AGENT"

  const handleLogout = async () => {
    try {
      // Clear all cached data before logout to prevent data leakage
      clearAllCacheOnLogout(queryClient)
      
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            router.push("/login")
          }
        }
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("logoutError"),
        description: t("logoutErrorDesc"),
      })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback>KC</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56"
        align="end"
        forceMount
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {isAgent ? (
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <User className="mr-2 h-4 w-4" />
                <span>{tNav("profile")}</span>
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="mr-2 h-4 w-4" />
                <span>{tNav("settings")}</span>
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          <span>{t("logout")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
