/**
 * FileInfoCard.tsx
 * -----------------
 * Displays loaded file metadata: name, size, page count.
 */

import React from 'react';
import { FileText, X } from 'lucide-react';
import { formatBytes } from '../utils/format';
import { PdfAnalysis } from '../types';

interface Props {
  fileName: string;
  analysis: PdfAnalysis | null;
  onReset: () => void;
}

export const FileInfoCard: React.FC<Props> = ({ fileName, analysis, onReset }) => {
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm fade-in-up">
      {/* Icon */}
      <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
        <FileText size={24} className="text-violet-600" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-slate-800 font-semibold truncate text-sm">{fileName}</p>
        <div className="flex gap-3 mt-1 text-xs text-slate-500 font-medium">
          {analysis ? (
            <>
              <span>{formatBytes(analysis.originalSize)}</span>
              <span>·</span>
              <span>{analysis.pages} page{analysis.pages !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>{analysis.images} image{analysis.images !== 1 ? 's' : ''}</span>
            </>
          ) : (
            <span>Loading analysis…</span>
          )}
        </div>
      </div>

      {/* Remove button */}
      <button
        onClick={onReset}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
        title="Remove file"
      >
        <X size={16} />
      </button>
    </div>
  );
};
