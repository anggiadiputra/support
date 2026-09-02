import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getActivityIcon, recentActivity } from "../data/data"

interface Props {
  className?: string
}

export default function RecentActivity({ className = "" }: Props) {
  return (
    <Card
      className={cn(
        "bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-4 hover:shadow-md transition-shadow",
        className
      )}
    >
      <CardHeader className="p-0 border-b border-gray-100 pb-3">
        <CardTitle className="text-base font-bold text-gray-900">Recent Activities</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-0 pt-2">
        {recentActivity.map((activity) => (
          <div key={activity.id} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
            <div className="mt-0.5 p-2 bg-gray-100 rounded-lg shrink-0">{getActivityIcon(activity.type)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {activity.title}
                </p>
                <span className="text-gray-400 text-xs shrink-0">
                  {activity.time}
                </span>
              </div>
              <p className="text-gray-500 text-xs mt-0.5">
                {activity.description}
              </p>
              <div className="flex items-center pt-2">
                <Avatar className="mr-2 h-6 w-6">
                  <AvatarImage
                    src={activity.user.avatar}
                    alt={activity.user.name}
                  />
                  <AvatarFallback className="text-[10px] bg-black text-white font-bold">
                    {(activity.user.name || "")
                      .split(" ")
                      .map((n) => n[0])
                      .join("") || "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-gray-700 text-xs font-medium">
                  {activity.user.name}
                </span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    activity.status === "open"
                      ? "bg-blue-100 text-blue-800"
                      : activity.status === "closed"
                        ? "bg-emerald-100 text-emerald-800"
                        : activity.status === "merged"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {activity.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
