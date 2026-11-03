import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import type { z } from 'zod'

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
import { register } from '@/services/auth'
import { useAuthStore } from '@/store/auth-store'
import { registerSchema } from './schemas'

type FormValues = z.infer<typeof registerSchema>

export function RegisterPage() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const setSession = useAuthStore((s) => s.setSession)

  const form = useForm<FormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', confirmPassword: '' },
  })

  const mutation = useMutation({
    mutationFn: ({ confirmPassword: _confirm, ...input }: FormValues) => register(input),
    onSuccess: ({ token, user }) => {
      setSession(token, user)
      navigate('/dashboard', { replace: true })
    },
    onError: (error) => {
      // Show server-side field errors (e.g. duplicate email) next to the field.
      const fields = getFieldErrors(error)
      let handled = false
      for (const name of ['firstName', 'lastName', 'email', 'password'] as const) {
        if (fields[name]) {
          form.setError(name, { message: fields[name] })
          handled = true
        }
      }
      if (handled) mutation.reset()
    },
  })

  if (token) return <Navigate to="/dashboard" replace />

  const textField = (
    name: 'firstName' | 'lastName' | 'email' | 'password' | 'confirmPassword',
    label: string,
    props: React.ComponentProps<'input'> = {},
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
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>Register to request access to the CRM.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
              className="flex flex-col gap-4"
              noValidate
            >
              {mutation.isError && (
                <p
                  role="alert"
                  className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {getErrorMessage(mutation.error, 'Unable to register')}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                {textField('firstName', 'First name', { autoComplete: 'given-name' })}
                {textField('lastName', 'Last name', { autoComplete: 'family-name' })}
              </div>
              {textField('email', 'Email', { type: 'email', autoComplete: 'username' })}
              {textField('password', 'Password', {
                type: 'password',
                autoComplete: 'new-password',
              })}
              {textField('confirmPassword', 'Confirm password', {
                type: 'password',
                autoComplete: 'new-password',
              })}
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Creating account…' : 'Create account'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="text-foreground underline">
                  Sign in
                </Link>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  )
}
