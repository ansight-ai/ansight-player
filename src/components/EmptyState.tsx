import type { ReactNode } from 'react'

export function EmptyState({ icon, message, title }: { icon: ReactNode; message: ReactNode; title: string }) {
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  )
}
