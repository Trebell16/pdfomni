/**
 * ErrorDisplay.tsx
 * -----------------
 * Displays compression or loading errors with a retry option.
 */

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  message: string;
  onRetry: () => void;
}

export const ErrorDisplay: React.FC<Props> = ({ message, onRetry }) => (
  <div className="flex flex-col items-center gap-5 py-8 px-4 text-center fade-in-up">
    <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center shadow-sm">
      <AlertTriangle size={32} className="text-red-600" />
    </div>
    <div>
      <h3 className="text-lg font-bold text-slate-800 mb-2">Compression Failed</h3>
      <p className="text-sm text-slate-500 max-w-sm leading-relaxed font-medium">{message}</p>
    </div>
    <button
      onClick={onRetry}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl
        bg-slate-50 hover:bg-slate-100 border border-slate-200
        text-sm text-slate-700 hover:text-slate-900 font-semibold
        active:scale-95 transition-all cursor-pointer shadow-sm"
    >
      <RotateCcw size={15} />
      Try Again
    </button>
  </div>
);
