import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import type { z } from 'zod'

import { getErrorMessage } from '@/api/client'
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
import { resetPassword } from '@/services/auth'
import { AuthCard } from './auth-card'
import { resetPasswordSchema } from './schemas'

type FormValues = z.infer<typeof resetPasswordSchema>

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const navigate = useNavigate()

  const form = useForm<FormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })
  const mutation = useMutation({
    mutationFn: (v: FormValues) => resetPassword(token!, v.password),
    onSuccess: (data) => {
      toast.success(data.message)
      navigate('/login', { replace: true })
    },
  })

  if (!token) {
    return (
      <AuthCard title="Invalid reset link" description="This link is missing its reset token.">
        <Link to="/forgot-password" className="text-sm underline">
          Request a new link
        </Link>
      </AuthCard>
    )
  }

  const passwordField = (name: 'password' | 'confirmPassword', label: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type="password" autoComplete="new-password" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <AuthCard title="Set a new password" description="Choose a new password for your account.">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="flex flex-col gap-4"
          noValidate
        >
          {mutation.isError && (
            <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {getErrorMessage(mutation.error)}{' '}
              <Link to="/forgot-password" className="underline">
                Request a new link
              </Link>
            </div>
          )}
          {passwordField('password', 'New password')}
          {passwordField('confirmPassword', 'Confirm password')}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Reset password'}
          </Button>
        </form>
      </Form>
    </AuthCard>
  )
}
