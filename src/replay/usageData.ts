export function formatMoneyMicros(value: number | null | undefined, currency = 'USD'): string {
  const amount = (value ?? 0) / 1_000_000
  try {
    return new Intl.NumberFormat(undefined, {
      currency,
      maximumFractionDigits: amount > 0 && amount < 0.01 ? 4 : 2,
      minimumFractionDigits: 2,
      style: 'currency',
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}
