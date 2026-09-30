export function PageHeader({ title }: { title: string }) {
  return (
    <section className="page-header">
      <h1 className="page-header-title">{title}</h1>
    </section>
  )
}
