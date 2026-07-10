import { Link, NavLink } from 'react-router-dom'
import { ButtonPrimary } from './Button'

/** Hype/TopNav — sticky top bar: translucent, blurred, bottom border. */
export default function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-hype-border bg-hype-bg/80 backdrop-blur-md">
      <nav className="page-gutter flex h-[76px] items-center justify-between" aria-label="Main navigation">
        <Link to="/" className="flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-hype-purple">
          <span className="text-[22px]" aria-hidden="true">⏳</span>
          <span className="font-display text-[22px] font-bold text-hype-text">Hype</span>
        </Link>
        <div className="flex items-center gap-4 sm:gap-7">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `text-[15px] font-medium transition-colors hover:text-hype-text ${
                isActive ? 'text-hype-text' : 'text-hype-text-2'
              }`
            }
          >
            Explore
          </NavLink>
          <ButtonPrimary to="/create" className="!px-5 !py-2.5 sm:!px-7">
            <span className="hidden sm:inline">Create Timer</span>
            <span className="sm:hidden">+ Create</span>
          </ButtonPrimary>
        </div>
      </nav>
    </header>
  )
}
