import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { getErrorMessage, getFieldErrors } from '@/api/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
import { updateProfile } from '@/services/auth'
import { useAuthStore } from '@/store/auth-store'
import { ChangePasswordCard } from './change-password-card'
import { profileSchema, type ProfileValues } from './schemas'

const initials = (first = '', last = '') => `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase()

export function ProfilePage() {
  const user = useAuthStore((s) => s.user)!
  const token = useAuthStore((s) => s.token)!
  const setSession = useAuthStore((s) => s.setSession)

  const values: ProfileValues = {
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl ?? '',
  }
  const form = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), values })

  // Preview whatever URL is in the field; initials show if it is empty or fails to load.
  const avatarPreview = form.watch('avatarUrl')?.trim()

  const mutation = useMutation({
    mutationFn: (v: ProfileValues) => updateProfile(v),
    onSuccess: (updated) => {
      setSession(token, updated)
      toast.success('Profile updated')
    },
    onError: (error) => {
      const fields = getFieldErrors(error)
      for (const name of ['firstName', 'lastName', 'avatarUrl'] as const) {
        if (fields[name]) form.setError(name, { message: fields[name] })
      }
    },
  })

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardHeader className="flex-row items-center gap-4">
          <Avatar className="size-16">
            {avatarPreview && <AvatarImage src={avatarPreview} alt="" />}
            <AvatarFallback>{initials(user.firstName, user.lastName)}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle>My profile</CardTitle>
            <CardDescription className="mt-1 flex items-center gap-2">
              {user.email} <Badge variant="secondary">{user.role}</Badge>
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
              className="flex flex-col gap-4"
              noValidate
            >
              {mutation.isError && Object.keys(getFieldErrors(mutation.error)).length === 0 && (
                <p
                  role="alert"
                  className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {getErrorMessage(mutation.error, 'Unable to update profile')}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First name</FormLabel>
                      <FormControl>
                        <Input autoComplete="given-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last name</FormLabel>
                      <FormControl>
                        <Input autoComplete="family-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="profile-email" className="text-sm font-medium">
                  Email
                </label>
                <Input id="profile-email" value={user.email} disabled readOnly />
                <p className="text-sm text-muted-foreground">
                  Your email and role are managed by an administrator.
                </p>
              </div>
              <FormField
                control={form.control}
                name="avatarUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Avatar URL</FormLabel>
                    <FormControl>
                      <Input type="url" placeholder="https://…" {...field} />
                    </FormControl>
                    <FormDescription>Optional. Leave empty to use your initials.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={mutation.isPending || !form.formState.isDirty}>
                {mutation.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <ChangePasswordCard />
    </div>
  )
}
