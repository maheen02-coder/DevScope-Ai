import { FileCode2 } from 'lucide-react'

export function FindingFiles({ files, label = 'Cited files' }) {
  if (!files?.length) return null
  return (
    <div className="finding-files" aria-label={label}>
      {files.map((path) => (
        <span className="file-pill" key={path} title={path}>
          <FileCode2 size={11} aria-hidden="true" />
          <span>{path}</span>
        </span>
      ))}
    </div>
  )
}
