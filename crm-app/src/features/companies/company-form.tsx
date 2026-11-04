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
import { companySchema, emptyCompany, type CompanyFormValues } from './schemas'

export function CompanyForm<T>({
  defaultValues,
  submitLabel,
  save,
  onSaved,
  onCancel,
}: {
  defaultValues: CompanyFormValues
  submitLabel: string
  save: (values: CompanyFormValues) => Promise<T>
  onSaved: (result: T) => void
  onCancel: () => void
}) {
  const form = useForm<CompanyFormValues>({ resolver: zodResolver(companySchema), defaultValues })

  const mutation = useMutation({
    mutationFn: save,
    onSuccess: onSaved,
    onError: (error) => {
      const fields = getFieldErrors(error)
      for (const name of Object.keys(emptyCompany) as (keyof CompanyFormValues)[]) {
        if (fields[name]) form.setError(name, { message: fields[name] })
      }
    },
  })

  const field = (
    name: FieldPath<CompanyFormValues>,
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

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        className="space-y-4"
        noValidate
      >
        {mutation.isError && Object.keys(getFieldErrors(mutation.error)).length === 0 && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {getErrorMessage(mutation.error, 'Could not save the company')}
          </p>
        )}
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              {field('name', 'Company name', { autoComplete: 'off' })}
            </div>
            {field('industry', 'Industry (optional)')}
            {field('website', 'Website (optional)', { type: 'url' })}
            {field('employees', 'Employees (optional)', { inputMode: 'numeric' })}
            {field(
              'revenue',
              'Annual revenue in USD (optional)',
              { inputMode: 'decimal' },
              'Numbers only, e.g. 1250000',
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
