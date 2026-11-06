import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { getErrorMessage, getFieldErrors } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import type { ManagedPipeline } from '@/services/pipelines'

/** Ask for a pipeline's name: when creating one, or renaming it. */
export function PipelineNameDialog({
  open,
  onOpenChange,
  title,
  description,
  initial,
  submitLabel,
  save,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  initial: string
  submitLabel: string
  save: (name: string) => Promise<ManagedPipeline>
  onSaved: (pipeline: ManagedPipeline) => void
}) {
  const [name, setName] = useState(initial)
  const mutation = useMutation({
    mutationFn: () => save(name.trim()),
    onSuccess: (pipeline) => {
      onOpenChange(false)
      onSaved(pipeline)
    },
  })
  const problem = mutation.isError
    ? (getFieldErrors(mutation.error).name ?? getErrorMessage(mutation.error, 'Could not save'))
    : null

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) mutation.reset()
      }}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || name.trim() === ''}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Saving…' : submitLabel}
          </Button>
        </>
      }
    >
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) mutation.mutate()
        }}
      >
        <Label htmlFor="pipeline-name">Pipeline name</Label>
        <Input
          id="pipeline-name"
          value={name}
          maxLength={100}
          autoComplete="off"
          aria-invalid={problem ? true : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
      </form>
    </Modal>
  )
}

/** Confirm deleting a pipeline. */
export function DeletePipelineDialog({
  pipeline,
  onClose,
  remove,
  onDeleted,
}: {
  pipeline: ManagedPipeline | null
  onClose: () => void
  remove: (id: string) => Promise<void>
  onDeleted: () => void
}) {
  const mutation = useMutation({
    mutationFn: (id: string) => remove(id),
    onSuccess: () => {
      onClose()
      onDeleted()
    },
  })
  return (
    <Modal
      open={pipeline !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
          mutation.reset()
        }
      }}
      title="Delete this pipeline?"
      description="Its stages go with it. This cannot be undone."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Keep pipeline
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => pipeline && mutation.mutate(pipeline.id)}
          >
            {mutation.isPending ? 'Deleting…' : 'Delete pipeline'}
          </Button>
        </>
      }
    >
      {pipeline && <p className="text-sm font-medium">{pipeline.name}</p>}
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(mutation.error, 'Could not delete the pipeline')}
        </p>
      )}
    </Modal>
  )
}
