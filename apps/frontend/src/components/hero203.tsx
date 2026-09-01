import { ChevronUp } from "lucide-react";
import React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

// SVG Component for Smart Automation background
const SmartAutomationSVG = () => (
  <svg viewBox="0 0 800 600" className="w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="autoHeroGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#1e3a8a", stopOpacity: 1 }} />
        <stop offset="50%" style={{ stopColor: "#3730a3", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#581c87", stopOpacity: 1 }} />
      </linearGradient>
      <linearGradient id="autoHeroGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style={{ stopColor: "#06b6d4", stopOpacity: 0.6 }} />
        <stop offset="100%" style={{ stopColor: "#3b82f6", stopOpacity: 0.6 }} />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="4" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    {/* Background */}
    <rect width="800" height="600" fill="url(#autoHeroGrad1)" />

    {/* Decorative circuit patterns */}
    <g opacity="0.3" stroke="#06b6d4" strokeWidth="2" fill="none">
      <path d="M 100 100 L 200 100 L 200 200 L 300 200" strokeDasharray="5,5" />
      <path d="M 500 150 L 600 150 L 600 250 L 700 250" strokeDasharray="5,5" />
      <path d="M 150 400 L 250 400 L 250 500" strokeDasharray="5,5" />
      <path d="M 550 350 L 650 350 L 650 450" strokeDasharray="5,5" />
    </g>

    {/* Gears representing automation */}
    <g opacity="0.4" fill="url(#autoHeroGrad2)">
      {/* Large gear */}
      <circle cx="200" cy="300" r="80" fill="none" stroke="#3b82f6" strokeWidth="12" />
      <circle cx="200" cy="300" r="50" fill="#1e3a8a" />
      {[...Array(8)].map((_, i) => {
        const angle = (i * 45 * Math.PI) / 180;
        const x = 200 + Math.cos(angle) * 70;
        const y = 300 + Math.sin(angle) * 70;
        return <circle key={i} cx={x} cy={y} r="15" fill="#3b82f6" />;
      })}

      {/* Medium gear */}
      <circle cx="600" cy="200" r="60" fill="none" stroke="#06b6d4" strokeWidth="10" />
      <circle cx="600" cy="200" r="35" fill="#1e3a8a" />
      {[...Array(6)].map((_, i) => {
        const angle = (i * 60 * Math.PI) / 180;
        const x = 600 + Math.cos(angle) * 52;
        const y = 200 + Math.sin(angle) * 52;
        return <circle key={`m${i}`} cx={x} cy={y} r="12" fill="#06b6d4" />;
      })}

      {/* Small gear */}
      <circle cx="650" cy="450" r="45" fill="none" stroke="#8b5cf6" strokeWidth="8" />
      <circle cx="650" cy="450" r="28" fill="#1e3a8a" />
      {[...Array(6)].map((_, i) => {
        const angle = (i * 60 * Math.PI) / 180;
        const x = 650 + Math.cos(angle) * 38;
        const y = 450 + Math.sin(angle) * 38;
        return <circle key={`s${i}`} cx={x} cy={y} r="10" fill="#8b5cf6" />;
      })}
    </g>

    {/* Chat bubbles representing automated messages */}
    <g opacity="0.5">
      <rect x="420" y="380" width="120" height="60" rx="12" fill="#3b82f6" filter="url(#glow)" />
      <circle cx="450" cy="410" r="4" fill="white" />
      <circle cx="470" cy="410" r="4" fill="white" />
      <circle cx="490" cy="410" r="4" fill="white" />

      <rect x="80" y="480" width="100" height="50" rx="10" fill="#06b6d4" filter="url(#glow)" />
      <circle cx="105" cy="505" r="3" fill="white" />
      <circle cx="120" cy="505" r="3" fill="white" />
      <circle cx="135" cy="505" r="3" fill="white" />
    </g>

    {/* Glowing particles */}
    <g fill="#06b6d4" opacity="0.6" filter="url(#glow)">
      <circle cx="350" cy="150" r="6" />
      <circle cx="450" cy="250" r="5" />
      <circle cx="280" cy="450" r="7" />
      <circle cx="550" cy="380" r="5" />
      <circle cx="150" cy="200" r="4" />
      <circle cx="700" cy="350" r="6" />
    </g>
  </svg>
);

// SVG Component for Multi-Agent Management background
const MultiAgentSVG = () => (
  <svg viewBox="0 0 800 600" className="w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="agentHeroGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#0f172a", stopOpacity: 1 }} />
        <stop offset="50%" style={{ stopColor: "#1e1b4b", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#4c1d95", stopOpacity: 1 }} />
      </linearGradient>
      <linearGradient id="agentHeroGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#f59e0b", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#ef4444", stopOpacity: 1 }} />
      </linearGradient>
      <linearGradient id="agentHeroGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#8b5cf6", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#ec4899", stopOpacity: 1 }} />
      </linearGradient>
      <filter id="agentGlow">
        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    {/* Background */}
    <rect width="800" height="600" fill="url(#agentHeroGrad1)" />

    {/* Grid pattern */}
    <g opacity="0.15" stroke="#8b5cf6" strokeWidth="1">
      {[...Array(9)].map((_, i) => (
        <line key={`v${i}`} x1={i * 100} y1="0" x2={i * 100} y2="600" />
      ))}
      {[...Array(7)].map((_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 100} x2="800" y2={i * 100} />
      ))}
    </g>

    {/* Central AI hub */}
    <g filter="url(#agentGlow)">
      <circle cx="400" cy="300" r="50" fill="url(#agentHeroGrad2)" opacity="0.8" />
      <circle cx="400" cy="300" r="35" fill="#1e1b4b" opacity="0.9" />
      <text x="400" y="310" textAnchor="middle" fill="white" fontSize="28" fontWeight="bold" opacity="0.9">AI</text>
    </g>

    {/* AI Agent nodes positioned around the hub */}
    <g opacity="0.7" filter="url(#agentGlow)">
      {/* Agent 1 - Top Left */}
      <circle cx="200" cy="150" r="35" fill="url(#agentHeroGrad3)" />
      <circle cx="200" cy="150" r="25" fill="#1e1b4b" opacity="0.8" />
      <text x="200" y="157" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold">A1</text>

      {/* Agent 2 - Top Right */}
      <circle cx="600" cy="150" r="35" fill="url(#agentHeroGrad3)" />
      <circle cx="600" cy="150" r="25" fill="#1e1b4b" opacity="0.8" />
      <text x="600" y="157" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold">A2</text>

      {/* Agent 3 - Bottom Left */}
      <circle cx="200" cy="450" r="35" fill="url(#agentHeroGrad3)" />
      <circle cx="200" cy="450" r="25" fill="#1e1b4b" opacity="0.8" />
      <text x="200" y="457" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold">A3</text>

      {/* Agent 4 - Bottom Right */}
      <circle cx="600" cy="450" r="35" fill="url(#agentHeroGrad3)" />
      <circle cx="600" cy="450" r="25" fill="#1e1b4b" opacity="0.8" />
      <text x="600" y="457" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold">A4</text>

      {/* Agent 5 - Left */}
      <circle cx="100" cy="300" r="30" fill="url(#agentHeroGrad3)" />
      <circle cx="100" cy="300" r="22" fill="#1e1b4b" opacity="0.8" />
      <text x="100" y="306" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">A5</text>

      {/* Agent 6 - Right */}
      <circle cx="700" cy="300" r="30" fill="url(#agentHeroGrad3)" />
      <circle cx="700" cy="300" r="22" fill="#1e1b4b" opacity="0.8" />
      <text x="700" y="306" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">A6</text>
    </g>

    {/* Connection lines between hub and agents */}
    <g stroke="#f59e0b" strokeWidth="2" opacity="0.3">
      <line x1="400" y1="300" x2="200" y2="150" />
      <line x1="400" y1="300" x2="600" y2="150" />
      <line x1="400" y1="300" x2="200" y2="450" />
      <line x1="400" y1="300" x2="600" y2="450" />
      <line x1="400" y1="300" x2="100" y2="300" />
      <line x1="400" y1="300" x2="700" y2="300" />
    </g>

    {/* Inter-agent connections */}
    <g stroke="#8b5cf6" strokeWidth="1.5" opacity="0.2" strokeDasharray="5,5">
      <line x1="200" y1="150" x2="600" y2="150" />
      <line x1="200" y1="450" x2="600" y2="450" />
      <line x1="200" y1="150" x2="200" y2="450" />
      <line x1="600" y1="150" x2="600" y2="450" />
    </g>

    {/* Data flow particles */}
    <g fill="#f59e0b" opacity="0.5">
      <circle cx="300" cy="225" r="5" />
      <circle cx="500" cy="225" r="5" />
      <circle cx="300" cy="375" r="5" />
      <circle cx="500" cy="375" r="5" />
      <circle cx="250" cy="300" r="4" />
      <circle cx="550" cy="300" r="4" />
    </g>

    {/* Glowing accent particles */}
    <g fill="#ec4899" opacity="0.4" filter="url(#agentGlow)">
      <circle cx="350" cy="180" r="6" />
      <circle cx="450" cy="180" r="5" />
      <circle cx="350" cy="420" r="6" />
      <circle cx="450" cy="420" r="5" />
      <circle cx="150" cy="250" r="4" />
      <circle cx="650" cy="350" r="5" />
    </g>
  </svg>
);

const Hero203 = () => {
  return (
    <section className="bg-background py-16 md:py-32">
      <div className="container relative mx-auto flex max-w-7xl flex-col items-center px-4">
        <div className="container flex w-full flex-col justify-between px-4 md:px-10 lg:flex-row">
          <div className="flex w-full flex-col gap-8">
            <a href="#" className="text-2xl font-semibold tracking-tighter">
              {process.env.NEXT_PUBLIC_APP_NAME || "Messaging Platform"}
            </a>
            <h1 className="bg-re relative z-20 text-4xl font-semibold tracking-tighter md:text-6xl lg:text-8xl">
              Kelola WhatsApp Mudah.
            </h1>
            <p className="text-muted-foreground max-w-2xl text-sm tracking-tight md:text-base lg:text-xl">
              Satu alat untuk semua kebutuhan WhatsApp Anda.
            </p>
          </div>
          <div className="md:mt-18 lg:w-5/9 mt-8 flex flex-col items-start lg:items-center">
            <Link href="/register">
              <Button className="text-background rounded-xl px-4 py-4 text-sm shadow-[0px_1px_3px_#0000001a,inset_0px_2px_0px_#ffffff40] md:rounded-2xl md:px-8 md:py-6 md:text-base lg:rounded-3xl lg:px-12 lg:py-8 lg:text-lg">
                <p className="text-background mr-1 text-base md:mr-2 md:text-xl lg:mr-3 lg:text-2xl">

                </p>{" "}
                Sign up for free
              </Button>
            </Link>
          </div>
        </div>
        <div className="mt-8 flex w-full flex-col justify-between gap-4 px-4 md:mt-10 md:flex-row md:gap-0 md:pr-10">
          <DottedDiv className="group h-auto w-full p-4 md:h-160 md:w-120">
            <div className="bg-muted/50 group-hover:bg-muted relative h-full w-full p-4 transition-all ease-in-out">
              {/* Bg SVG div */}
              <div className="relative h-full w-full overflow-hidden rounded-3xl">
                <SmartAutomationSVG />
                <div className="bg-linear-to-t absolute inset-0 from-black/70 to-transparent dark:from-black/80"></div>
              </div>
              <div className="absolute top-4 -ml-4 flex h-full w-full flex-col items-center justify-between p-4 md:p-10">
                <p className="text-white flex w-full items-center text-sm tracking-tighter md:text-xl">
                  Easy <span className="bg-white mx-2 h-2.5 w-[1px]" />
                  Integration
                </p>
                <div className="flex flex-col items-center justify-center">
                  <h2 className="text-white text-center text-3xl font-semibold tracking-tight md:text-6xl">
                    Smart <br />
                    Automation
                  </h2>
                  <div className="bg-white mt-2 h-1 w-6 rounded-full" />
                  <p className="text-white/90 mt-4 max-w-sm px-2 text-center text-sm font-light leading-5 tracking-tighter md:mt-10 md:text-lg">
                    Otomatisasi balasan chat 24 jam non-stop untuk meningkatkan kepuasan pelanggan Anda.
                  </p>
                </div>
                <a
                  href="#"
                  className="text-white group mb-6 flex cursor-pointer flex-col items-center justify-center"
                >
                  <ChevronUp
                    size={24}
                    className="text-white transition-all ease-in-out group-hover:-translate-y-2 md:size-[30px]"
                  />
                  <p className="text-white text-base tracking-tight md:text-xl">
                    Lihat Fitur
                  </p>
                </a>
              </div>
            </div>
          </DottedDiv>
          <DottedDiv className="group h-auto w-full p-4 md:h-160 md:w-120 lg:-mt-60">
            <div className="bg-muted/50 group-hover:bg-muted relative h-full w-full p-4 transition-all ease-in-out">
              {/* Bg SVG div */}
              <div className="relative h-full w-full overflow-hidden rounded-3xl">
                <MultiAgentSVG />
                <div className="bg-linear-to-t absolute inset-0 from-black/70 to-transparent dark:from-black/80"></div>
              </div>
              <div className="absolute top-4 -ml-4 flex h-full w-full flex-col items-center justify-between p-4 md:p-10">
                <p className="text-white flex w-full items-center text-sm tracking-tighter md:text-xl">
                  Message <span className="bg-white mx-2 h-2.5 w-[1px]" />
                  Templates
                </p>
                <div className="flex flex-col items-center justify-center">
                  <h2 className="text-white text-center text-3xl font-semibold tracking-tight md:text-6xl">
                    Multi-Agent <br />
                    Management
                  </h2>
                  <div className="bg-white mt-2 h-1 w-6 rounded-full" />
                  <p className="text-white/90 mt-4 max-w-sm px-2 text-center text-sm font-light leading-5 tracking-tighter md:mt-10 md:text-lg">
                    Buat dan kelola beberapa agen AI untuk berbagai macam tugas.
                  </p>
                </div>
                <a
                  href="#"
                  className="text-white group mb-6 flex cursor-pointer flex-col items-center justify-center"
                >
                  <ChevronUp
                    size={24}
                    className="text-white transition-all ease-in-out group-hover:-translate-y-2 md:size-[30px]"
                  />
                  <p className="text-white text-base tracking-tight md:text-xl">
                    Buat Agen AI
                  </p>
                </a>
              </div>
            </div>
          </DottedDiv>
        </div>
      </div>
    </section>
  );
};

export { Hero203 };

const DottedDiv = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("relative", className)}>
    <div className="-left-25 bg-muted dark:bg-muted/80 absolute top-4 h-[1.5px] w-[115%]" />
    <div className="-left-25 bg-muted dark:bg-muted/80 absolute bottom-4 h-[1.5px] w-[115%]" />
    <div className="-top-25 bg-muted dark:bg-muted/80 absolute left-4 h-[130%] w-[1.5px]" />
    <div className="-top-25 bg-muted dark:bg-muted/80 absolute right-4 h-[130%] w-[1.5px]" />
    <div className="bg-foreground absolute left-[12.5px] top-[12.5px] z-10 size-2 rounded-full" />
    <div className="bg-foreground absolute right-[12.5px] top-[12.5px] z-10 size-2 rounded-full" />
    <div className="bg-foreground absolute bottom-[12.5px] left-[12.5px] z-10 size-2 rounded-full" />
    <div className="bg-foreground absolute bottom-[12.5px] right-[12.5px] z-10 size-2 rounded-full" />
    {children}
  </div>
);
