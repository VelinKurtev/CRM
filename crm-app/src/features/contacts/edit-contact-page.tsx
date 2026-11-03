import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Trash2, UserX } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { Skeleton } from '@/components/ui/skeleton'
import { deleteContact, getContact, updateContact, type ContactDetail } from '@/services/contacts'
import { ContactForm } from './contact-form'
import { fromContact, toContactUpdate } from './schemas'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What deleting will do, in words: only the parts that apply. */
function consequences(r: ContactDetail['related']) {
  const removed = [
    r.notes && plural(r.notes, 'note'),
    r.tasks && plural(r.tasks, 'task'),
    r.activities && plural(r.activities, 'activity', 'activities'),
  ].filter(Boolean)
  const kept = [r.deals && plural(r.deals, 'deal'), r.leads && plural(r.leads, 'lead')].filter(
    Boolean,
  )
  return [
    removed.length > 0 && `This also deletes its ${removed.join(', ')}.`,
    kept.length > 0 && `Its ${kept.join(' and ')} will stay but lose the link to this contact.`,
  ].filter(Boolean) as string[]
}

function DeleteContactButton({ contact }: { contact: ContactDetail }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const name = `${contact.firstName} ${contact.lastName}`

  const mutation = useMutation({
    mutationFn: () => deleteContact(contact.id),
    onSuccess: () => {
      toast.success(`${name} was deleted`)
      queryClient.removeQueries({ queryKey: ['contact', contact.id] })
      // Their tasks and activity may have been on the dashboard.
      void queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith('dashboard'),
      })
      navigate('/dashboard')
    },
  })

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 /> Delete contact
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) mutation.reset()
        }}
        title={`Delete ${name}?`}
        description="This cannot be undone."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep contact
            </Button>
            <Button
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Deleting…' : 'Delete contact'}
            </Button>
          </>
        }
      >
        {mutation.isError && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {getErrorMessage(mutation.error, 'Could not delete the contact')}
          </p>
        )}
        {consequences(contact.related).map((line) => (
          <p key={line} className="text-sm text-muted-foreground">
            {line}
          </p>
        ))}
      </Modal>
    </>
  )
}

export function EditContactPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['contact', id],
    queryFn: () => getContact(id),
    retry: false,
  })

  if (isPending) return <Skeleton className="mx-auto h-96 max-w-3xl" aria-label="Loading contact" />

  if (isError) {
    const missing = axios.isAxiosError(error) && error.response?.status === 404
    return (
      <EmptyState
        icon={<UserX className="size-10" />}
        title={missing ? 'Contact not found' : 'Could not load the contact'}
        description={
          missing ? 'It may have been deleted.' : getErrorMessage(error, 'Please try again.')
        }
        action={
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Back to dashboard
          </Button>
        }
      />
    )
  }

  const name = `${data.firstName} ${data.lastName}`
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Edit {name}</h1>
        <p className="text-muted-foreground">Clear a field to remove its value.</p>
      </div>
      <ContactForm
        defaultValues={fromContact(data)}
        showNote={false}
        submitLabel="Save changes"
        save={(values) => updateContact(id, toContactUpdate(values))}
        onSaved={(contact) => {
          toast.success(`${contact.firstName} ${contact.lastName} was updated`)
          void queryClient.invalidateQueries({ queryKey: ['contact', id] })
          navigate('/dashboard')
        }}
        onCancel={() => navigate(-1)}
        extra={data.canDelete ? <DeleteContactButton contact={data} /> : undefined}
      />
    </div>
  )
}
