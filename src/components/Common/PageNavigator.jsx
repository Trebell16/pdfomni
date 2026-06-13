import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function PageNavigator({ currentPage, pageCount, onChange, compact = false, idPrefix = 'page-nav' }) {
  const goToPage = (value) => {
    const next = Math.min(pageCount, Math.max(1, Number.parseInt(value, 10) || 1))
    onChange(next)
  }

  return (
    <div className="page-navigator">
      <button
        className="page-navigator-btn"
        disabled={currentPage <= 1}
        onClick={() => goToPage(currentPage - 1)}
        aria-label="Previous page"
        id={`${idPrefix}-prev`}
      >
        <ChevronLeft size={compact ? 14 : 16} />
      </button>
      <label className="page-navigator-label">
        <span>Page</span>
        <input
          className="input page-navigator-input"
          type="number"
          min="1"
          max={pageCount}
          value={currentPage}
          onChange={(e) => goToPage(e.target.value)}
          onBlur={(e) => goToPage(e.target.value)}
          id={`${idPrefix}-input`}
        />
        <span>/ {pageCount}</span>
      </label>
      <button
        className="page-navigator-btn"
        disabled={currentPage >= pageCount}
        onClick={() => goToPage(currentPage + 1)}
        aria-label="Next page"
        id={`${idPrefix}-next`}
      >
        <ChevronRight size={compact ? 14 : 16} />
      </button>
    </div>
  )
}
