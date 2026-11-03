/** Hand a Blob to the browser as a file download. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  // Revoke after the click has been handled.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
