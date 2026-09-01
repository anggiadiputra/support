"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { IconBrandInstagram } from "@tabler/icons-react"
import type { IGConversation } from "@/lib/api/instagram"

interface Props {
  conversation: IGConversation
  onBack: () => void
}

export function IGChatHeader({ conversation, onBack }: Props) {
  const openInstagramProfile = () => {
    if (conversation.participantUsername) {
      window.open(`https://instagram.com/${conversation.participantUsername}`, "_blank")
    }
  }

  return (
    <div className="flex items-center gap-3 p-4 border-b bg-background">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="md:hidden h-8 w-8 p-0"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <Avatar className="h-10 w-10">
        <AvatarImage src={conversation.participantProfilePic || undefined} />
        <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white">
          {conversation.participantUsername?.substring(0, 2).toUpperCase() || "IG"}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold truncate">
            @{conversation.participantUsername || "Unknown"}
          </p>
          {conversation.isFollower && (
            <Badge variant="secondary" className="text-xs">Follower</Badge>
          )}
          {conversation.isFollowing && (
            <Badge variant="outline" className="text-xs">Following</Badge>
          )}
        </div>
        {conversation.participantName && (
          <p className="text-sm text-muted-foreground truncate">
            {conversation.participantName}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={openInstagramProfile}
          className="h-8 w-8 p-0"
          title="View Instagram Profile"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
          <IconBrandInstagram className="h-4 w-4 text-white" />
        </div>
      </div>
    </div>
  )
}
