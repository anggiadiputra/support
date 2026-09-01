import {
  IconCircleCheck,
  IconClock,
  IconAlertCircle,
  IconSparkles,
  IconMessageCircle,
  IconShieldCheck,
} from "@tabler/icons-react"

// Template statuses
export const statuses = [
  {
    value: "APPROVED",
    label: "Approved",
    icon: IconCircleCheck,
    color: "text-emerald-600",
  },
  {
    value: "PENDING",
    label: "Pending",
    icon: IconClock,
    color: "text-amber-600",
  },
  {
    value: "REJECTED",
    label: "Rejected",
    icon: IconAlertCircle,
    color: "text-red-600",
  },
]

// Template categories
export const categories = [
  {
    value: "MARKETING",
    label: "Marketing",
    icon: IconSparkles,
    description: "Promotional and marketing messages",
  },
  {
    value: "UTILITY",
    label: "Utility",
    icon: IconMessageCircle,
    description: "Account updates, order updates, alerts",
  },
  {
    value: "AUTHENTICATION",
    label: "Authentication",
    icon: IconShieldCheck,
    description: "OTP and verification codes",
  },
]

// Template quality ratings
export const qualities = [
  {
    value: "HIGH",
    label: "High Quality",
    color: "text-emerald-600",
  },
  {
    value: "MEDIUM",
    label: "Medium Quality",
    color: "text-amber-600",
  },
  {
    value: "LOW",
    label: "Low Quality",
    color: "text-red-600",
  },
]

// Languages
export const languages = [
  { value: "en_US", label: "English (US)" },
  { value: "id", label: "Indonesian" },
  { value: "en_GB", label: "English (UK)" },
  { value: "es_ES", label: "Spanish" },
  { value: "pt_BR", label: "Portuguese (Brazil)" },
]
