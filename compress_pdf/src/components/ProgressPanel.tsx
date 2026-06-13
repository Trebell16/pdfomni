/**
 * ProgressPanel.tsx
 * ------------------
 * Real-time compression progress display with animated bar and
 * stage-by-stage status messages.
 */

import React from 'react';
import { ProgressState } from '../types';

interface Props {
  progress: ProgressState;
}

const STAGE_LABELS: Record<string, string> = {
  analysis:   'Analysing PDF…',
  metadata:   'Stripping metadata…',
  baseline:   'Measuring baseline…',
  images:     'Compressing images…',
  saving:     'Saving compressed PDF…',
  optimising: 'Optimising object streams…',
  finalizing: 'Finalising…',
  done:       'Complete!',
};

const STAGE_ORDER = ['analysis','metadata','baseline','images','saving','optimising','finalizing','done'];

export const ProgressPanel: React.FC<Props> = ({ progress }) => {
  const stageIdx = STAGE_ORDER.indexOf(progress.stage);

  return (
    <div className="space-y-5 fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Compression Progress
        </h3>
        <span className="text-sm font-bold text-violet-600 tabular-nums">
          {progress.pct}%
        </span>
      </div>

      {/* Main progress bar */}
      <div className="relative h-3 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 progress-shimmer"
          style={{ width: `${Math.max(progress.pct, 2)}%` }}
        />
      </div>

      {/* Current message */}
      <div className="flex items-center gap-2">
        {/* Spinner */}
        <svg
          className="w-4 h-4 spin-slow text-violet-600 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.15" />
          <path
            d="M12 2 a10 10 0 0 1 10 10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <p className="text-sm text-slate-600 font-medium">{progress.message}</p>
      </div>

      {/* Stage checklist */}
      <div className="space-y-2">
        {STAGE_ORDER.filter(s => s !== 'done').map((stage, idx) => {
          const done    = idx < stageIdx;
          const active  = idx === stageIdx;
          const pending = idx > stageIdx;

          return (
            <div
              key={stage}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-300
                ${active  ? 'bg-violet-50 border border-violet-100 shadow-sm' : 'border border-transparent'}
                ${done    ? 'opacity-60' : ''}
                ${pending ? 'opacity-35' : ''}
              `}
            >
              {/* Status indicator */}
              <div className={`
                w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold
                ${done    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm' : ''}
                ${active  ? 'bg-violet-100 text-violet-700 shadow-inner'  : ''}
                ${pending ? 'bg-slate-50 border border-slate-100 text-slate-400'          : ''}
              `}>
                {done   ? '✓' : active ? '●' : '○'}
              </div>
              <span className={`text-sm ${active ? 'text-slate-800 font-bold' : 'text-slate-600 font-medium'}`}>
                {STAGE_LABELS[stage] ?? stage}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
