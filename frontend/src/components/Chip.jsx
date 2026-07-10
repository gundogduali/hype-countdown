import { motion } from 'motion/react'

/**
 * Hype/Chip — category filter chip.
 * On activation: spring scale (0.96→1) + background fade (design note).
 * `small`: compact variant used in the Create form.
 */
export default function Chip({ active = false, small = false, children, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      animate={{ scale: active ? [0.96, 1] : 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      className={`shrink-0 cursor-pointer rounded-full border transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hype-purple ${
        small ? 'px-3 py-2 text-[13px]' : 'px-[18px] py-2.5 text-sm'
      } ${
        active
          ? 'border-hype-purple bg-hype-purple-soft font-semibold text-hype-text'
          : `border-hype-border font-medium text-hype-text-2 hover:border-hype-border-strong hover:text-hype-text ${
              small ? 'bg-hype-surface-2' : 'bg-hype-surface'
            }`
      }`}
    >
      {children}
    </motion.button>
  )
}
