export const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

export function formatDate(value: string | undefined): string {
  if (!value) {
    return 'Loading'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(value))
}
