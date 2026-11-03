import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react'

export function BrandMark({ href = '/', label = 'Digital' }: { href?: string; label?: string }) {
  return (
    <a className="erax-brand" href={href}>
      <strong>EraX</strong>
      <span>{label}</span>
    </a>
  )
}

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className="erax-button" {...props} />
}

export function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="erax-button-secondary" href={href}>
      {children}
    </a>
  )
}

export function TextField({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="erax-field">
      <span>{label}</span>
      <input {...props} />
    </label>
  )
}

export function TextArea({
  label,
  ...props
}: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="erax-field">
      <span>{label}</span>
      <textarea {...props} />
    </label>
  )
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="erax-alert" role="alert">
      {children}
    </div>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <div className="erax-note">{children}</div>
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="erax-empty erax-card">
      <h2>{title}</h2>
      <p className="erax-muted">{body}</p>
    </div>
  )
}
