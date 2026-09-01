import {
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconUserCheck,
  IconUserX,
  IconUserQuestion,
} from "@tabler/icons-react"

// Consent statuses
export const consentStatuses = [
  {
    value: "CONSENTED",
    label: "Consented",
    icon: IconUserCheck,
    color: "text-emerald-600",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/20",
  },
  {
    value: "NOT_CONSENTED",
    label: "Not Consented",
    icon: IconUserQuestion,
    color: "text-amber-600",
    bgColor: "bg-amber-100 dark:bg-amber-900/20",
  },
  {
    value: "REVOKED",
    label: "Revoked",
    icon: IconUserX,
    color: "text-red-600",
    bgColor: "bg-red-100 dark:bg-red-900/20",
  },
]

// Message window statuses
export const windowStatuses = [
  {
    value: true,
    label: "Active Window",
    icon: IconCircleCheck,
    color: "text-emerald-600",
    description: "Can send free messages",
  },
  {
    value: false,
    label: "No Active Window",
    icon: IconCircleX,
    color: "text-gray-400",
    description: "Must use approved templates",
  },
]

// Common customer tags
export const customerTags = [
  { value: "vip", label: "VIP", color: "bg-purple-100 text-purple-700" },
  { value: "new", label: "New", color: "bg-blue-100 text-blue-700" },
  { value: "active", label: "Active", color: "bg-emerald-100 text-emerald-700" },
  { value: "inactive", label: "Inactive", color: "bg-gray-100 text-gray-700" },
  { value: "potential", label: "Potential", color: "bg-amber-100 text-amber-700" },
]
