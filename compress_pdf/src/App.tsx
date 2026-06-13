/**
 * App.tsx
 * --------
 * Root application component. Orchestrates all stages of the
 * PDF compression workflow using the useCompressor hook.
 *
 * Stages:
 *   idle       → show upload zone
 *   loaded     → show file info + slider + compress button
 *   compressing→ show progress panel
 *   done       → show results + download
 *   error      → show error display
 */

import React from 'react';
import { Zap } from 'lucide-react';
import { useCompressor } from './hooks/useCompressor';
import { UploadZone }        from './components/UploadZone';
import { FileInfoCard }      from './components/FileInfoCard';
import { AnalysisPanel }     from './components/AnalysisPanel';
import { CompressionSlider } from './components/CompressionSlider';
import { ProgressPanel }     from './components/ProgressPanel';
import { ResultsPanel }      from './components/ResultsPanel';
import { PrivacyBanner }     from './components/PrivacyBanner';
import { ErrorDisplay }      from './components/ErrorDisplay';
import { computeTargetSize } from './utils/format';

const App: React.FC = () => {
  const {
    stage, file, analysis, progress, result, errorMsg,
    targetPct, setTargetPct,
    loadFile, startCompress, reset,
  } = useCompressor();

  const originalSize = analysis?.originalSize ?? (file?.size ?? 0);
  const targetBytes  = computeTargetSize(originalSize, targetPct);

  return (
    <div className="text-slate-800 flex flex-col font-sans">

      {/* ── Main content ────────────────────────────────────────────── */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 pb-12 mt-6">

        {/* Privacy banner always visible */}
        <div className="mb-6">
          <PrivacyBanner />
        </div>

        {/* ── IDLE: Upload zone ──────────────────────────────────────── */}
        {stage === 'idle' && (
          <div className="space-y-6">
            <UploadZone onFile={loadFile} />
          </div>
        )}

        {/* ── LOADED: Two-column layout ──────────────────────────────── */}
        {stage === 'loaded' && file && (
          <div className="space-y-5">
            <FileInfoCard
              fileName={file.name}
              analysis={analysis}
              onReset={reset}
            />

            <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
              {/* Left column */}
              <div className="space-y-5">
                {analysis && (
                  <div className="p-5 rounded-3xl bg-white border border-slate-100 shadow-sm">
                    <AnalysisPanel analysis={analysis} targetSize={targetBytes} />
                  </div>
                )}

                <button
                  onClick={startCompress}
                  className="
                    w-full py-4 rounded-3xl font-bold text-base text-white cursor-pointer
                    bg-gradient-to-r from-violet-600 to-indigo-600
                    hover:from-violet-500 hover:to-indigo-500
                    active:scale-[0.98] transition-all duration-150
                    shadow-md shadow-violet-500/25
                    flex items-center justify-center gap-3
                  "
                >
                  <Zap size={20} fill="white" />
                  Compress PDF
                </button>

                <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-400 font-medium">
                  {([
                    ['1', 'Analyse structure'],
                    ['2', 'Multi-pass compression'],
                    ['3', 'Download result'],
                  ] as const).map(([n, lbl]) => (
                    <div key={n} className="flex flex-col items-center gap-1.5 py-3
                      rounded-2xl bg-slate-50 border border-slate-100/50 shadow-sm">
                      <span className="w-5 h-5 rounded-full bg-violet-50 text-violet-600 border border-violet-100
                        flex items-center justify-center font-bold text-[11px]">{n}</span>
                      <span>{lbl}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right column — Compression slider */}
              <div className="p-5 rounded-3xl bg-white border border-slate-100 shadow-sm">
                <CompressionSlider
                  originalSize={originalSize}
                  targetPct={targetPct}
                  onChange={setTargetPct}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── COMPRESSING ───────────────────────────────────────────── */}
        {stage === 'compressing' && file && (
          <div className="space-y-5">
            <FileInfoCard fileName={file.name} analysis={analysis} onReset={() => {}} />
            <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
              <div className="p-5 rounded-3xl bg-white border border-slate-100 shadow-sm">
                <ProgressPanel progress={progress} />
              </div>
              <div className="p-5 rounded-3xl bg-white border border-slate-100 shadow-sm opacity-40 pointer-events-none">
                <CompressionSlider
                  originalSize={originalSize}
                  targetPct={targetPct}
                  onChange={() => {}}
                  disabled
                />
              </div>
            </div>
          </div>
        )}

        {/* ── DONE ──────────────────────────────────────────────────── */}
        {stage === 'done' && result && file && (
          <div className="space-y-5">
            <FileInfoCard fileName={file.name} analysis={analysis} onReset={reset} />
            <div className="p-5 rounded-3xl bg-white border border-slate-100 shadow-sm">
              <ResultsPanel result={result} onReset={reset} />
            </div>
          </div>
        )}

        {/* ── ERROR ─────────────────────────────────────────────────── */}
        {stage === 'error' && (
          <div className="rounded-3xl bg-white border border-slate-100 shadow-sm">
            <ErrorDisplay message={errorMsg ?? 'Unknown error.'} onRetry={reset} />
          </div>
        )}

      </main>

    </div>
  );
};

export default App;
