import { assetUrl, useResume } from '../sdk/index.ts'

/** The photo from curriculo.json, or the initials while none is set. */
export function Avatar({ size }: { size: number }) {
  const { basics } = useResume()
  if (basics.image) {
    return (
      <img className="avatar" src={assetUrl(basics.image)} alt={basics.name} width={size} height={size} />
    )
  }
  const initials = basics.name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span className="avatar avatar-initials" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {initials}
    </span>
  )
}
