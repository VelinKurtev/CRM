import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
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
import { forgotPassword } from '@/services/auth'
import { AuthCard } from './auth-card'
import { forgotPasswordSchema } from './schemas'

type FormValues = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordPage() {
  const form = useForm<FormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })
  const mutation = useMutation({ mutationFn: (v: FormValues) => forgotPassword(v.email) })

  return (
    <AuthCard
      title="Forgot your password?"
      description="Enter your email and we'll send you a link to reset it."
    >
      {mutation.isSuccess ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="rounded-md bg-muted p-3 text-sm">
            {mutation.data.message}
          </p>
          <Link to="/login" className="text-center text-sm underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="flex flex-col gap-4"
            noValidate
          >
            {mutation.isError && (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {getErrorMessage(mutation.error)}
              </p>
            )}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="username" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Sending…' : 'Send reset link'}
            </Button>
            <Link to="/login" className="text-center text-sm text-muted-foreground underline">
              Back to sign in
            </Link>
          </form>
        </Form>
      )}
    </AuthCard>
  )
}
