'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const links = [
  { href: '/', label: 'Home' },
  { href: '/pressings', label: 'View Collection' },
  { href: '/pressings/new', label: 'Add Record' },
  { href: '/wishlist', label: 'View Wishlist' },
]

export default function HamburgerMenu() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Menu"
        aria-expanded={open}
        className="p-1 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-48 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg py-1 z-10">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
