import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { TagInput } from '@/features/contacts/tag-input'
import { bulkTagContacts } from '@/services/contacts'

type Props = {
  mode: 'add' | 'remove'
  contactIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after the tags were changed. */
  onDone: () => void
}

/** Add tags to, or remove tags from, every selected contact. */
export function BulkTagDialog({ mode, contactIds, open, onOpenChange, onDone }: Props) {
  const queryClient = useQueryClient()
  const [tags, setTags] = useState<string[]>([])
  const count = contactIds.length
  const people = `${count} ${count === 1 ? 'contact' : 'contacts'}`

  const mutation = useMutation({
    mutationFn: () =>
      bulkTagContacts({ contactIds, ...(mode === 'add' ? { add: tags } : { remove: tags }) }),
    onSuccess: ({ updated, skipped }) => {
      const done = `${mode === 'add' ? 'Tagged' : 'Untagged'} ${updated} ${updated === 1 ? 'contact' : 'contacts'}`
      toast.success(skipped ? `${done} (${skipped} no longer exist)` : done)
      void queryClient.invalidateQueries({ queryKey: ['contacts'] })
      void queryClient.invalidateQueries({ queryKey: ['tag-details'] })
      void queryClient.invalidateQueries({ queryKey: ['tag-suggestions'] })
      close(false)
      onDone()
    },
  })

  const close = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      setTags([])
      mutation.reset()
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title={mode === 'add' ? `Add tags to ${people}` : `Remove tags from ${people}`}
      description={
        mode === 'add'
          ? 'New tags are created. Tags a contact already has are left as they are.'
          : 'Contacts without a tag are left as they are.'
      }
      footer={
        <>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            disabled={tags.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Saving…' : mode === 'add' ? 'Add tags' : 'Remove tags'}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <label htmlFor="bulk-tags" className="text-sm font-medium">
          Tags
        </label>
        <TagInput id="bulk-tags" value={tags} onChange={setTags} />
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {getErrorMessage(mutation.error, 'Could not update the tags')}
          </p>
        )}
      </div>
    </Modal>
  )
}
