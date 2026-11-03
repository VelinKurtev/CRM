import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { getErrorMessage, getFieldErrors } from '@/api/client'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { createRecord } from '@/services/records'
import type { QuickAction } from './actions'

export function QuickCreateDialog({
  action,
  open,
  onOpenChange,
}: {
  action: QuickAction
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const empty = Object.fromEntries(action.fields.map((f) => [f.name, '']))
  const form = useForm<Record<string, string>>({
    resolver: zodResolver(action.schema),
    defaultValues: empty,
  })

  const mutation = useMutation({
    mutationFn: (values: Record<string, string>) =>
      createRecord(action.type, action.toBody(values)),
    onSuccess: () => {
      toast.success(`${action.type[0].toUpperCase()}${action.type.slice(1)} created`)
      // The new record may change any dashboard figure.
      void queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith('dashboard'),
      })
      form.reset(empty)
      onOpenChange(false)
    },
    onError: (error) => {
      const fields = getFieldErrors(error)
      for (const f of action.fields) {
        if (fields[f.name]) form.setError(f.name, { message: fields[f.name] })
      }
    },
  })

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          form.reset(empty)
          mutation.reset()
        }
        onOpenChange(next)
      }}
      title={action.label}
      description="Add the essentials now; you can fill in the rest later."
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="flex flex-col gap-4"
          noValidate
        >
          {mutation.isError && Object.keys(getFieldErrors(mutation.error)).length === 0 && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {getErrorMessage(mutation.error, 'Could not save')}
            </p>
          )}
          {action.fields.map((f) => (
            <FormField
              key={f.name}
              control={form.control}
              name={f.name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{f.label}</FormLabel>
                  <FormControl>
                    <Input
                      type={f.type ?? 'text'}
                      placeholder={f.placeholder}
                      step={f.type === 'number' ? '0.01' : undefined}
                      min={f.type === 'number' ? 0 : undefined}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Create'}
            </Button>
          </div>
        </form>
      </Form>
    </Modal>
  )
}
