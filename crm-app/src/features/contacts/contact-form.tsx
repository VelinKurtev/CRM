import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useDeferredValue, useId, type ReactNode } from 'react'
import { useForm, type FieldPath } from 'react-hook-form'

import { getErrorMessage, getFieldErrors } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { searchCompanies } from '@/services/contacts'
import { contactSchema, emptyContact, type ContactFormValues } from './schemas'
import { TagInput } from './tag-input'

type TextField = Exclude<FieldPath<ContactFormValues>, 'tags'>

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  )
}

export function ContactForm<T>({
  defaultValues,
  showNote,
  submitLabel,
  save,
  onSaved,
  onCancel,
  extra,
}: {
  defaultValues: ContactFormValues
  /** The note box only exists when creating; later notes live on the contact (US-025). */
  showNote: boolean
  submitLabel: string
  save: (values: ContactFormValues) => Promise<T>
  onSaved: (result: T) => void
  onCancel: () => void
  /** Shown at the left of the button row, e.g. a delete button. */
  extra?: ReactNode
}) {
  const companyListId = useId()
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues,
  })

  const companyText = useDeferredValue(form.watch('company').trim())
  const { data: companies = [] } = useQuery({
    queryKey: ['company-suggestions', companyText],
    queryFn: () => searchCompanies(companyText),
    staleTime: 30_000,
  })

  const mutation = useMutation({
    mutationFn: save,
    onSuccess: onSaved,
    onError: (error) => {
      const fields = getFieldErrors(error)
      for (const name of Object.keys(emptyContact) as (keyof ContactFormValues)[]) {
        if (fields[name]) form.setError(name, { message: fields[name] })
      }
    },
  })

  const field = (
    name: TextField,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
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
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4"
          noValidate
        >
          {mutation.isError && Object.keys(getFieldErrors(mutation.error)).length === 0 && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {getErrorMessage(mutation.error, 'Could not save the contact')}
            </p>
          )}

          <Section title="Basics">
            {field('firstName', 'First name', { autoComplete: 'off' })}
            {field('lastName', 'Last name', { autoComplete: 'off' })}
            {field('email', 'Email (optional)', { type: 'email' })}
            {field('phone', 'Phone (optional)', { type: 'tel' })}
            {field('jobTitle', 'Job title (optional)')}
            <FormField
              control={form.control}
              name="company"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} list={companyListId} autoComplete="off" />
                  </FormControl>
                  <FormDescription>Pick an existing company or type a new one.</FormDescription>
                  <FormMessage />
                  <datalist id={companyListId}>
                    {companies.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </FormItem>
              )}
            />
          </Section>

          <Section title="Address">
            <div className="sm:col-span-2">{field('address', 'Street address (optional)')}</div>
            {field('city', 'City (optional)')}
            {field('postalCode', 'Postal code (optional)')}
            {field('country', 'Country (optional)')}
          </Section>

          <Section title="Social links" description="Full links, e.g. https://linkedin.com/in/name">
            <div className="sm:col-span-2">
              {field('linkedinUrl', 'LinkedIn (optional)', { type: 'url' })}
            </div>
            {field('twitterUrl', 'X / Twitter (optional)', { type: 'url' })}
            {field('facebookUrl', 'Facebook (optional)', { type: 'url' })}
          </Section>

          <Card>
            <CardHeader>
              <CardTitle>{showNote ? 'Tags and notes' : 'Tags'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags (optional)</FormLabel>
                    <FormControl>
                      <TagInput value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {showNote && (
                <FormField
                  control={form.control}
                  name="note"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Note (optional)</FormLabel>
                      <FormControl>
                        <Textarea rows={4} {...field} />
                      </FormControl>
                      <FormDescription>Saved as the first note on this contact.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-2">
            <div>{extra}</div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving…' : submitLabel}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </>
  )
}
