/** A file size for people: 512 B, 3.4 KB, 120 KB, 9.8 MB. */
export const formatBytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`
      : `${(n / (1024 * 1024)).toFixed(1)} MB`
