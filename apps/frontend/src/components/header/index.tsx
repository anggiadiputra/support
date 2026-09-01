"use client";
import { useScroll } from "@/hooks/use-scroll";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MobileNav } from "./mobile-nav";
import { useBranding } from "@/hooks/use-branding";

export const links = [
	{ href: "/", label: "Home" },
	{ href: "#features", label: "Features" },
	{ href: "#pricing", label: "Pricing" },
];

export function Header() {
	const scrolled = useScroll(10);
	const { websiteName } = useBranding();

	return (
		<header
			className={cn(
				"sticky top-0 z-50 mx-auto flex h-14 w-full max-w-7xl items-center justify-between border-b bg-background/95 px-4 backdrop-blur-sm transition-[max-width] duration-300 ease-out supports-backdrop-filter:bg-background/50 md:top-2 md:h-12 md:rounded-full md:border md:px-10 md:shadow-sm",
				scrolled && "max-w-6xl"
			)}
		>
			<a
				className="flex h-10 cursor-pointer items-center justify-center rounded-full border px-4 shadow-xs hover:bg-accent"
				href="/"
			>
				<Logo className="h-4" />
				<span className="ml-2 font-semibold">{websiteName}</span>
				<span className="sr-only">{websiteName}</span>
			</a>

			<nav className="hidden md:flex items-center gap-1">
				{links.map((link) => (
					<a
						key={link.label}
						href={link.href}
						className="rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
					>
						{link.label}
					</a>
				))}
			</nav>

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
