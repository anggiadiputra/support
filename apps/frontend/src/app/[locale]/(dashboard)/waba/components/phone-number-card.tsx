"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  IconPhone,
  IconCircleCheck,
  IconAlertTriangle,
  IconCircleX,
  IconTrendingUp
} from "@tabler/icons-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { getTierInfo, type PhoneNumberDetails } from "@/lib/api/waba"

interface Props {
  phoneInfo: PhoneNumberDetails | null
}

export function PhoneNumberCard({ phoneInfo }: Props) {
  if (!phoneInfo) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <IconPhone className="text-muted-foreground mb-4 h-12 w-12" />
          <h3 className="mb-2 text-lg font-semibold">No Phone Number</h3>
          <p className="text-muted-foreground text-sm">
            Connect a WABA to see phone number details
          </p>
        </CardContent>
      </Card>
    )
  }

  const qualityConfig = {
    GREEN: {
      label: "High Quality",
      color: "bg-emerald-600",
      icon: IconCircleCheck,
      description: "Excellent messaging quality"
    },
    YELLOW: {
      label: "Medium Quality",
      color: "bg-amber-600",
      icon: IconAlertTriangle,
      description: "Quality under review"
    },
    RED: {
      label: "Low Quality",
      color: "bg-red-600",
      icon: IconCircleX,
      description: "Quality issues detected"
    },
    UNKNOWN: {
      label: "Unknown",
      color: "bg-gray-600",
      icon: IconAlertTriangle,
      description: "Quality not rated yet"
    },
  }

  const quality = qualityConfig[phoneInfo.qualityRating || "UNKNOWN"]
  const QualityIcon = quality.icon
  const tierInfo = getTierInfo(phoneInfo.messagingLimitTier)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconPhone className="h-5 w-5" />
          Phone Number
          {phoneInfo.isPrimary && (
            <Badge variant="default" className="text-xs">
              Primary
            </Badge>
          )}
        </CardTitle>
        <CardDescription>Your WhatsApp Business phone number details</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Phone Number Display */}
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary text-primary-foreground">
                <IconPhone className="h-6 w-6" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-mono text-lg font-bold">{phoneInfo.displayPhoneNumber}</p>
              {phoneInfo.verifiedName && (
                <p className="text-muted-foreground text-sm">{phoneInfo.verifiedName}</p>
              )}
            </div>
          </div>

          {/* Quality Rating */}
          <div className="rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Quality Rating</p>
              <Badge className={quality.color}>
                <QualityIcon className="mr-1 h-3 w-3" />
                {quality.label}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">{quality.description}</p>

            {/* Quality Progress Bar */}
            <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  phoneInfo.qualityRating === "GREEN"
                    ? "bg-green-500 w-full"
                    : phoneInfo.qualityRating === "YELLOW"
                      ? "bg-yellow-500 w-2/3"
                      : phoneInfo.qualityRating === "RED"
                        ? "bg-red-500 w-1/3"
                        : "bg-gray-400 w-0"
                }`}
              />
            </div>
          </div>

          {/* Messaging Tier */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconTrendingUp className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium">Messaging Limit</span>
              </div>
              <span className={`text-lg font-bold ${tierInfo.color}`}>
                {tierInfo.limit}/day
              </span>
            </div>

            {/* Tier Progress Indicator */}
            <div className="flex gap-1">
              {["TIER_1K", "TIER_10K", "TIER_100K", "TIER_UNLIMITED"].map((tier, index) => {
                const currentTierIndex = ["TIER_1K", "TIER_10K", "TIER_100K", "TIER_UNLIMITED"].indexOf(
                  phoneInfo.messagingLimitTier || ""
                )
                const isActive = index <= currentTierIndex

                return (
                  <div
                    key={tier}
                    className={`flex-1 h-1.5 rounded-full ${
                      isActive ? "bg-blue-500" : "bg-gray-200"
                    }`}
                  />
                )
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1K</span>
              <span>10K</span>
              <span>100K</span>
              <span>∞</span>
            </div>
          </div>

          {/* Details Grid */}
          <div className="border-t pt-4">
            <p className="text-muted-foreground text-xs">Phone Number ID</p>
            <p className="font-mono text-sm">{phoneInfo.phoneNumberId}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
