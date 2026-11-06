import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
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
import { Textarea } from '@/components/ui/textarea'
import { LEAD_PRIORITIES, LEAD_STATUSES } from '@/services/lead-options'
import { listLeadOwners } from '@/services/leads'
import {
  emptyLead,
  leadSchema,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type LeadFormValues,
} from './schemas'

const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30'

export function LeadForm<T>({
  defaultValues,
  submitLabel,
  noOwnerLabel,
  save,
  onSaved,
  onCancel,
}: {
  defaultValues: LeadFormValues
  submitLabel: string
  /** What an empty owner choice means: "Me" when creating, "Nobody" when editing. */
  noOwnerLabel: string
  save: (values: LeadFormValues) => Promise<T>
  onSaved: (result: T) => void
  onCancel: () => void
}) {
  const form = useForm<LeadFormValues>({ resolver: zodResolver(leadSchema), defaultValues })
  const owners = useQuery({ queryKey: ['lead-owners'], queryFn: listLeadOwners })

  const mutation = useMutation({
    mutationFn: save,
    onSuccess: onSaved,
    onError: (error) => {
      const fields = getFieldErrors(error)
      for (const name of Object.keys(emptyLead()) as (keyof LeadFormValues)[]) {
        if (fields[name]) form.setError(name, { message: fields[name] })
      }
    },
  })

  const field = (
    name: FieldPath<LeadFormValues>,
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
            <Input {...props} {...field} />
          </FormControl>
          {hint && <FormDescription>{hint}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )

  const choice = (
    name: FieldPath<LeadFormValues>,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <select className={selectClass} {...field}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FormControl>
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
            {getErrorMessage(mutation.error, 'Could not save the lead')}
          </p>
        )}
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{field('title', 'Title', { autoComplete: 'off' })}</div>
            {field('source', 'Source (optional)', {}, 'Where it came from, e.g. Website, Referral')}
            {field(
              'value',
              'Estimated value in USD (optional)',
              { inputMode: 'decimal' },
              'Numbers only, e.g. 15000',
            )}
            {choice(
              'priority',
              'Priority',
              LEAD_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })),
            )}
            {choice(
              'status',
              'Status',
              LEAD_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
            )}
            <div className="sm:col-span-2">
              {choice('ownerId', 'Owner', [
                { value: '', label: noOwnerLabel },
                ...(owners.data ?? []).map((o) => ({
                  value: o.id,
                  label: `${o.firstName} ${o.lastName}`,
                })),
              ])}
            </div>
            <div className="sm:col-span-2">
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea rows={4} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
