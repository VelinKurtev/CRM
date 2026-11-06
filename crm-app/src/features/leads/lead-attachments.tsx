import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Paperclip, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { getErrorMessage } from '@/api/client'
import { DetailSection, EmptyNote } from '@/components/detail-section'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import {
  deleteLeadAttachment,
  downloadLeadAttachment,
  listLeadAttachments,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_LEAD,
  uploadLeadAttachment,
  type LeadAttachment,
} from '@/services/leads'
import { formatDate } from '@/utils/format-date'
import { saveBlob } from '@/utils/download'
import { formatBytes } from '@/utils/format-bytes'

/** The files attached to a lead: add, download and remove. */
export function LeadAttachments({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [removing, setRemoving] = useState<LeadAttachment | null>(null)
  const [problems, setProblems] = useState<string[]>([])

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['lead', leadId, 'attachments'],
    queryFn: () => listLeadAttachments(leadId),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['lead', leadId, 'attachments'] })
    void queryClient.invalidateQueries({ queryKey: ['leads'] })
  }

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const failed: string[] = []
      let added = 0
      // One at a time, so a bad file does not stop the others.
      for (const file of files) {
        if (file.size === 0) failed.push(`${file.name}: the file is empty`)
        else if (file.size > MAX_ATTACHMENT_BYTES) {
          failed.push(`${file.name}: files can be up to ${formatBytes(MAX_ATTACHMENT_BYTES)}`)
        } else {
          try {
            await uploadLeadAttachment(leadId, file)
            added++
          } catch (e) {
            failed.push(`${file.name}: ${getErrorMessage(e, 'could not be added')}`)
          }
        }
      }
      return { added, failed }
    },
    onSuccess: ({ added, failed }) => {
      setProblems(failed)
      if (added) toast.success(added === 1 ? 'File added' : `${added} files added`)
      refresh()
    },
  })

  const download = useMutation({
    mutationFn: async (file: LeadAttachment) =>
      saveBlob(await downloadLeadAttachment(leadId, file.id), file.name),
    onError: (e) => toast.error(getErrorMessage(e, 'Could not download the file')),
  })

  const remove = useMutation({
    mutationFn: (file: LeadAttachment) => deleteLeadAttachment(leadId, file.id),
    onSuccess: () => {
      toast.success('File removed')
      setRemoving(null)
      refresh()
    },
  })

  const files = data ?? []
  const full = files.length >= MAX_ATTACHMENTS_PER_LEAD

  return (
    <DetailSection title="Attachments" total={files.length} shown={files.length}>
      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(error, 'Could not load the attachments')}
        </p>
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : files.length === 0 ? (
        <EmptyNote>
          No files yet. Attach proposals, quotes or anything else about this lead.
        </EmptyNote>
      ) : (
        <ul className="divide-y rounded-md border">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 p-3">
              <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{f.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(f.sizeBytes)} · {f.uploadedBy.firstName} {f.uploadedBy.lastName} ·{' '}
                  {formatDate(f.createdAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Download ${f.name}`}
                disabled={download.isPending}
                onClick={() => download.mutate(f)}
              >
                <Download /> Download
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${f.name}`}
                onClick={() => setRemoving(f)}
              >
                <Trash2 /> Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-destructive">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label="Choose files to attach"
          onChange={(e) => {
            const picked = [...(e.target.files ?? [])]
            e.target.value = ''
            if (picked.length) {
              setProblems([])
              upload.mutate(picked)
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={upload.isPending || full}
          onClick={() => input.current?.click()}
        >
          <Upload /> {upload.isPending ? 'Uploading…' : 'Add files'}
        </Button>
        <p className="text-xs text-muted-foreground">
          {full
            ? `A lead can have up to ${MAX_ATTACHMENTS_PER_LEAD} files.`
            : `Up to ${formatBytes(MAX_ATTACHMENT_BYTES)} each.`}
        </p>
      </div>

      <Modal
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null)
            remove.reset()
          }
        }}
        title="Remove this file?"
        description="It will be deleted from the lead. This cannot be undone."
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Keep file
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => removing && remove.mutate(removing)}
            >
              {remove.isPending ? 'Removing…' : 'Remove file'}
            </Button>
          </>
        }
      >
        {removing && <p className="text-sm font-medium break-all">{removing.name}</p>}
        {remove.isError && (
          <p role="alert" className="text-sm text-destructive">
            {getErrorMessage(remove.error, 'Could not remove the file')}
          </p>
        )}
      </Modal>
    </DetailSection>
  )
}
