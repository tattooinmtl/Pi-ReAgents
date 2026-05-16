interface DownloadState {
  filename: string
  pct: number
  received: number
  total: number
  bytesPerSec: number
}

interface Props {
  download: DownloadState | null
}

function fmtSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`
  return `${bytes} B`
}

export function DownloadProgressFloat({ download }: Props) {
  if (!download) return null

  const shortName = download.filename.length > 30
    ? download.filename.slice(0, 27) + '…'
    : download.filename

  return (
    <div className="dl-float">
      <div className="dl-float-header">
        <span className="dl-float-icon">⬇</span>
        <span className="dl-float-title">Downloading Model</span>
      </div>
      <div className="dl-float-name" title={download.filename}>{shortName}</div>
      <div className="dl-float-bar-row">
        <div className="dl-float-bar">
          <div className="dl-float-fill" style={{ width: `${download.pct}%` }} />
        </div>
        <span className="dl-float-pct">{download.pct}%</span>
      </div>
      <div className="dl-float-meta">
        <span>{fmtSize(download.received)} / {fmtSize(download.total)}</span>
        {download.bytesPerSec > 0 && (
          <span className="dl-float-rate">{fmtSize(download.bytesPerSec)}/s</span>
        )}
      </div>
    </div>
  )
}
