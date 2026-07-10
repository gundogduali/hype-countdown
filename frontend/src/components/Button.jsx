import { Link } from 'react-router-dom'

const base =
  'inline-flex items-center justify-center gap-2 rounded-hype-sm text-[15px] transition duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hype-purple disabled:cursor-not-allowed disabled:opacity-60'

function Poly({ to, className, children, ...props }) {
  if (to) {
    return (
      <Link to={to} className={className} {...props}>
        {children}
      </Link>
    )
  }
  return (
    <button type={props.type ?? 'button'} className={className} {...props}>
      {children}
    </button>
  )
}

/** Hype/ButtonPrimary — purple→pink gradient, purple glow; glow widens on hover. */
export function ButtonPrimary({ className = '', ...props }) {
  return (
    <Poly
      className={`${base} bg-gradient-to-r from-hype-purple to-hype-pink px-7 py-3.5 font-semibold text-white shadow-[0_4px_24px] shadow-hype-purple/35 hover:brightness-110 hover:shadow-[0_4px_36px] hover:shadow-hype-purple/50 ${className}`}
      {...props}
    />
  )
}

/** Hype/ButtonGhost — surface background, strong border. */
export function ButtonGhost({ className = '', ...props }) {
  return (
    <Poly
      className={`${base} border border-hype-border-strong bg-hype-surface px-7 py-3.5 font-medium text-hype-text hover:border-hype-purple hover:bg-hype-surface-2 ${className}`}
      {...props}
    />
  )
}
