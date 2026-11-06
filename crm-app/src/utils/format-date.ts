export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' })

/**
 * A calendar date the server stored as end-of-day UTC (e.g. a deal's expected close), shown as that
 * same day wherever the viewer is, rather than shifted into the next day by their time zone.
 */
export const formatCalendarDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  })
