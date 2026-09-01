"use client"

import { useState, useEffect } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Settings,
  User,
  Lock,
  Save,
  Loader2,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { settingsApi } from "@/lib/api/settings-api"
import { useBusinessAccount } from "@/hooks/use-business-account"
import { RoleGuard } from "@/components/auth/role-guard"

export default function SettingsPage() {
  const { userEmail, userName, userId } = useBusinessAccount()
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    name: "",
    email: "",
  })

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  useEffect(() => {
    if (userEmail && userName) {
      setProfileForm({
        name: userName,
        email: userEmail,
      })
    }
  }, [userEmail, userName])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!profileForm.name.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Name is required",
      })
      return
    }

    try {
      setSaving(true)
      const result = await settingsApi.updateProfile({
        name: profileForm.name,
        email: profileForm.email !== userEmail ? profileForm.email : undefined,
      })

      toast({
        title: "Success",
        description: result.message || "Profile updated successfully",
      })

      // If email changed, show verification message
      if (profileForm.email !== userEmail) {
        setTimeout(() => {
          toast({
            title: "Verification Required",
            description: "Please check your email to verify your new address",
          })
        }, 1000)
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update profile",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!passwordForm.currentPassword) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Current password is required",
      })
      return
    }

    if (passwordForm.newPassword.length < 8) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "New password must be at least 8 characters",
      })
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Passwords do not match",
      })
      return
    }

    try {
      setSaving(true)
      await settingsApi.changePassword(passwordForm)

      toast({
        title: "Success",
        description: "Password changed successfully",
      })

      // Clear form
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to change password",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <RoleGuard>
      <div className="p-4 sm:p-6 lg:p-8">

        <Tabs defaultValue="profile" className="max-w-6xl">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="account" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Account
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            {/* Profile Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Settings
                </CardTitle>
                <CardDescription>Update your profile information</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      type="text"
                      value={profileForm.name}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, name: e.target.value })
                      }
                      placeholder="Your name"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profileForm.email}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, email: e.target.value })
                      }
                      placeholder="your@email.com"
                      required
                    />
                    {profileForm.email !== userEmail && (
                      <p className="text-sm text-amber-600">
                        Changing your email will require verification
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={saving}
                    className="w-full sm:w-auto"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Password Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Change Password
                </CardTitle>
                <CardDescription>
                  Update your password to keep your account secure
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) =>
                        setPasswordForm({
                          ...passwordForm,
                          currentPassword: e.target.value,
                        })
                      }
                      placeholder="Enter current password"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm({
                          ...passwordForm,
                          newPassword: e.target.value,
                        })
                      }
                      placeholder="Enter new password"
                      required
                      minLength={8}
                    />
                    <p className="text-sm text-muted-foreground">
                      Must be at least 8 characters with uppercase, lowercase, and
                      numbers
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) =>
                        setPasswordForm({
                          ...passwordForm,
                          confirmPassword: e.target.value,
                        })
                      }
                      placeholder="Confirm new password"
                      required
                    />
                    {passwordForm.confirmPassword &&
                      passwordForm.newPassword !==
                      passwordForm.confirmPassword && (
                        <p className="text-sm text-destructive">
                          Passwords do not match
                        </p>
                      )}
                  </div>

                  <Button
                    type="submit"
                    disabled={saving}
                    className="w-full sm:w-auto"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Changing Password...
                      </>
                    ) : (
                      <>
                        <Lock className="mr-2 h-4 w-4" />
                        Change Password
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Account Tab */}
          <TabsContent value="account" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Account Information</CardTitle>
                <CardDescription>
                  Your account details and business access
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-sm font-medium text-muted-foreground">
                    User ID
                  </span>
                  <span className="text-sm text-foreground font-mono">
                    {userId || "-"}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-sm font-medium text-muted-foreground">
                    Email
                  </span>
                  <span className="text-sm text-foreground">
                    {userEmail || "-"}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Account Type
                  </span>
                  <span className="text-sm text-foreground">
                    WhatsApp Business
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  )
}
