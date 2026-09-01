import { Skeleton } from "@/components/ui/skeleton"

export default function OneinboxLoading() {
  return (
    <div className="flex h-full">
      {/* Conversation list skeleton */}
      <div className="w-80 border-r p-4 space-y-4">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
      {/* Chat area skeleton */}
      <div className="flex-1 p-4 flex flex-col">
        <div className="flex-1 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
              <Skeleton className={`h-16 ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'} rounded-lg`} />
            </div>
          ))}
        </div>
        <Skeleton className="h-12 w-full mt-4" />
      </div>
    </div>
  )
}
