"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  IconBrandWhatsapp,
  IconBrandInstagram,
  IconBrandFacebook,
  IconMail,
  IconBrain,
  IconCreditCard,
} from "@tabler/icons-react"
import { WhatsAppSettingsForm } from "./components/whatsapp-settings-form"
import { InstagramSettingsForm } from "./components/instagram-settings-form"
import { MessengerSettingsForm } from "./components/messenger-settings-form"
import { SmtpSettingsForm } from "./components/smtp-settings-form"
import { OpenAISettingsForm } from "./components/openai-settings-form"
import { DuitkuSettingsForm } from "./components/duitku-settings-form"
import { XenditSettingsForm } from "./components/xendit-settings-form"
import { PaymentGatewaySettings } from "./components/payment-gateway-settings"

type SettingsTab = "whatsapp" | "instagram" | "messenger" | "smtp" | "openai" | "payment"

const tabs = [
  { id: "whatsapp" as const, label: "WhatsApp", icon: IconBrandWhatsapp },
  { id: "instagram" as const, label: "Instagram", icon: IconBrandInstagram },
  { id: "messenger" as const, label: "Messenger", icon: IconBrandFacebook },
  { id: "smtp" as const, label: "Email", icon: IconMail },
  { id: "openai" as const, label: "OpenAI", icon: IconBrain },
  { id: "payment" as const, label: "Payment", icon: IconCreditCard },
]

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("whatsapp")

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure channel integrations and API credentials
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTab)}>
        <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-flex">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="whatsapp" className="mt-6">
          <WhatsAppSettingsForm />
        </TabsContent>

        <TabsContent value="instagram" className="mt-6">
          <InstagramSettingsForm />
        </TabsContent>

        <TabsContent value="messenger" className="mt-6">
          <MessengerSettingsForm />
        </TabsContent>

        <TabsContent value="smtp" className="mt-6">
          <SmtpSettingsForm />
        </TabsContent>

        <TabsContent value="openai" className="mt-6">
          <OpenAISettingsForm />
        </TabsContent>

        <TabsContent value="payment" className="mt-6">
          <Tabs defaultValue="general">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="duitku">Duitku</TabsTrigger>
              <TabsTrigger value="xendit">Xendit</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="mt-6">
              <PaymentGatewaySettings />
            </TabsContent>

            <TabsContent value="duitku" className="mt-6">
              <DuitkuSettingsForm />
            </TabsContent>

            <TabsContent value="xendit" className="mt-6">
              <XenditSettingsForm />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  )
}
