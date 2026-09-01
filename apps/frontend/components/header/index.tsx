"use client";
import { useScroll } from "@/hooks/use-scroll";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
	NavigationMenu,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import { MobileNav } from "@/components/header/mobile-nav";

export const links = [
	{ href: "/", label: "Home" },
	{ href: "#features", label: "Features" },
	{ href: "#pricing", label: "Pricing" },
	{ href: "/login", label: "Login" },
];

export function Header() {
	const scrolled = useScroll(10);

	return (
		<header
			className={cn(
				"sticky top-0 z-50 mx-auto flex h-14 w-full max-w-4xl items-center justify-between border-b bg-background/95 px-4 backdrop-blur-sm transition-[max-width] duration-300 ease-out supports-backdrop-filter:bg-background/50 md:top-2 md:h-12 md:rounded-full md:border md:px-1 md:shadow-sm",
				scrolled && "max-w-3xl"
			)}
		>
			<a
				className="flex h-10 cursor-pointer items-center justify-center rounded-full border px-4 shadow-xs hover:bg-accent"
				href="/"
			>
				<Logo className="h-4" />
				<span className="ml-2 font-semibold">{process.env.NEXT_PUBLIC_APP_NAME || "Messaging Platform"}</span>
				<span className="sr-only">{process.env.NEXT_PUBLIC_APP_NAME || "Messaging Platform"}</span>
			</a>

			<NavigationMenu className="hidden md:block">
				<NavigationMenuList className="gap-0">
					{links.map((link) => (
						<NavigationMenuItem key={link.label}>
							<NavigationMenuLink asChild className="rounded-full px-4">
								<a href={link.href}>{link.label}</a>
							</NavigationMenuLink>
						</NavigationMenuItem>
					))}
				</NavigationMenuList>
			</NavigationMenu>
			<MobileNav />
			<a href="/login">
				<Button
					className="hidden rounded-full border md:flex dark:hover:bg-accent"
					size="lg"
					variant="ghost"
				>
					Login
				</Button>
			</a>
		</header>
	);
}
