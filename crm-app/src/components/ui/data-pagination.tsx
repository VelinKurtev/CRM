import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { getPageItems } from '@/utils/pagination'

type DataPaginationProps = {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
}

/** Controlled pagination: wires shadcn Pagination to a page number. */
export function DataPagination({ page, pageCount, onPageChange }: DataPaginationProps) {
  if (pageCount <= 1) return null
  const go = (p: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    if (p >= 1 && p <= pageCount && p !== page) onPageChange(p)
  }

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            onClick={go(page - 1)}
            aria-disabled={page === 1}
            className={page === 1 ? 'pointer-events-none opacity-50' : undefined}
          />
        </PaginationItem>
        {getPageItems(page, pageCount).map((item, i) => (
          <PaginationItem key={item === 'ellipsis' ? `e${i}` : item}>
            {item === 'ellipsis' ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink href="#" isActive={item === page} onClick={go(item)}>
                {item}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            href="#"
            onClick={go(page + 1)}
            aria-disabled={page === pageCount}
            className={page === pageCount ? 'pointer-events-none opacity-50' : undefined}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
