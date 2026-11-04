import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { getErrorMessage } from '@/api/client'
import { DetailSection, EmptyNote } from '@/components/detail-section'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { usePermission } from '@/hooks/use-permission'
import { addNote, deleteNote, updateNote, type Note, type NoteTarget } from '@/services/notes'
import { useAuthStore } from '@/store/auth-store'
import { formatDate } from '@/utils/format-date'

const MAX = 5000

type Props = {
  target: NoteTarget
  notes: { total: number; items: Note[] }
  /** The page's query, refreshed after every change. */
  queryKey: QueryKey
  /** What to say when there are none, e.g. "No notes on this contact yet." */
  emptyText: string
}

/** Edited more than a moment after it was written. */
const wasEdited = (n: Note) =>
  new Date(n.updatedAt).getTime() - new Date(n.createdAt).getTime() > 1000

function NoteEditor({
  initial,
  label,
  submitLabel,
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  initial: string
  label: string
  submitLabel: string
  onSubmit: (body: string) => void
  onCancel?: () => void
  pending: boolean
  error: unknown
}) {
  const [text, setText] = useState(initial)
  const blank = text.trim() === ''
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!blank && !pending) onSubmit(text.trim())
      }}
    >
      <Textarea
        aria-label={label}
        rows={3}
        value={text}
        maxLength={MAX}
        placeholder={
          label === 'Add a note' ? 'Preferences, budget, anything worth remembering…' : undefined
        }
        onChange={(e) => setText(e.target.value)}
      />
      {error != null && (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(error, 'Could not save the note')}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={blank || pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

/** Notes on a contact or company: read, add, and edit or delete where allowed. */
export function NotesSection({ target, notes, queryKey, emptyText }: Props) {
  const queryClient = useQueryClient()
  const me = useAuthStore((s) => s.user?.id)
  const canWrite = usePermission('notes:write')
  const canDeleteAny = usePermission('notes:delete')
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Note | null>(null)
  const [fresh, setFresh] = useState(0) // bumped after an add, to empty the box
  const refresh = () => queryClient.invalidateQueries({ queryKey })

  const add = useMutation({
    mutationFn: (body: string) => addNote(target, body),
    onSuccess: () => {
      toast.success('Note added')
      setFresh((n) => n + 1)
      void refresh()
    },
  })
  const save = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => updateNote(id, body),
    onSuccess: () => {
      toast.success('Note saved')
      setEditing(null)
      void refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteNote(id),
    onSuccess: () => {
      toast.success('Note deleted')
      setDeleting(null)
      void refresh()
    },
  })

  return (
    <DetailSection title="Notes" total={notes.total} shown={notes.items.length}>
      {canWrite && (
        // Remounting after a successful add clears the box.
        <NoteEditor
          key={fresh}
          initial=""
          label="Add a note"
          submitLabel="Add note"
          onSubmit={(body) => add.mutate(body)}
          pending={add.isPending}
          error={add.error}
        />
      )}
      {notes.items.length === 0 ? (
        <EmptyNote>{emptyText}</EmptyNote>
      ) : (
        <ul className="space-y-3">
          {notes.items.map((n) => {
            const mine = n.author.id === me
            const mayEdit = canWrite && mine
            const mayDelete = canDeleteAny || (canWrite && mine)
            return (
              <li key={n.id} className="rounded-md border p-3">
                {editing === n.id ? (
                  <NoteEditor
                    initial={n.body}
                    label="Edit note"
                    submitLabel="Save"
                    onSubmit={(body) => save.mutate({ id: n.id, body })}
                    onCancel={() => {
                      setEditing(null)
                      save.reset()
                    }}
                    pending={save.isPending}
                    error={save.error}
                  />
                ) : (
                  <>
                    <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {n.author.firstName} {n.author.lastName} · {formatDate(n.createdAt)}
                        {wasEdited(n) && ' · edited'}
                      </p>
                      <div className="flex gap-1">
                        {mayEdit && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Edit note"
                            onClick={() => {
                              save.reset()
                              setEditing(n.id)
                            }}
                          >
                            <Pencil />
                          </Button>
                        )}
                        {mayDelete && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Delete note"
                            onClick={() => setDeleting(n)}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Modal
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null)
            remove.reset()
          }
        }}
        title="Delete this note?"
        description="This cannot be undone."
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Keep note
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting.id)}
            >
              {remove.isPending ? 'Deleting…' : 'Delete note'}
            </Button>
          </>
        }
      >
        {deleting && (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{deleting.body}</p>
        )}
        {remove.isError && (
          <p role="alert" className="text-sm text-destructive">
            {getErrorMessage(remove.error, 'Could not delete the note')}
          </p>
        )}
      </Modal>
    </DetailSection>
  )
}
