/**
 * CompressionSlider.tsx
 * ----------------------
 * Target size percentage slider (15–90%) with live size display
 * and quality impact badge.
 */

import React from 'react';
import { formatBytes, computeTargetSize } from '../utils/format';
import {
  getQualityImpact,
  getQualityColor,
  getQualityBg,
  QualityImpact,
} from '../types';

interface Props {
  originalSize: number;
  targetPct: number;
  onChange: (pct: number) => void;
  disabled?: boolean;
}

const QUALITY_DESCRIPTIONS: Record<QualityImpact, string> = {
  'Minimal':      'Near-lossless. Barely perceptible quality change.',
  'Low':          'Slight reduction in image sharpness at close inspection.',
  'Medium':       'Noticeable compression on high-resolution images.',
  'High':         'Visible quality reduction; suitable for screen viewing.',
  'Maximum Safe': 'Significant compression; images are noticeably reduced.',
};

export const CompressionSlider: React.FC<Props> = ({
  originalSize,
  targetPct,
  onChange,
  disabled = false,
}) => {
  const targetBytes  = computeTargetSize(originalSize, targetPct);
  const impact       = getQualityImpact(targetPct);
  const colorClass   = getQualityColor(impact);
  const bgClass      = getQualityBg(impact);

  // Slider fill percentage mapped from 15–90 range to 0–100%
  const fillPct = ((targetPct - 15) / (90 - 15)) * 100;

  return (
    <div className="fade-in-up space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Target Output Size
        </h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border shadow-sm ${bgClass} ${colorClass}`}>
          {impact} compression
        </span>
      </div>

      {/* Large percentage + target size */}
      <div className="text-center py-2">
        <div className="text-5xl font-black text-slate-800 tabular-nums leading-none">
          {targetPct}
          <span className="text-2xl text-slate-400 ml-1">%</span>
        </div>
        <div className="mt-2 text-lg font-bold text-violet-600">
          {formatBytes(targetBytes)}
        </div>
        <div className="text-xs text-slate-400 mt-1 font-medium">
          of original {formatBytes(originalSize)}
        </div>
      </div>

      {/* Slider */}
      <div className="relative pt-1">
        <input
          type="range"
          min={15}
          max={90}
          step={1}
          value={targetPct}
          disabled={disabled}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: `linear-gradient(to right, #7c3aed 0%, #7c3aed ${fillPct}%, #e2e8f0 ${fillPct}%, #e2e8f0 100%)`,
          }}
        />
        {/* Min/Max labels */}
        <div className="flex justify-between mt-2 text-xs text-slate-400 font-medium">
          <span>15% — Maximum compression</span>
          <span>90% — Minimal compression</span>
        </div>
      </div>

      {/* Quality impact detail */}
      <div className={`flex items-start gap-3 p-3 rounded-2xl border ${bgClass} shadow-sm`}>
        {/* Dot bar */}
        <div className="flex items-center gap-1 mt-0.5 shrink-0">
          {(['Minimal','Low','Medium','High','Maximum Safe'] as QualityImpact[]).map((lvl) => {
            const levels: QualityImpact[] = ['Minimal','Low','Medium','High','Maximum Safe'];
            const active = levels.indexOf(impact) >= levels.indexOf(lvl);
            return (
              <span
                key={lvl}
                className={`w-2 h-2 rounded-full transition-all ${
                  active ? colorClass.replace('text-', 'bg-') : 'bg-slate-200'
                }`}
              />
            );
          })}
        </div>
        <div>
          <span className={`text-xs font-bold ${colorClass}`}>
            Quality Impact: {impact}
          </span>
          <p className="text-xs text-slate-500 mt-0.5 font-medium leading-relaxed">
            {QUALITY_DESCRIPTIONS[impact]}
          </p>
        </div>
      </div>

      {/* Size breakdown bar */}
      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-1.5 font-medium">
          <span>Estimated size reduction</span>
          <span>{(100 - targetPct).toFixed(0)}% reduction</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${targetPct}%`,
              background: 'linear-gradient(90deg, #7c3aed, #ec4899)',
            }}
          />
        </div>
        <div className="flex justify-between text-xs mt-1.5 font-medium">
          <span className="text-slate-400">0 B</span>
          <span className="text-violet-600 font-bold">{formatBytes(targetBytes)}</span>
          <span className="text-slate-400">{formatBytes(originalSize)}</span>
        </div>
      </div>
    </div>
  );
};
