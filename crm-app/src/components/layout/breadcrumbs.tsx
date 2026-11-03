import { Fragment } from 'react'
import { Link, useMatches } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export type CrumbHandle = { crumb?: string }

/** Built from the `handle.crumb` of every route matching the current URL. */
export function Breadcrumbs() {
  const crumbs = useMatches().flatMap((m) => {
    const label = (m.handle as CrumbHandle | undefined)?.crumb
    return label ? [{ label, to: m.pathname }] : []
  })
  if (crumbs.length === 0) return null

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((c, i) => (
          <Fragment key={c.to}>
            {i > 0 && <ChevronRight className="size-4" aria-hidden />}
            <li>
              {i === crumbs.length - 1 ? (
                <span aria-current="page" className="font-medium text-foreground">
                  {c.label}
                </span>
              ) : (
                <Link to={c.to} className="hover:text-foreground hover:underline">
                  {c.label}
                </Link>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}
