import type { SVGProps } from 'react'

const PATHS: Record<string, string> = {
  back: 'M15 18l-6-6 6-6',
  x: 'M18 6L6 18M6 6l12 12',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  share: 'M12 3v12M7 8l5-5 5 5M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  map: 'M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11zM14.2 10a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0z',
  pin: 'M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 15v6',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  calendar: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6zM4 10h16M8 2v4M16 2v4',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  users: 'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13.5 7.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  home: 'M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2v-9z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5 5-2z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  refresh: 'M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  dollar: 'M12 2v20M17 6.5H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  repeat: 'M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  phone: 'M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z',
  seat: 'M6 11V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M4 13a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3H4v-3zM6 16v3M18 16v3',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8L19 17z',
  external: 'M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
  copy: 'M9 9h10v12H9zM5 15V3h10',
  filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5z',
  wave: 'M4 14c2-3 4-3 6 0s4 3 6 0 4-3 6 0M4 9c2-3 4-3 6 0s4 3 6 0 4-3 6 0',
}

interface Props extends SVGProps<SVGSVGElement> {
  name: keyof typeof PATHS | string
  size?: number
  stroke?: string
  strokeWidth?: number
}

export function Icon({ name, size = 18, stroke = 'currentColor', strokeWidth = 1.8, ...rest }: Props) {
  const d = PATHS[name] ?? ''
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={d} />
    </svg>
  )
}

export function PieMark({ size = 22 }: { size?: number }) {
  return (
    <svg className="pie-mark" width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <path d="M11 11 L11 2 A9 9 0 1 0 19.56 8.22 Z" fill="#FFF8E7" />
      <path d="M12.2 9.4 L12.2 0.4 A9 9 0 0 1 20.76 6.62 Z" fill="#D0F08B" />
    </svg>
  )
}
