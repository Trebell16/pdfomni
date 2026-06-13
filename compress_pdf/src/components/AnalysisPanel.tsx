/**
 * AnalysisPanel.tsx
 * ------------------
 * Shows the PDF structural analysis results (pages, images, fonts, size).
 */

import React from 'react';
import { Layers, Image as ImageIcon, Type, HardDrive } from 'lucide-react';
import { PdfAnalysis } from '../types';
import { formatBytes } from '../utils/format';

interface Props {
  analysis: PdfAnalysis;
  targetSize: number;
}

interface StatItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const StatItem: React.FC<StatItemProps> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 shadow-sm">
    <div className="w-9 h-9 rounded-lg bg-white border border-slate-100 flex items-center justify-center shrink-0 shadow-sm">
      {icon}
    </div>
    <div>
      <p className="text-xs text-slate-400 font-medium leading-none mb-1">{label}</p>
      <p className="text-sm font-bold text-slate-800">{value}</p>
    </div>
  </div>
);

export const AnalysisPanel: React.FC<Props> = ({ analysis, targetSize }) => {
  return (
    <div className="fade-in-up">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
        PDF Analysis
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatItem
          icon={<Layers size={18} className="text-violet-600" />}
          label="Pages"
          value={analysis.pages.toLocaleString()}
        />
        <StatItem
          icon={<ImageIcon size={18} className="text-purple-600" />}
          label="Images"
          value={analysis.images.toLocaleString()}
        />
        <StatItem
          icon={<HardDrive size={18} className="text-sky-600" />}
          label="Current Size"
          value={formatBytes(analysis.originalSize)}
        />
        <StatItem
          icon={<Type size={18} className="text-pink-600" />}
          label="Target Size"
          value={formatBytes(targetSize)}
        />
      </div>
    </div>
  );
};
