"use client"

import { useState, useEffect } from "react"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    CheckCircle,
    XCircle,
    AlertCircle,
    Phone,
    RefreshCw,
    Unplug,
    Activity,
    MessageSquare,
} from "lucide-react"
import { wabaApi, type PhoneNumberDetails, type WABADetails } from "@/lib/api/waba-api"
import { useToast } from "@/hooks/use-toast"
import { getSafeErrorMessage } from "@/lib/error-utils"
import { PhoneNumberCard } from "./phone-number-card"
import { WABAConnectionButton } from "./waba-connection-button"
import { useBusinessAccount } from "@/hooks/use-business-account"

interface AccountWithPhoneNumbers {
    account: WABADetails
    phoneNumbers: PhoneNumberDetails[]
}

export function WABADashboard() {
    const {
        isLoading: sessionLoading,
    } = useBusinessAccount()
    const [accounts, setAccounts] = useState<AccountWithPhoneNumbers[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [disconnectTarget, setDisconnectTarget] = useState<WABADetails | null>(null)
    const [disconnecting, setDisconnecting] = useState(false)
    const { toast } = useToast()

    const loadData = async () => {
        try {
            setLoading(true)

            // Load all WhatsApp accounts
            const wabaAccounts = await wabaApi.getAccounts()

            // Load phone numbers for each connected account
            const accountsWithNumbers: AccountWithPhoneNumbers[] = await Promise.all(
                wabaAccounts.map(async (account) => {
                    let phoneNumbers: PhoneNumberDetails[] = []
                    if (account.connectionStatus === "connected") {
                        try {
                            phoneNumbers = await wabaApi.getPhoneNumbers(account.wabaId)
                        } catch {
                            console.error(`Failed to load phone numbers for ${account.wabaId}`)
                        }
                    }
                    return { account, phoneNumbers }
                })
            )

            setAccounts(accountsWithNumbers)
        } catch (error: any) {
            console.error("Failed to load WABA data:", error)
            toast({
                variant: "destructive",
                title: "Error",
                description: getSafeErrorMessage(error, "Failed to load WhatsApp data"),
            })
        } finally {
            setLoading(false)
        }
    }

    const handleRefresh = async () => {
        try {
            setRefreshing(true)

            // Sync phone numbers for all connected accounts
            for (const { account } of accounts) {
                if (account.connectionStatus === "connected") {
                    try {
                        const syncResult = await wabaApi.syncPhoneNumbers(account.wabaId)
                        if (syncResult.added > 0 || syncResult.deleted > 0) {
                            toast({
                                title: "Synced",
                                description: `${account.wabaId}: ${syncResult.added} added, ${syncResult.deleted} removed`,
                            })
                        }
                    } catch {
                        // Continue with other accounts
                    }
                }
            }

            await loadData()
            toast({
                title: "Refreshed",
                description: "WABA data refreshed",
            })
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: getSafeErrorMessage(error, "Failed to refresh data"),
            })
            await loadData()
        } finally {
            setRefreshing(false)
        }
    }

    const handleDisconnect = async () => {
        if (!disconnectTarget) return

        try {
            setDisconnecting(true)
            await wabaApi.disconnect(disconnectTarget.wabaId, "User requested disconnect")
            toast({
                title: "Disconnected",
                description: "WhatsApp Business Account disconnected",
            })
            setDisconnectTarget(null)
            await loadData()
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: getSafeErrorMessage(error, "Failed to disconnect account"),
            })
        } finally {
            setDisconnecting(false)
        }
    }

    const handleConnectionSuccess = async () => {
        toast({
            title: "Connected",
            description: "WhatsApp connected! Refreshing...",
        })

        // Wait a bit for backend to commit
        await new Promise((resolve) => setTimeout(resolve, 1500))

        // Force hard reload to refresh session (bypass cache)
        window.location.href = window.location.href
    }

    useEffect(() => {
        if (!sessionLoading) {
            loadData()
        }
    }, [sessionLoading])

    const getStatusBadge = (status?: string) => {
        switch (status) {
            case "connected":
                return (
                    <Badge
                        variant="outline"
                        className="flex items-center gap-1 border-green-200 bg-green-50 text-green-700"
                    >
                        <CheckCircle className="h-3 w-3" />
                        Connected
                    </Badge>
                )
            case "disconnected":
                return (
                    <Badge
                        variant="outline"
                        className="flex items-center gap-1 border-red-200 bg-red-50 text-red-700"
                    >
                        <XCircle className="h-3 w-3" />
                        Disconnected
                    </Badge>
                )
            case "error":
                return (
                    <Badge
                        variant="outline"
                        className="flex items-center gap-1 border-yellow-200 bg-yellow-50 text-yellow-700"
                    >
                        <AlertCircle className="h-3 w-3" />
                        Error
                    </Badge>
                )
            default:
                return (
                    <Badge variant="outline" className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Not Connected
                    </Badge>
                )
        }
    }

    if (loading || sessionLoading) {
        return (
            <div className="space-y-6">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // If no accounts, show setup screen
    if (accounts.length === 0) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <div className="text-center py-8">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <MessageSquare className="h-8 w-8 text-green-600" />
                        </div>
                        <h3 className="text-lg font-semibold mb-2">
                            Connect Your WhatsApp Business
                        </h3>
                        <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                            Get started by connecting your WhatsApp Business Account to send
                            messages to your customers.
                        </p>
                        <WABAConnectionButton
                            onSuccess={handleConnectionSuccess}
                            enableCoexistence={true}
                        />
                        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-left max-w-md mx-auto">
                            <p className="text-sm font-medium text-blue-800 mb-2">
                                What you can connect:
                            </p>
                            <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                                <li>New WhatsApp Business Account</li>
                                <li>Existing WhatsApp Business App number (v2.24.17+)</li>
                                <li>You'll choose in the next step</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header with Add Account button */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">WhatsApp Business Accounts</h3>
                    <p className="text-sm text-muted-foreground">
                        {accounts.length} account{accounts.length !== 1 ? "s" : ""} connected
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={refreshing}
                    >
                        <RefreshCw
                            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                        />
                    </Button>
                    <WABAConnectionButton
                        onSuccess={handleConnectionSuccess}
                        enableCoexistence={true}
                    />
                </div>
            </div>

            {/* Account Cards */}
            {accounts.map(({ account, phoneNumbers }) => {
                const isConnected = account.connectionStatus === "connected"

                return (
                    <Card key={account.id}>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isConnected ? "bg-green-100" : "bg-muted"}`}>
                                        {isConnected ? (
                                            <CheckCircle className="h-5 w-5 text-green-600" />
                                        ) : (
                                            <Phone className="h-5 w-5 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <CardTitle className="text-base">
                                                {account.name || `WABA ${account.wabaId}`}
                                            </CardTitle>
                                            {getStatusBadge(account.connectionStatus)}
                                        </div>
                                        <CardDescription className="font-mono text-xs">
                                            {account.wabaId}
                                        </CardDescription>
                                    </div>
                                </div>
                                {isConnected && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setDisconnectTarget(account)}
                                    >
                                        <Unplug className="h-4 w-4 mr-2" />
                                        Disconnect
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            {/* Connection Details */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div className="flex items-center gap-3 p-3 border rounded-lg">
                                    <Phone className="h-5 w-5 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">
                                            Phone Numbers
                                        </p>
                                        <p className="text-sm font-medium">{phoneNumbers.length}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-3 border rounded-lg">
                                    <Activity className="h-5 w-5 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Status</p>
                                        <p className="text-sm font-medium capitalize">
                                            {account.connectionStatus}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Phone Numbers */}
                            {isConnected && phoneNumbers.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {phoneNumbers.map((phoneNumber) => (
                                        <PhoneNumberCard
                                            key={phoneNumber.id}
                                            phoneNumber={phoneNumber}
                                            onRefresh={handleRefresh}
                                        />
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )
            })}

            {/* Disconnect Confirmation Dialog */}
            <Dialog
                open={!!disconnectTarget}
                onOpenChange={(open) => !open && setDisconnectTarget(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Disconnect WhatsApp Business Account?</DialogTitle>
                        <DialogDescription>
                            This will disconnect your WhatsApp Business Account from the
                            platform. You will no longer be able to send or receive messages
                            until you reconnect.
                            <br />
                            <br />
                            Your historical data (messages, templates, customers) will be
                            preserved.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDisconnectTarget(null)}
                            disabled={disconnecting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDisconnect}
                            disabled={disconnecting}
                        >
                            {disconnecting ? (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                    Disconnecting...
                                </>
                            ) : (
                                "Disconnect"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
