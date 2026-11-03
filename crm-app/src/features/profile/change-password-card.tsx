import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { getErrorMessage, getFieldErrors } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { changePassword } from '@/services/auth'
import { useAuthStore } from '@/store/auth-store'
import { changePasswordSchema, type ChangePasswordValues } from './schemas'

const empty: ChangePasswordValues = { currentPassword: '', newPassword: '', confirmPassword: '' }

export function ChangePasswordCard() {
  const setSession = useAuthStore((s) => s.setSession)
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: empty,
  })

  const mutation = useMutation({
    mutationFn: (v: ChangePasswordValues) => changePassword(v.currentPassword, v.newPassword),
    onSuccess: ({ token, user }) => {
      // Other devices were signed out; this one continues on the fresh session.
      setSession(token, user)
      form.reset(empty)
      toast.success('Password changed. Other devices have been signed out.')
    },
    onError: (error) => {
      const fields = getFieldErrors(error)
      for (const name of ['currentPassword', 'newPassword'] as const) {
        if (fields[name]) form.setError(name, { message: fields[name] })
      }
    },
  })

  const field = (name: keyof ChangePasswordValues, label: string, autoComplete: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type="password" autoComplete={autoComplete} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>
          You'll stay signed in here; other devices will be signed out.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="flex flex-col gap-4"
            noValidate
          >
            {mutation.isError && Object.keys(getFieldErrors(mutation.error)).length === 0 && (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {getErrorMessage(mutation.error, 'Unable to change password')}
              </p>
            )}
            {field('currentPassword', 'Current password', 'current-password')}
            {field('newPassword', 'New password', 'new-password')}
            {field('confirmPassword', 'Confirm new password', 'new-password')}
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Changing…' : 'Change password'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
