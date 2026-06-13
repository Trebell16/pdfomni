export default function ProgressBar({ progress = 0, message = '', showPercentage = true }) {
  return (
    <div style={{ width: '100%' }} id="progress-bar-wrapper">
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '8px',
        fontSize: 'var(--text-sm)',
      }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>{message}</span>
        {showPercentage && (
          <span style={{ 
            color: 'var(--color-accent)',
            fontWeight: 600,
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
          }}>
            {Math.round(progress)}%
          </span>
        )}
      </div>
      <div className="progress-bar">
        <div 
          className="progress-bar-fill" 
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  )
}
