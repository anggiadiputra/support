import React, { Suspense } from "react"
import { createBrowserRouter, Navigate } from "react-router-dom"
import { RefreshCw } from "lucide-react"

import RootLayout from "./layouts/root-layout"
import DashboardLayout from "./layouts/dashboard-layout"
import AdminLayout from "./layouts/admin-layout"
import AuthLayout from "./layouts/auth-layout"

// Helper for lazy loading with suspense
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyLoad(ComponentPromise: () => Promise<{ default: React.ComponentType<any> | any }>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LazyComponent = React.lazy(ComponentPromise as any)
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <LazyComponent />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      // Redirect root to dashboard
      {
        path: "/",
        element: <Navigate to="/dashboard" replace />,
      },
      // Handle locale prefixes (e.g. /id/dashboard or /en/dashboard -> rewrite/redirect)
      {
        path: "/:locale",
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: "/:locale/dashboard",
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: "/:locale/login",
        element: <Navigate to="/login" replace />,
      },
      {
        path: "/:locale/register",
        element: <Navigate to="/register" replace />,
      },

      // Auth Routes
      {
        element: <AuthLayout />,
        children: [
          {
            path: "/login",
            element: lazyLoad(() => import("@/app/[locale]/(auth)/login/page")),
          },
          {
            path: "/register",
            element: lazyLoad(() => import("@/app/[locale]/(auth)/register/page")),
          },
          {
            path: "/forgot-password",
            element: lazyLoad(() => import("@/app/[locale]/(auth)/forgot-password/page")),
          },
          {
            path: "/accept-invitation",
            element: lazyLoad(() => import("@/app/[locale]/(auth)/accept-invitation/page")),
          },
        ],
      },

      // Dashboard Routes (Protected)
      {
        element: <DashboardLayout />,
        children: [
          {
            path: "/dashboard",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/dashboard/page")),
          },
          {
            path: "/messages",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/messages/page")),
          },
          {
            path: "/oneinbox",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/oneinbox/page")),
          },
          {
            path: "/instagram",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/instagram/page")),
          },
          {
            path: "/messenger",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/messenger/page")),
          },
          {
            path: "/waba",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/waba/page")),
          },
          {
            path: "/waba/callback",
            element: lazyLoad(() => import("@/app/[locale]/waba/callback/page")),
          },
          {
            path: "/templates",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/templates/page")),
          },
          {
            path: "/broadcast",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/broadcast/page")),
          },
          {
            path: "/automation",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/automation/page")),
          },
          {
            path: "/automation/auto-tagging",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/automation/auto-tagging/page")),
          },
          {
            path: "/automation/quick-replies",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/automation/quick-replies/page")),
          },
          {
            path: "/customers",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/customers/page")),
          },
          {
            path: "/crm",
            element: <Navigate to="/crm/pipeline" replace />,
          },
          {
            path: "/crm/pipeline",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/crm/pipeline/page")),
          },
          {
            path: "/crm/auto-tagging",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/crm/auto-tagging/page")),
          },
          {
            path: "/crm-settings",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/crm-settings/page")),
          },
          {
            path: "/crm-settings/custom-fields",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/crm-settings/custom-fields/page")),
          },
          {
            path: "/crm-settings/pipelines",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/crm-settings/pipelines/page")),
          },
          {
            path: "/analytics",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/analytics/page")),
          },
          {
            path: "/insights",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/insights/page")),
          },
          {
            path: "/ai",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/ai/page")),
          },
          {
            path: "/subscription",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/subscription/page")),
          },
          {
            path: "/team",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/team/page")),
          },
          {
            path: "/settings",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/settings/page")),
          },
          {
            path: "/settings/notifications",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/settings/notifications/page")),
          },
          {
            path: "/settings/crm",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/settings/crm/page")),
          },
          {
            path: "/profile",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/profile/page")),
          },
          {
            path: "/help-support",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/help-support/page")),
          },
          {
            path: "/developers",
            element: <Navigate to="/developers/overview" replace />,
          },
          {
            path: "/developers/overview",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/developers/overview/page")),
          },
          {
            path: "/developers/api-keys",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/developers/api-keys/page")),
          },
          {
            path: "/developers/webhooks",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/developers/webhooks/page")),
          },
          {
            path: "/developers/events-&-logs",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/developers/events-&-logs/page")),
          },
          {
            path: "/developers/docs",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/developers/docs/page")),
          },
          {
            path: "/affiliate",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/affiliate/page")),
          },
          {
            path: "/boards",
            element: lazyLoad(() => import("@/app/[locale]/(dashboard)/boards/overview/index")),
          },
        ],
      },

      // Admin Routes (Protected + Role Admin)
      {
        path: "/admin",
        element: <AdminLayout />,
        children: [
          {
            index: true,
            element: lazyLoad(() => import("@/app/[locale]/admin/page")),
          },
          {
            path: "users",
            element: lazyLoad(() => import("@/app/[locale]/admin/users/page")),
          },
          {
            path: "users/:id",
            element: lazyLoad(() => import("@/app/[locale]/admin/users/[id]/page")),
          },
          {
            path: "subscriptions",
            element: lazyLoad(() => import("@/app/[locale]/admin/subscriptions/page")),
          },
          {
            path: "subscription-plans",
            element: lazyLoad(() => import("@/app/[locale]/admin/subscription-plans/page")),
          },
          {
            path: "revenue",
            element: lazyLoad(() => import("@/app/[locale]/admin/revenue/page")),
          },
          {
            path: "system",
            element: lazyLoad(() => import("@/app/[locale]/admin/system/page")),
          },
          {
            path: "audit",
            element: lazyLoad(() => import("@/app/[locale]/admin/audit/page")),
          },
          {
            path: "email-templates",
            element: lazyLoad(() => import("@/app/[locale]/admin/email-templates/page")),
          },
          {
            path: "notifications",
            element: <Navigate to="/admin/notifications/send" replace />,
          },
          {
            path: "notifications/send",
            element: lazyLoad(() => import("@/app/[locale]/admin/notifications/send/page")),
          },
          {
            path: "notifications/history",
            element: lazyLoad(() => import("@/app/[locale]/admin/notifications/history/page")),
          },
          {
            path: "settings",
            element: lazyLoad(() => import("@/app/[locale]/admin/settings/page")),
          },
          {
            path: "settings/branding",
            element: lazyLoad(() => import("@/app/[locale]/admin/settings/branding/page")),
          },
          {
            path: "settings/message-retention",
            element: lazyLoad(() => import("@/app/[locale]/admin/settings/message-retention/page")),
          },
          {
            path: "affiliates",
            element: lazyLoad(() => import("@/app/[locale]/admin/affiliates/page")),
          },
        ],
      },

      // OAuth Callbacks
      {
        path: "/instagram/callback",
        element: lazyLoad(() => import("@/app/[locale]/(dashboard)/instagram/callback/page")),
      },
      {
        path: "/messenger/callback",
        element: lazyLoad(() => import("@/app/[locale]/(dashboard)/messenger/callback/page")),
      },

      // 404 Fallback
      {
        path: "*",
        element: lazyLoad(() => import("@/components/errors/not-found-error")),
      },
    ],
  },
])
