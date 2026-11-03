import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { getErrorMessage } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataPagination } from '@/components/ui/data-pagination'
import { EmptyState } from '@/components/ui/empty-state'
import { SearchInput } from '@/components/ui/search-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { assignRole, listRoles, listUsers } from '@/services/users'
import { useAuthStore } from '@/store/auth-store'
import { groupPermissions, ROLE_LABELS, ROLE_OPTIONS } from './roles'

const PAGE_SIZE = 10

function UsersTab() {
  const me = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['users', { q, page }],
    queryFn: () => listUsers({ q: q || undefined, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  const mutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => assignRole(id, role),
    onSuccess: (user) => {
      toast.success(`${user.firstName} ${user.lastName} is now ${ROLE_LABELS[user.role]}`)
      void queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Could not change role')),
  })

  return (
    <div className="space-y-4">
      <SearchInput
        value={q}
        onSearch={(v) => {
          setQ(v)
          setPage(1)
        }}
        placeholder="Search by name or email…"
        className="max-w-sm"
      />

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(error, 'Could not load users')}
        </p>
      ) : isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : data.users.length === 0 ? (
        <EmptyState title="No users found" description="Try a different search." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-44">Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map((u) => {
                const isMe = u.id === me?.id
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.firstName} {u.lastName}
                      {isMe && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? 'secondary' : 'outline'}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        disabled={isMe || mutation.isPending}
                        onValueChange={(role) => mutation.mutate({ id: u.id, role })}
                      >
                        <SelectTrigger
                          aria-label={`Role for ${u.firstName} ${u.lastName}`}
                          className="w-36"
                          title={isMe ? 'You cannot change your own role' : undefined}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <DataPagination
            page={page}
            pageCount={Math.max(1, Math.ceil(data.total / data.pageSize))}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}

function RolesTab() {
  const { data, isPending, isError } = useQuery({ queryKey: ['roles'], queryFn: listRoles })

  if (isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load roles
      </p>
    )
  if (isPending) return <Skeleton className="h-40 w-full" />

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.map((role) => (
        <Card key={role.name}>
          <CardHeader>
            <CardTitle>{ROLE_LABELS[role.name] ?? role.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {Object.entries(groupPermissions(role.permissions)).map(([resource, actions]) => (
              <div key={resource} className="flex items-center justify-between gap-2">
                <span className="capitalize">{resource}</span>
                <span className="flex gap-1">
                  {actions.map((a) => (
                    <Badge key={a} variant="secondary">
                      {a}
                    </Badge>
                  ))}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function UsersPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">Users & roles</h1>
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles & permissions</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="pt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="roles" className="pt-4">
          <RolesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
