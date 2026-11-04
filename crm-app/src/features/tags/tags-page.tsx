import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Tag, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
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
import { deleteTag, listTagDetails, updateTag, type TagDetail } from '@/services/contacts'
import { TagBadge } from './tag-badge'

const NO_COLOR_PICKED = '#6b7280' // what the picker shows while "No colour" is on

function useRefreshTags() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['tag-details'] })
    void queryClient.invalidateQueries({ queryKey: ['tag-suggestions'] })
    void queryClient.invalidateQueries({ queryKey: ['contacts'] })
  }
}

function EditTagDialog({ tag, onClose }: { tag: TagDetail; onClose: () => void }) {
  const refresh = useRefreshTags()
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState<string | null>(tag.color)

  const mutation = useMutation({
    mutationFn: () => updateTag(tag.id, { name: name.trim(), color }),
    onSuccess: () => {
      toast.success('Tag saved')
      refresh()
      onClose()
    },
  })
  const nameTaken = mutation.isError && /already exists/i.test(getErrorMessage(mutation.error, ''))
  const blank = name.trim() === ''

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Edit tag"
      description={
        tag.usageCount > 0
          ? `Changes apply to all ${tag.usageCount} ${tag.usageCount === 1 ? 'record' : 'records'} that use this tag.`
          : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={blank || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!blank && !mutation.isPending) mutation.mutate()
        }}
      >
        <div className="space-y-2">
          <label htmlFor="tag-name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="tag-name"
            value={name}
            maxLength={50}
            aria-invalid={nameTaken}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="tag-color" className="text-sm font-medium">
            Colour
          </label>
          <div className="flex items-center gap-3">
            <input
              id="tag-color"
              type="color"
              value={color ?? NO_COLOR_PICKED}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded border bg-transparent p-1"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={color === null}
                onChange={(e) => setColor(e.target.checked ? null : NO_COLOR_PICKED)}
              />
              No colour
            </label>
            <TagBadge name={name.trim() || 'Preview'} color={color} />
          </div>
        </div>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {nameTaken
              ? 'Another tag already has this name.'
              : getErrorMessage(mutation.error, 'Could not save the tag')}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function DeleteTagDialog({ tag, onClose }: { tag: TagDetail; onClose: () => void }) {
  const refresh = useRefreshTags()
  const mutation = useMutation({
    mutationFn: () => deleteTag(tag.id),
    onSuccess: () => {
      toast.success(`Deleted tag “${tag.name}”`)
      refresh()
      onClose()
    },
  })
  const records = `${tag.usageCount} ${tag.usageCount === 1 ? 'record' : 'records'}`

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Delete “${tag.name}”?`}
      description={
        tag.usageCount === 0
          ? 'No record uses this tag.'
          : `It will be removed from ${records}. The contacts and other records themselves are kept.`
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Deleting…' : 'Delete tag'}
          </Button>
        </>
      }
    >
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(mutation.error, 'Could not delete the tag')}
        </p>
      )}
    </Modal>
  )
}

export function TagsPage() {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<TagDetail | null>(null)
  const [deleting, setDeleting] = useState<TagDetail | null>(null)
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['tag-details', q],
    queryFn: () => listTagDetails(q),
  })

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Tags</h1>
        <p className="text-sm text-muted-foreground">
          Rename, recolour or delete tags. Changes apply everywhere a tag is used.
        </p>
      </div>
      <SearchInput value={q} onSearch={setQ} placeholder="Find a tag…" className="max-w-sm" />

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(error, 'Could not load tags')}
        </p>
      ) : isPending ? (
        <div className="space-y-2" aria-label="Loading tags">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={<Tag className="size-10" />}
          title={q ? 'No tags match' : 'No tags yet'}
          description={
            q
              ? 'Try a different search.'
              : 'Tags you add to contacts will show up here, ready to rename or recolour.'
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tag</TableHead>
              <TableHead>Contacts</TableHead>
              <TableHead>All records</TableHead>
              <TableHead className="w-24">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <TagBadge name={t.name} color={t.color} />
                </TableCell>
                <TableCell>
                  {t.contactCount > 0 ? (
                    <Link
                      to={`/contacts?tag=${encodeURIComponent(t.name)}`}
                      className="hover:underline"
                    >
                      {t.contactCount}
                    </Link>
                  ) : (
                    0
                  )}
                </TableCell>
                <TableCell>{t.usageCount}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit tag ${t.name}`}
                      onClick={() => setEditing(t)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete tag ${t.name}`}
                      onClick={() => setDeleting(t)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing && <EditTagDialog tag={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteTagDialog tag={deleting} onClose={() => setDeleting(null)} />}
    </div>
  )
}
