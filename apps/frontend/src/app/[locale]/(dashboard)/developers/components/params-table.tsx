import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface Parameter {
  name: string
  type: string
  required: boolean
  description: string
  default?: string
}

interface ParamsTableProps {
  parameters: Parameter[]
  className?: string
}

export function ParamsTable({ parameters, className }: ParamsTableProps) {
  return (
    <div className={cn("rounded-lg border overflow-hidden", className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[180px]">Parameter</TableHead>
            <TableHead className="w-[100px]">Type</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {parameters.map((param) => (
            <TableRow key={param.name}>
              <TableCell className="font-mono text-sm">
                <span className="text-foreground">{param.name}</span>
                {param.required && (
                  <Badge variant="destructive" className="ml-2 text-[10px] px-1 py-0">
                    required
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
                  {param.type}
                </code>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {param.description}
                {param.default && (
                  <span className="block text-xs mt-1">
                    Default: <code className="bg-muted rounded px-1">{param.default}</code>
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export type { Parameter }
