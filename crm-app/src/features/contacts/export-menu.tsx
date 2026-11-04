import { useMutation } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useState } from 'react'

import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { exportContacts, type ExportParams } from '@/services/contacts'
import { saveBlob } from '@/utils/download'

type Filters = Omit<ExportParams, 'delimiter'>

/** Download the contacts matching the current search and filters, as a CSV. */
export function ExportMenu({ filters, total }: { filters: Filters; total: number | undefined }) {
  const [open, setOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: (delimiter: ExportParams['delimiter']) => exportContacts({ ...filters, delimiter }),
    onSuccess: (blob) => {
      saveBlob(blob, `contacts-${new Date().toISOString().slice(0, 10)}.csv`)
      setOpen(false)
    },
  })

  const filtered = Boolean(filters.q || filters.company || filters.tag?.length || filters.owner)
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) mutation.reset()
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={!total}>
          <Download /> Export
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <p className="text-sm">
          Download {total} {total === 1 ? 'contact' : 'contacts'}
          {filtered ? ' matching your search and filters' : ''} as a CSV file.
        </p>
        <div className="flex flex-col gap-2">
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate('comma')}>
            {mutation.isPending && mutation.variables === 'comma' ? 'Preparing…' : 'Download CSV'}
          </Button>
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate('semicolon')}
          >
            {mutation.isPending && mutation.variables === 'semicolon'
              ? 'Preparing…'
              : 'Download CSV for Excel (semicolons)'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Choose the Excel version if the file opens as one column. Notes are not included.
        </p>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {getErrorMessage(mutation.error, 'Could not export contacts')}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
