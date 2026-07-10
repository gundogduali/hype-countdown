import { AnimatePresence, motion } from 'motion/react'

/** Bottom-center pill toast — enters/exits with fade+slide (design: CopiedToast). */
export default function Toast({ show, children }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          role="status"
          className="fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-full border border-hype-border-strong bg-hype-surface-2 px-5 py-2.5 text-sm font-medium text-hype-text shadow-[0_8px_24px] shadow-black/40"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
