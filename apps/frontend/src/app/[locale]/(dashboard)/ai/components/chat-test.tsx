"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Bot,
  Send,
  User,
  Loader2,
  RotateCcw,
  Sparkles,
  FileText,
  Lightbulb,
  AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { aiApi, AIAgent } from "@/lib/api/ai-api"
import { getSafeErrorMessage } from "@/lib/error-utils"
import { useTestChat } from "@/hooks/use-ai"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  isError?: boolean
  timestamp: Date
}

interface ChatTestProps {
  agents: AIAgent[]
}

const sampleQuestions = [
  "Apa saja produk yang tersedia?",
  "Bagaimana cara melakukan pemesanan?",
  "Berapa harga layanan ini?",
  "Apa keuntungan menggunakan layanan ini?",
]

export function ChatTest({ agents }: ChatTestProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>("")
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const testChatMutation = useTestChat()
  const isLoading = testChatMutation.isPending

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Auto-select first agent if available
  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agents[0].id)
    }
  }, [agents, selectedAgentId])

  // Auto-focus input on mount and when agent is selected
  useEffect(() => {
    if (selectedAgentId) {
      inputRef.current?.focus()
    }
  }, [selectedAgentId])

  // Auto-focus input after AI responds (when loading stops)
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      inputRef.current?.focus()
    }
  }, [isLoading, messages.length])

  const handleSend = async (messageText?: string) => {
    const text = messageText || input
    if (!text.trim() || !selectedAgentId || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    }

    // Build history from existing messages for context retention
    const history = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    setMessages((prev) => [...prev, userMessage])
    setInput("")

    try {
      const result = await testChatMutation.mutateAsync({
        message: userMessage.content,
        agentId: selectedAgentId,
        history,
      })

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.response,
        isError: result.isError,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: getSafeErrorMessage(error, "Terjadi kesalahan saat mengirim pesan"),
        isError: true,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, errorMessage])
    } finally {
      // Use setTimeout to ensure focus happens after React re-render
      setTimeout(() => {
        inputRef.current?.focus()
      }, 0)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const clearChat = () => {
    setMessages([])
  }

  const selectedAgent = agents.find((a) => a.id === selectedAgentId)

  if (agents.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-16">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Bot className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Belum Ada Agent</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Buat Agent terlebih dahulu di tab &quot;Agents&quot; untuk mulai
              testing chatbot Anda.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Panel - Agent Info & Tips */}
      <div className="space-y-4">
        {/* Agent Selector */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Pilih Agent</label>
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih agent untuk test" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-primary" />
                        <span>{agent.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedAgent && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="gap-1">
                    <FileText className="h-3 w-3" />
                    {selectedAgent.knowledgeDocumentCount || 0} dokumen
                  </Badge>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    System Prompt
                  </p>
                  <div className="bg-muted/50 rounded-lg p-3 text-xs max-h-32 overflow-y-auto">
                    <p className="whitespace-pre-wrap">
                      {selectedAgent.systemPrompt.length > 200
                        ? selectedAgent.systemPrompt.substring(0, 200) + "..."
                        : selectedAgent.systemPrompt}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sample Questions */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              <p className="text-sm font-medium">Contoh Pertanyaan</p>
            </div>
            <div className="space-y-2">
              {sampleQuestions.map((question, index) => (
                <button
                  key={index}
                  onClick={() => handleSend(question)}
                  disabled={isLoading || !selectedAgentId}
                  className="w-full text-left text-sm p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {question}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tips */}
        <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
                <p className="font-medium">Tips Testing:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-blue-700 dark:text-blue-400">
                  <li>Test dengan berbagai jenis pertanyaan</li>
                  <li>Pastikan knowledge base sudah ter-upload</li>
                  <li>Cek apakah jawaban sesuai dengan dokumen</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel - Chat Area */}
      <div className="lg:col-span-2">
        <Card className="flex flex-col h-[600px]">
          {/* Chat Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <p className="font-semibold text-sm">
                  {selectedAgent?.name || "AI Assistant"}
                </p>
                <p className="text-xs text-muted-foreground">Test Mode</p>
              </div>
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearChat}
                className="text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            )}
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4">
                  <Bot className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-1">
                  Test AI Chatbot Anda
                </h3>
                <p className="text-muted-foreground text-sm max-w-xs">
                  Kirim pesan untuk melihat bagaimana AI Agent merespons
                  berdasarkan knowledge base yang sudah di-upload.
                </p>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-3",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.role === "assistant" && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-2.5",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : message.isError
                            ? "bg-destructive/10 text-destructive border border-destructive/20 rounded-tl-sm"
                            : "bg-muted rounded-tl-sm"
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">
                        {message.content}
                      </p>
                      <p
                        className={cn(
                          "text-[10px] mt-1.5",
                          message.role === "user"
                            ? "text-primary-foreground/60"
                            : "text-muted-foreground"
                        )}
                      >
                        {message.timestamp.toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    {message.role === "user" && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-500 flex items-center justify-center">
                        <User className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3 justify-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area */}
          <div className="border-t p-4 bg-muted/20">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ketik pesan untuk test AI..."
                className="flex-1 bg-background"
                disabled={!selectedAgentId || isLoading}
              />
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim() || !selectedAgentId || isLoading}
                size="icon"
                className="flex-shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              Tekan Enter untuk mengirim
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
