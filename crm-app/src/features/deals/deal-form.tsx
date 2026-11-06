import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm, type FieldPath } from 'react-hook-form'

import { getErrorMessage, getFieldErrors } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { usePermission } from '@/hooks/use-permission'
import { listContacts } from '@/services/contacts'
import { listCompanyDetails } from '@/services/companies'
import type { PipelineStage } from '@/services/deals'
import { RecordPicker } from './record-picker'
import { dealSchema, type DealFormValues } from './schemas'

const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30'

const FIELDS: (keyof DealFormValues)[] = [
  'title',
  'company',
  'contact',
  'amount',
  'stageId',
  'probability',
  'expectedClose',
]

const searchCompanies = (q: string) =>
  listCompanyDetails({ q: q || undefined, pageSize: 8 }).then((r) =>
    r.companies.map((c) => ({ id: c.id, label: c.name, hint: c.industry ?? undefined })),
  )

const searchContacts = (q: string) =>
  listContacts({ q: q || undefined, pageSize: 8 }).then((r) =>
    r.contacts.map((c) => ({
      id: c.id,
      label: `${c.firstName} ${c.lastName}`,
      hint: c.company?.name ?? c.email ?? undefined,
    })),
  )

export function DealForm<T>({
  defaultValues,
  stages,
  submitLabel,
  save,
  onSaved,
  onCancel,
}: {
  defaultValues: DealFormValues
  /** The stages a deal can be in, in order: those of its pipeline. */
  stages: PipelineStage[]
  submitLabel: string
  save: (values: DealFormValues) => Promise<T>
  onSaved: (result: T) => void
  onCancel: () => void
}) {
  const form = useForm<DealFormValues>({ resolver: zodResolver(dealSchema), defaultValues })
  const canPickCompany = usePermission('companies:read')
  const canPickContact = usePermission('contacts:read')

  const mutation = useMutation({
    mutationFn: save,
    onSuccess: onSaved,
    onError: (error) => {
      const fields = getFieldErrors(error)
      for (const name of FIELDS) {
        const message = fields[name] ?? fields[`${name}Id`]
        if (message) form.setError(name, { message })
      }
    },
  })

  const stageId = form.watch('stageId')
  const stage = stages.find((s) => s.id === stageId)
  // Won and lost deals have a fixed probability.
  const closed = Boolean(stage?.isWon || stage?.isLost)

  const field = (
    name: FieldPath<DealFormValues>,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
    hint?: string,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...props} {...field} value={field.value as string} />
          </FormControl>
          {hint && <FormDescription>{hint}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )

  const picker = (name: 'company' | 'contact', label: string, search: typeof searchCompanies) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor={undefined}>{label}</FormLabel>
          <RecordPicker
            name={name}
            label={label}
            value={field.value}
            onChange={field.onChange}
            search={search}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        className="space-y-4"
        noValidate
      >
        {mutation.isError && Object.keys(getFieldErrors(mutation.error)).length === 0 && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {getErrorMessage(mutation.error, 'Could not save the deal')}
          </p>
        )}
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              {field('title', 'Deal name', { autoComplete: 'off' })}
            </div>
            {canPickCompany && picker('company', 'Company', searchCompanies)}
            {canPickContact && picker('contact', 'Contact', searchContacts)}
            {field(
              'amount',
              'Value in USD (optional)',
              { inputMode: 'decimal' },
              'Numbers only, e.g. 15000',
            )}
            {field('expectedClose', 'Expected closing date (optional)', { type: 'date' })}
            <FormField
              control={form.control}
              name="stageId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stage</FormLabel>
                  <FormControl>
                    <select
                      className={selectClass}
                      {...field}
                      onChange={(e) => {
                        field.onChange(e)
                        // A new stage brings its own probability, which can still be changed.
                        const next = stages.find((s) => s.id === e.target.value)
                        if (next) form.setValue('probability', String(next.probability))
                      }}
                    >
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {field(
              'probability',
              'Probability of winning (%)',
              { inputMode: 'numeric', disabled: closed },
              closed
                ? 'Fixed for won and lost deals'
                : 'Starts from the stage’s; change it if you know better',
            )}
          </CardContent>
        </Card>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  )
}
