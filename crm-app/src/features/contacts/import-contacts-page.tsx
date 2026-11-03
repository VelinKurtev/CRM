import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Download, FileUp, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/utils/cn'
import { importContacts, type ImportProblem, type ImportResult } from '@/services/contacts'

const MAX_BYTES = 2 * 1024 * 1024
const MAX_PROBLEMS_SHOWN = 100

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  jobTitle: 'Job title',
  company: 'Company',
  address: 'Address',
  city: 'City',
  postalCode: 'Postal code',
  country: 'Country',
  linkedinUrl: 'LinkedIn',
  twitterUrl: 'X / Twitter',
  facebookUrl: 'Facebook',
  tags: 'Tags',
  note: 'Note',
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function ProblemsTable({ problems }: { problems: ImportProblem[] }) {
  const shown = problems.slice(0, MAX_PROBLEMS_SHOWN)
  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Row</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>What to fix</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((p) => (
            <TableRow key={p.row}>
              <TableCell className="tabular-nums">{p.row}</TableCell>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>
                <ul className="space-y-0.5">
                  {Object.entries(p.errors).map(([field, message]) => (
                    <li key={field}>
                      <span className="text-muted-foreground">{FIELD_LABELS[field] ?? field}:</span>{' '}
                      {message}
                    </li>
                  ))}
                </ul>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {problems.length > shown.length && (
        <p className="text-sm text-muted-foreground">
          …and {plural(problems.length - shown.length, 'more problem')} not shown.
        </p>
      )}
    </div>
  )
}

export function ImportContactsPage() {
  const queryClient = useQueryClient()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<{ name: string; text: string } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [done, setDone] = useState<ImportResult | null>(null)

  const preview = useMutation({
    mutationFn: (text: string) => importContacts(text, true),
  })
  const run = useMutation({
    mutationFn: (text: string) => importContacts(text, false),
    onSuccess: (result) => {
      setDone(result)
      toast.success(`${plural(result.imported, 'contact')} imported`)
      void queryClient.invalidateQueries({ queryKey: ['contacts'] })
      void queryClient.invalidateQueries({ queryKey: ['contact-filter-tags'] })
      void queryClient.invalidateQueries({ queryKey: ['contact-filter-companies'] })
    },
  })

  const reset = () => {
    setFile(null)
    setFileError(null)
    setDone(null)
    preview.reset()
    run.reset()
  }

  const choose = async (picked: File | undefined) => {
    reset()
    if (!picked) return
    if (picked.size > MAX_BYTES) {
      setFileError('That file is larger than 2 MB. Split it into smaller files.')
      return
    }
    const text = await picked.text()
    setFile({ name: picked.name, text })
    preview.mutate(text)
  }

  const result = done ?? preview.data

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Import contacts</h1>
        <p className="text-muted-foreground">
          Bring contacts in from a CSV file, for example an export from Excel or another CRM.
        </p>
      </div>

      {!done && (
        <Card>
          <CardHeader>
            <CardTitle>1. Choose a file</CardTitle>
            <CardDescription>
              The first row must be column names. <strong>First name</strong> and{' '}
              <strong>last name</strong> are required; everything else is optional: email, phone,
              job title, company, address, city, postal code, country, LinkedIn, Twitter, Facebook,
              tags (separated by ; or |) and note. Up to 2,000 contacts and 2 MB.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                void choose(e.dataTransfer.files[0])
              }}
              className={cn(
                'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
                dragging ? 'border-primary bg-accent' : 'border-border bg-muted/30',
              )}
            >
              {/* The real input stays in the page for assistive tech and tests; the button below drives it. */}
              <Label htmlFor={inputId} className="sr-only">
                CSV file
              </Label>
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept=".csv,text/csv"
                tabIndex={-1}
                className="sr-only"
                onChange={(e) => {
                  void choose(e.target.files?.[0])
                  e.target.value = '' // lets the same file be picked again after a fix
                }}
              />
              <FileUp className="size-8 text-muted-foreground" aria-hidden />
              <div>
                <p className={file ? 'font-medium' : 'font-medium text-muted-foreground'}>
                  {file ? file.name : 'No file selected'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {file ? 'Choose another file to replace it' : 'Drag a CSV file here, or'}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" onClick={() => inputRef.current?.click()}>
                  Choose file
                </Button>
                <Button asChild variant="outline">
                  <a href="/contacts-template.csv" download="contacts-template.csv">
                    <Download /> Download template
                  </a>
                </Button>
              </div>
            </div>
            {fileError && (
              <p role="alert" className="text-sm text-destructive">
                {fileError}
              </p>
            )}
            {preview.isPending && (
              <p className="text-sm text-muted-foreground">Checking {file?.name}…</p>
            )}
            {preview.isError && (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {getErrorMessage(preview.error, 'Could not read that file')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {result && file && (
        <Card>
          <CardHeader>
            <CardTitle>{done ? 'Import finished' : '2. Check and import'}</CardTitle>
            <CardDescription>
              {file.name} · {plural(result.total, 'row')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.ignoredColumns.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Ignored columns: {result.ignoredColumns.join(', ')}
              </p>
            )}

            {done ? (
              <p className="flex items-center gap-2 font-medium" role="status">
                <CheckCircle2 className="size-5 text-green-600" aria-hidden />
                {plural(done.imported, 'contact')} imported
                {done.rejected.length > 0 && `, ${done.rejected.length} skipped`}
              </p>
            ) : (
              <p role="status" className="font-medium">
                {result.valid > 0
                  ? `${plural(result.valid, 'contact')} ready to import`
                  : 'Nothing in this file can be imported'}
                {result.rejected.length > 0 && (
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    · {plural(result.rejected.length, 'row')} will be skipped
                  </span>
                )}
              </p>
            )}

            {result.rejected.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm">
                  <TriangleAlert className="size-4 text-amber-600" aria-hidden />
                  {done
                    ? 'These rows were skipped.'
                    : 'These rows are skipped; the rest are not affected.'}{' '}
                  Fix them in your file and import it again to add them.
                </p>
                <ProblemsTable problems={result.rejected} />
              </div>
            )}

            {!done && result.valid > 0 && (
              <p className="text-sm text-muted-foreground">
                Contacts without an email can't be matched to existing ones, so importing the same
                file twice would add them again.
              </p>
            )}

            {run.isError && (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {getErrorMessage(run.error, 'The import failed and nothing was saved')}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {done ? (
                <>
                  <Button asChild>
                    <Link to="/contacts">View contacts</Link>
                  </Button>
                  <Button variant="outline" onClick={reset}>
                    Import another file
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    disabled={result.valid === 0 || run.isPending}
                    onClick={() => run.mutate(file.text)}
                  >
                    <FileUp />{' '}
                    {run.isPending ? 'Importing…' : `Import ${plural(result.valid, 'contact')}`}
                  </Button>
                  <Button variant="outline" onClick={reset}>
                    Choose a different file
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
