import { useEffect, useState } from 'preact/hooks'
import { pokemonArtworkUrl, pokemonSpriteUrl, resolvePokemonSpeciesId } from './pokemon-sprites'

export function PokemonSprite({
  speciesId,
  name,
  className = '',
  title
}: {
  speciesId?: number
  name: string
  className?: string
  title?: string
}) {
  const direct = Number.isFinite(speciesId) && Number(speciesId) > 0 ? Math.floor(Number(speciesId)) : null
  const [resolvedId, setResolvedId] = useState<number | null>(direct)
  const [fallbackArtwork, setFallbackArtwork] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setFallbackArtwork(false)
    setFailed(false)
    if (direct) {
      setResolvedId(direct)
      return () => { active = false }
    }
    setResolvedId(null)
    void resolvePokemonSpeciesId(undefined, name).then((id) => { if (active) setResolvedId(id) })
    return () => { active = false }
  }, [direct, name])

  if (!resolvedId || failed) return <span class={`pokemon-sprite-fallback ${className}`} title={title || name}>◉</span>
  return <img
    class={`pokemon-sprite ${className}`}
    src={fallbackArtwork ? pokemonArtworkUrl(resolvedId) : pokemonSpriteUrl(resolvedId)}
    alt={name}
    title={title || name}
    loading="lazy"
    onError={() => fallbackArtwork ? setFailed(true) : setFallbackArtwork(true)}
  />
}
