import { Skeleton } from "@/components/ui/skeleton"

export default function PipelineLoading() {
  return (
    <div className="h-full flex flex-col space-y-4 p-4">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <Skeleton className="h-10 w-64" />

      {/* Add Deal button skeleton */}
      <div className="flex justify-end">
        <Skeleton className="h-10 w-28" />
      </div>

      {/* Pipeline columns skeleton */}
      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex h-full gap-4 min-w-max">
          {Array.from({ length: 4 }).map((_, stageIndex) => (
            <div key={stageIndex} className="w-80 flex flex-col bg-muted/50 rounded-lg p-2">
              {/* Stage header skeleton */}
              <div className="flex items-center justify-between p-2 mb-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-3 h-3 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-6 rounded-md" />
                </div>
                <Skeleton className="h-6 w-6" />
              </div>

              {/* Customer cards skeleton */}
              <div className="flex-1 flex flex-col gap-2 min-h-[100px]">
                {Array.from({ length: stageIndex === 0 ? 3 : stageIndex === 1 ? 2 : 1 }).map((_, cardIndex) => (
                  <div key={cardIndex} className="border rounded-lg bg-card p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <div className="flex justify-between items-center">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-5 w-5 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
