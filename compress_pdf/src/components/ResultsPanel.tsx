/**
 * ResultsPanel.tsx
 * -----------------
 * Shows compression results, pass history, and download/reset buttons.
 */

import React, { useEffect, useState } from 'react';
import {
  Download, RotateCcw, CheckCircle, TrendingDown,
  FileText, Target, Layers,
} from 'lucide-react';
import { CompressionResult } from '../types';
import { formatBytes, reductionPercent } from '../utils/format';

const KOFI_GOAL_URL = 'https://ko-fi.com/trebell/goal?g=15';

interface Props {
  result: CompressionResult;
  onReset: () => void;
}

interface MetricProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}

const Metric: React.FC<MetricProps> = ({ icon, label, value, sub, highlight }) => (
  <div className={`
    flex flex-col gap-1 p-4 rounded-2xl border shadow-sm
    ${highlight
      ? 'bg-violet-50/50 border-violet-100'
      : 'bg-slate-50/50 border-slate-100'}
  `}>
    <div className="flex items-center gap-2 text-slate-400 font-semibold text-xs">
      <div className={highlight ? 'text-violet-600' : 'text-slate-500'}>{icon}</div>
      <span>{label}</span>
    </div>
    <p className={`text-xl font-black ${highlight ? 'text-violet-600' : 'text-slate-800'}`}>
      {value}
    </p>
    {sub && <p className="text-xs text-slate-500 font-medium">{sub}</p>}
  </div>
);

export const ResultsPanel: React.FC<Props> = ({ result, onReset }) => {
  const [showDownloadPrompt, setShowDownloadPrompt] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const reductionPct  = reductionPercent(result.originalSize, result.compressedSize);
  const targetHit     = result.compressedSize <= result.targetSize;
  const targetDiff    = Math.abs(result.compressedSize - result.targetSize);

  useEffect(() => {
    if (!showDownloadPrompt) return undefined;
    setDownloadReady(false);
    const timer = window.setTimeout(() => setDownloadReady(true), 4000);
    return () => window.clearTimeout(timer);
  }, [showDownloadPrompt]);

  const handleDownload = () => {
    setDownloadReady(false);
    setShowDownloadPrompt(true);
  };

  const continueDownload = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!downloadReady) {
      event.preventDefault();
      return;
    }
    window.setTimeout(() => {
      setShowDownloadPrompt(false);
      setDownloadReady(false);
    }, 500);
  };

  return (
    <div className="space-y-6 fade-in-up">
      {/* Success banner */}
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-100 shadow-sm">
        <CheckCircle size={22} className="text-emerald-600 shrink-0" />
        <div>
          <p className="text-sm font-bold text-emerald-800">Compression Complete!</p>
          <p className="text-xs text-emerald-700 font-medium mt-0.5">
            {targetHit
              ? `Target size reached. Difference: ${formatBytes(targetDiff)}`
              : `Compressed as much as possible. Diff from target: ${formatBytes(targetDiff)}`}
          </p>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          icon={<FileText size={13} />}
          label="Original Size"
          value={formatBytes(result.originalSize)}
        />
        <Metric
          icon={<Layers size={13} />}
          label="Compressed Size"
          value={formatBytes(result.compressedSize)}
          highlight
        />
        <Metric
          icon={<Target size={13} />}
          label="Target Size"
          value={formatBytes(result.targetSize)}
          sub={targetHit ? '✓ Reached' : '~ Near target'}
        />
        <Metric
          icon={<TrendingDown size={13} />}
          label="Size Reduction"
          value={`${reductionPct.toFixed(1)}%`}
          sub={`saved ${formatBytes(result.originalSize - result.compressedSize)}`}
        />
      </div>

      {/* Compression ratio visual */}
      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-2 font-medium">
          <span>Compression ratio</span>
          <span>
            {formatBytes(result.compressedSize)} / {formatBytes(result.originalSize)}
          </span>
        </div>
        <div className="relative h-4 rounded-full bg-slate-100 overflow-hidden">
          {/* Target marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-amber-500/80 z-10"
            style={{ left: `${(result.targetSize / result.originalSize) * 100}%` }}
            title="Target size"
          />
          {/* Achieved bar */}
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${(result.compressedSize / result.originalSize) * 100}%`,
              background: targetHit
                ? 'linear-gradient(90deg,#059669,#34d399)'
                : 'linear-gradient(90deg,#7c3aed,#ec4899)',
            }}
          />
        </div>
        <div className="flex justify-between text-xs mt-1.5 text-slate-400 font-medium">
          <span>0 B</span>
          <span className="text-amber-600">▲ Target</span>
          <span>{formatBytes(result.originalSize)}</span>
        </div>
      </div>

      {/* Pass history */}
      {result.passes.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Compression Passes
          </h4>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {result.passes.map((p, i) => {
              const barPct = (p.size / result.originalSize) * 100;
              return (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className="text-slate-400 w-14 shrink-0 font-medium">
                    {p.pass === 0 ? 'Baseline' : `Pass ${p.pass}`}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500/70 transition-all"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  <span className="text-slate-600 w-20 text-right shrink-0 font-semibold">
                    {formatBytes(p.size)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleDownload}
          className="
            flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5
            rounded-2xl font-bold text-sm text-white cursor-pointer
            bg-gradient-to-r from-violet-600 to-indigo-600
            hover:from-violet-500 hover:to-indigo-500
            active:scale-[0.98] transition-all duration-150 shadow-md shadow-violet-500/25
          "
        >
          <Download size={18} />
          Download Compressed PDF
        </button>
        <button
          onClick={onReset}
          className="
            flex items-center justify-center gap-2 px-5 py-3.5
            rounded-2xl font-semibold text-sm text-slate-600 cursor-pointer
            bg-slate-50 hover:bg-slate-100 border border-slate-200
            active:scale-[0.98] transition-all duration-150 shadow-sm
          "
        >
          <RotateCcw size={16} />
          Compress Another
        </button>
      </div>

      {showDownloadPrompt && (
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/55 p-5 backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-[560px] rounded-[18px] border border-slate-200 bg-white p-6 text-left shadow-2xl">
            <div className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-violet-600">
              Independent tools need real hardware
            </div>
            <h2 className="m-0 text-[22px] font-black leading-tight text-slate-950">
              Keep PDFOmni Free...
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              PDFOmni stays free because it is built independently. If this saved you time,{' '}
              <a
                href={KOFI_GOAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-extrabold text-pink-600 no-underline hover:underline"
              >
                support me
              </a>{' '}
              on Ko-fi and help fund a new laptop for building the next project. Your download is ready either way.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={(event) => {
                  event.nativeEvent.stopImmediatePropagation();
                  setShowDownloadPrompt(false);
                  setDownloadReady(false);
                }}
                className="min-h-[42px] rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
              >
                Cancel
              </button>
              <a
                href={KOFI_GOAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[42px] items-center justify-center rounded-xl bg-gradient-to-r from-rose-500 to-orange-400 px-4 text-sm font-bold text-white no-underline shadow-lg shadow-rose-500/25 transition hover:text-white hover:brightness-105 hover:shadow-xl hover:shadow-rose-500/30 active:scale-[0.98]"
              >
                Support on Ko-fi
              </a>
              <span className="relative h-[42px] w-full shrink-0 sm:w-[198px]">
                <a
                  onClick={continueDownload}
                  href={downloadReady ? result.downloadUrl : undefined}
                  download={downloadReady ? result.fileName : undefined}
                  aria-disabled={!downloadReady}
                  className="flex h-full w-full items-center justify-center whitespace-nowrap rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 px-3 text-sm font-bold leading-none text-white no-underline shadow-lg shadow-violet-500/25 transition hover:text-white hover:shadow-xl hover:shadow-violet-500/30 aria-disabled:pointer-events-none aria-disabled:cursor-wait aria-disabled:opacity-70 aria-disabled:shadow-none"
                  style={{ color: '#fff' }}
                >
                  {downloadReady ? 'Continue & Download' : 'Preparing PDF...'}
                </a>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
