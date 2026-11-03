import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataPagination } from '@/components/ui/data-pagination'
import { DatePicker } from '@/components/ui/date-picker'
import { EmptyState } from '@/components/ui/empty-state'
import { Filters } from '@/components/ui/filters'
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
import { SearchInput } from '@/components/ui/search-input'
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

const schema = z.object({ name: z.string().min(2, 'Name must be at least 2 characters') })

export function ComponentsPage() {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [date, setDate] = useState<Date>()
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Record<string, string | undefined>>({})
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  })

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Component library</h1>

      <Card>
        <CardHeader>
          <CardTitle>Buttons, badges, avatar</CardTitle>
          <CardDescription>Basic building blocks</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="destructive">Delete</Button>
          <Badge>New</Badge>
          <Badge variant="secondary">Qualified</Badge>
          <Avatar>
            <AvatarFallback>VK</AvatarFallback>
          </Avatar>
          <Button variant="outline" onClick={() => setOpen(true)}>
            Open modal
          </Button>
          <Button variant="outline" onClick={() => toast.success('Saved')}>
            Show toast
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Form</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((v) => toast.success(`Hello ${v.name}`))}
              className="flex max-w-sm flex-col gap-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DatePicker value={date} onChange={setDate} />
              <Button type="submit">Submit</Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Table</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <SearchInput value={query} onSearch={setQuery} className="w-64" />
            <Filters
              filters={[
                {
                  key: 'status',
                  label: 'Status',
                  options: [
                    { value: 'new', label: 'New' },
                    { value: 'won', label: 'Won' },
                  ],
                },
              ]}
              values={filters}
              onChange={setFilters}
            />
          </div>
          <Tabs defaultValue="data">
            <TabsList>
              <TabsTrigger value="data">Data</TabsTrigger>
              <TabsTrigger value="loading">Loading</TabsTrigger>
              <TabsTrigger value="empty">Empty</TabsTrigger>
            </TabsList>
            <TabsContent value="data">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Acme Inc</TableCell>
                    <TableCell>
                      <Badge>{filters.status ?? 'new'}</Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <DataPagination page={page} pageCount={10} onPageChange={setPage} />
            </TabsContent>
            <TabsContent value="loading" className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </TabsContent>
            <TabsContent value="empty">
              <EmptyState
                title="No contacts yet"
                description="Add your first contact to get started."
                action={<Button>Add contact</Button>}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Confirm"
        description="This is a reusable modal."
        footer={<Button onClick={() => setOpen(false)}>Close</Button>}
      />
    </main>
  )
}
