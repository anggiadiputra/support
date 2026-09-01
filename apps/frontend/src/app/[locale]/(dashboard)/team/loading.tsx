import { Skeleton } from "@/components/ui/skeleton"

export default function TeamLoading() {
  return (
    <div className="space-y-6 p-4">
      {/* Header skeleton */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Team Members Card skeleton */}
      <div className="border rounded-lg">
        <div className="p-6 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="px-6 pb-6">
          {/* Table header */}
          <div className="border rounded-lg">
            <div className="border-b p-4">
              <div className="flex gap-4">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
            {/* Table rows */}
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border-b last:border-b-0 p-4">
                <div className="flex gap-4 items-center">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pending Invitations Card skeleton */}
      <div className="border rounded-lg">
        <div className="p-6">
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="px-6 pb-6">
          <div className="border rounded-lg">
            <div className="border-b p-4">
              <div className="flex gap-4">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="border-b last:border-b-0 p-4">
                <div className="flex gap-4 items-center">
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 flex-1" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
