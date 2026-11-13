import type { Person } from '../core/types'
import { Icon } from './Icon'

interface Props {
  person: Person
  size?: number
  you?: boolean
  className?: string
  title?: string
}

export function Avatar({ person, size = 32, you, className = '', title }: Props) {
  const fontSize = Math.max(10, Math.round(size * 0.4))
  const isYou = you ?? person.id === 'you'
  return (
    <span
      className={`avatar ${isYou ? 'you' : person.tone} ${className}`}
      style={{ width: size, height: size, fontSize }}
      title={title ?? person.name}
      aria-label={person.name}
      role="img"
    >
      {isYou ? <Icon name="check" size={Math.round(size * 0.45)} strokeWidth={3} /> : person.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

interface FacesProps {
  people: Person[]
  size?: number
  max?: number
  onCard?: boolean
  popFirst?: boolean
}

export function Faces({ people, size = 32, max = 3, onCard, popFirst }: FacesProps) {
  const shown = people.slice(0, max)
  return (
    <span className={`faces ${onCard ? 'on-card' : ''}`}>
      {shown.map((p, i) => (
        <Avatar key={p.id} person={p} size={size} className={popFirst && i === 0 ? 'pop' : ''} />
      ))}
    </span>
  )
}
