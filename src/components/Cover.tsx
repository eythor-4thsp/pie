import type { Cover as CoverT, Tone } from '../core/types'

interface Props {
  cover: CoverT
  title: string
  alt?: string
  wide?: boolean
  className?: string
  hideTitle?: boolean
}

/** A plan without a photo gets a poster: the title in serif over a few pie slices. */
export function Cover({ cover, title, alt, wide, className = '', hideTitle }: Props) {
  if (cover.kind === 'photo' && cover.src) {
    return (
      <div className={`cover ${wide ? 'wide' : ''} ${className}`}>
        <img src={cover.src} alt={alt ?? title} loading="lazy" />
      </div>
    )
  }
  const tone: Tone = cover.tone ?? 'charcoal'
  return (
    <div className={`cover ${wide ? 'wide' : ''} ${className}`} role="img" aria-label={alt ?? `${title} poster`}>
      <div className={`poster ${tone}`}>
        <PosterArt tone={tone} seed={title.length} />
        {!hideTitle && <div className="poster-title">{title}</div>}
      </div>
    </div>
  )
}

function PosterArt({ tone, seed }: { tone: Tone; seed: number }) {
  const ink = tone === 'lime' || tone === 'latte' ? 'rgba(9,9,11,0.12)' : 'rgba(255,248,231,0.10)'
  const accent = tone === 'lime' ? 'rgba(9,9,11,0.18)' : tone === 'latte' ? 'rgba(208,240,139,0.9)' : 'rgba(208,240,139,0.85)'
  const rot = (seed * 37) % 360
  const r2 = (seed * 53) % 360
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <g transform={`translate(300 90) rotate(${rot})`}>
        <path d="M0 0 L0 -110 A110 110 0 1 0 104 -36 Z" fill={ink} />
        <path d="M14 -18 L14 -128 A110 110 0 0 1 118 -54 Z" fill={accent} />
      </g>
      <g transform={`translate(70 250) rotate(${r2})`}>
        <path d="M0 0 L0 -70 A70 70 0 1 0 66 -23 Z" fill={ink} />
      </g>
    </svg>
  )
}
