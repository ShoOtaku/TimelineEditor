import { useState } from 'react'

/** HTML 技能图标，加载失败回退为首字符占位块 */
export function SkillIconImg({ src, name, size = 20, className }: {
  src?: string; name: string; size?: number; className?: string
}) {
  const [err, setErr] = useState(false)
  if (!src || err) {
    return (
      <div
        style={{ width: size, height: size, fontSize: size * 0.55 }}
        className={`rounded bg-gray-600 border border-gray-500 flex items-center justify-center text-gray-200 select-none flex-shrink-0 ${className ?? ''}`}
      >
        {name.charAt(0) || '?'}
      </div>
    )
  }
  return (
    <img src={src} alt="" width={size} height={size} draggable={false}
      className={`rounded flex-shrink-0 ${className ?? ''}`} onError={() => setErr(true)} />
  )
}
