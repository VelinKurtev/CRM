import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { getErrorMessage, getFieldErrors } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import type { ManagedPipeline, ManagedStage, StageInput, StageKind } from '@/services/pipelines'
import { kindOf, KIND_LABELS } from './stage-rules'

const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30'

/** Add a stage, or change one (when `stage` is given). */
export function StageDialog({
  open,
  onOpenChange,
  stage,
  isFirst,
  save,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  stage: ManagedStage | null
  /** The first stage has to stay open: new deals start there. */
  isFirst: boolean
  save: (input: StageInput) => Promise<ManagedPipeline>
  onSaved: (pipeline: ManagedPipeline) => void
}) {
  const [name, setName] = useState(stage?.name ?? '')
  const [kind, setKind] = useState<StageKind>(stage ? kindOf(stage) : 'open')
  const [probability, setProbability] = useState(String(stage?.probability ?? 50))
  const [invalid, setInvalid] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (input: StageInput) => save(input),
    onSuccess: (pipeline) => {
      onOpenChange(false)
      onSaved(pipeline)
    },
  })
  const fields = mutation.isError ? getFieldErrors(mutation.error) : {}
  const general =
    mutation.isError && Object.keys(fields).length === 0
      ? getErrorMessage(mutation.error, 'Could not save the stage')
      : null

  const closed = kind !== 'open'
  const submit = () => {
    if (!name.trim()) return setInvalid('Name is required')
    if (!closed && !/^\d+$/.test(probability.trim()))
      return setInvalid('Enter a whole number from 0 to 100')
    if (!closed && Number(probability) > 100) return setInvalid('Probability cannot be above 100')
    setInvalid(null)
    mutation.mutate({
      name: name.trim(),
      kind,
      ...(closed ? {} : { probability: Number(probability) }),
    })
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) mutation.reset()
      }}
      title={stage ? `Edit ${stage.name}` : 'Add a stage'}
      description={
        stage
          ? 'Changing a stage between open, won and lost also updates the deals in it.'
          : 'Open stages go before the closed ones at the end, and can be moved afterwards.'
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending} onClick={submit}>
            {mutation.isPending ? 'Saving…' : stage ? 'Save stage' : 'Add stage'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="stage-name">Stage name</Label>
          <Input
            id="stage-name"
            value={name}
            maxLength={100}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
          {fields.name && <p className="text-sm text-destructive">{fields.name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stage-kind">Type</Label>
          <select
            id="stage-kind"
            className={selectClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as StageKind)}
          >
            {(['open', 'won', 'lost'] as const).map((k) => (
              <option key={k} value={k} disabled={isFirst && k !== 'open'}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {isFirst
              ? 'The first stage must be open: new deals start there.'
              : 'Deals in a won or lost stage are closed.'}
          </p>
          {fields.kind && <p className="text-sm text-destructive">{fields.kind}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stage-probability">Probability of winning (%)</Label>
          <Input
            id="stage-probability"
            inputMode="numeric"
            disabled={closed}
            value={closed ? (kind === 'won' ? '100' : '0') : probability}
            onChange={(e) => setProbability(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {closed
              ? 'Fixed for won and lost stages.'
              : 'What a deal starts with when it moves here; each deal can still be changed.'}
          </p>
          {fields.probability && <p className="text-sm text-destructive">{fields.probability}</p>}
        </div>
        {(invalid || general) && (
          <p role="alert" className="text-sm text-destructive">
            {invalid ?? general}
          </p>
        )}
      </form>
    </Modal>
  )
}

/** Confirm deleting a stage; if it holds deals, choose the stage they move to. */
export function DeleteStageDialog({
  stage,
  others,
  onClose,
  remove,
  onDeleted,
}: {
  stage: ManagedStage | null
  /** The pipeline's other stages: where deals can go. */
  others: ManagedStage[]
  onClose: () => void
  remove: (stageId: string, moveDealsTo?: string) => Promise<void>
  onDeleted: () => void
}) {
  const [target, setTarget] = useState('')
  const mutation = useMutation({
    mutationFn: ({ id, to }: { id: string; to?: string }) => remove(id, to),
    onSuccess: () => {
      onClose()
      onDeleted()
    },
  })
  const hasDeals = (stage?.dealCount ?? 0) > 0
  const fields = mutation.isError ? getFieldErrors(mutation.error) : {}

  return (
    <Modal
      open={stage !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
          setTarget('')
          mutation.reset()
        }
      }}
      title="Delete this stage?"
      description="This cannot be undone."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Keep stage
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending || (hasDeals && target === '')}
            onClick={() =>
              stage && mutation.mutate({ id: stage.id, to: hasDeals ? target : undefined })
            }
          >
            {mutation.isPending ? 'Deleting…' : 'Delete stage'}
          </Button>
        </>
      }
    >
      {stage && <p className="text-sm font-medium">{stage.name}</p>}
      {stage && hasDeals && (
        <div className="space-y-1.5">
          <Label htmlFor="move-deals-to">
            Move its {stage.dealCount} {stage.dealCount === 1 ? 'deal' : 'deals'} to
          </Label>
          <select
            id="move-deals-to"
            className={selectClass}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Choose a stage…</option>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({KIND_LABELS[kindOf(s)]})
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            They become open, won or lost to match that stage.
          </p>
          {fields.moveDealsTo && <p className="text-sm text-destructive">{fields.moveDealsTo}</p>}
        </div>
      )}
      {mutation.isError && Object.keys(fields).length === 0 && (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(mutation.error, 'Could not delete the stage')}
        </p>
      )}
    </Modal>
  )
}
