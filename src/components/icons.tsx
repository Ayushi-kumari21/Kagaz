import type { SVGProps } from 'react'

/** Small stroke icon set (24×24 grid, 1.8 stroke) so every icon matches. */
const PATHS: Record<string, React.ReactNode> = {
  edit: (
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  form: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="m8.5 12 2 2 4-4" />
      <path d="M8.5 17.5h7" />
    </>
  ),
  sign: (
    <>
      <path d="M3 17c2.5 0 3.5-9 6-9s1 7 3 7 2.5-4 4-4 1.5 3 5 3" />
      <path d="M3 21h18" />
    </>
  ),
  merge: (
    <>
      <rect x="3" y="3" width="11" height="13" rx="2" />
      <path d="M10 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-3" />
    </>
  ),
  split: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M8.2 8.2 20 20M8.2 15.8 20 4" />
    </>
  ),
  organize: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </>
  ),
  imagePdf: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 16-5-5-9 9" />
    </>
  ),
  pdfImage: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
      <path d="M14 3v6h6" />
      <path d="m8 18 3-3 2 2 3-3" />
    </>
  ),
  photo: (
    <>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M7.5 17a4.5 4.5 0 0 1 9 0" />
    </>
  ),
  shrink: (
    <>
      <path d="M4 14h6v6M20 10h-6V4" />
      <path d="m14 10 7-7M3 21l7-7" />
    </>
  ),
  cursor: <path d="m5 3 14 7-6 2-2 6L5 3Z" />,
  text: (
    <>
      <path d="M5 6V4h14v2" />
      <path d="M12 4v16M9 20h6" />
    </>
  ),
  eraser: (
    <>
      <path d="m7 21-4-4L14 6l6 6-9 9H7Z" />
      <path d="M21 21H11M9 11l6 6" />
    </>
  ),
  highlight: (
    <>
      <path d="m9 11-5 5v3h6l5-5" />
      <path d="m18 3 3 3-8 8-3-3 8-8Z" />
      <path d="M3 21h8" />
    </>
  ),
  draw: (
    <>
      <path d="M3 18c3-6 6 2 9-4s5-1 9-8" />
    </>
  ),
  box: <rect x="4" y="5" width="16" height="14" rx="1.5" />,
  check: <path d="m4 12 5 5L20 6" />,
  cross: <path d="M6 6l12 12M18 6 6 18" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 16-5-5-9 9" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h3" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V5M7 10l5-5 5 5" />
      <path d="M5 20h14" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
    </>
  ),
  left: <path d="m15 18-6-6 6-6" />,
  right: <path d="m9 18 6-6-6-6" />,
  rotateL: (
    <>
      <path d="M4 11a8 8 0 1 1 2.3 5.7" />
      <path d="M4 4v7h7" />
    </>
  ),
  rotateR: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </>
  ),
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  ok: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.5" />
    </>
  ),
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
