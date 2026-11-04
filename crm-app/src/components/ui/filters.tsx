import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type FilterDefinition = {
  key: string
  label: string
  options: { value: string; label: string }[]
}

type FiltersProps = {
  filters: FilterDefinition[]
  values: Record<string, string | undefined>
  onChange: (values: Record<string, string | undefined>) => void
  /** Something outside these selects is also filtering, so "Clear" should show. */
  extraActive?: boolean
}

/** A row of select filters with a "Clear" button when any filter is active. */
export function Filters({ filters, values, onChange, extraActive = false }: FiltersProps) {
  const active = extraActive || filters.some((f) => values[f.key])

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <Select
          key={f.key}
          value={values[f.key] ?? ''}
          onValueChange={(v) => onChange({ ...values, [f.key]: v || undefined })}
        >
          <SelectTrigger aria-label={f.label} className="w-40">
            <SelectValue placeholder={f.label} />
          </SelectTrigger>
          <SelectContent>
            {f.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {active && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})}>
          Clear
        </Button>
      )}
    </div>
  )
}
