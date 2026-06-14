/**
 * useCompressor.ts
 * -----------------
 * React hook that manages the compression Web Worker lifecycle,
 * state transitions, and result handling.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  AppStage,
  PdfAnalysis,
  CompressionResult,
  ProgressState,
  PassRecord,
  WorkerMessage,
} from '../types';
import { computeTargetSize } from '../utils/format';

interface UseCompressorReturn {
  stage:        AppStage;
  file:         File | null;
  analysis:     PdfAnalysis | null;
  progress:     ProgressState;
  result:       CompressionResult | null;
  errorMsg:     string | null;
  targetPct:    number;
  setTargetPct: (pct: number) => void;
  loadFile:     (f: File) => void;
  startCompress:() => void;
  reset:        () => void;
}

const DEFAULT_PROGRESS: ProgressState = { stage: 'idle', pct: 0, message: '' };

export function useCompressor(): UseCompressorReturn {
  const [stage,      setStage]      = useState<AppStage>('idle');
  const [file,       setFile]       = useState<File | null>(null);
  const [analysis,   setAnalysis]   = useState<PdfAnalysis | null>(null);
  const [progress,   setProgress]   = useState<ProgressState>(DEFAULT_PROGRESS);
  const [result,     setResult]     = useState<CompressionResult | null>(null);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [targetPct,  setTargetPct]  = useState<number>(50);

  const workerRef    = useRef<Worker | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const analysisSeqRef = useRef(0);
  const analysisTimeoutRef = useRef<number | null>(null);

  const clearAnalysisTimeout = useCallback(() => {
    if (analysisTimeoutRef.current !== null) {
      window.clearTimeout(analysisTimeoutRef.current);
      analysisTimeoutRef.current = null;
    }
  }, []);

  // Terminate worker and revoke any object URL on unmount
  useEffect(() => {
    return () => {
      clearAnalysisTimeout();
      workerRef.current?.terminate();
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, [clearAnalysisTimeout]);

  const loadFile = useCallback((f: File) => {
    // Clean up previous state
    const analysisSeq = ++analysisSeqRef.current;
    clearAnalysisTimeout();
    workerRef.current?.terminate();
    workerRef.current = null;
    if (resultUrlRef.current) { URL.revokeObjectURL(resultUrlRef.current); resultUrlRef.current = null; }

    setFile(f);
    setAnalysis(null);
    setResult(null);
    setErrorMsg(null);
    setProgress(DEFAULT_PROGRESS);
    setStage('loaded');

    const reader = new FileReader();
    reader.onload = (e) => {
      if (analysisSeq !== analysisSeqRef.current) return;
      const buffer = e.target?.result as ArrayBuffer;
      if (!buffer) return;

      const worker = new Worker(
        new URL('../workers/compressionWorker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        if (analysisSeq !== analysisSeqRef.current) {
          worker.terminate();
          return;
        }
        const { type, payload } = event.data;
        if (type === 'ANALYSIS') {
          clearAnalysisTimeout();
          setAnalysis(payload as PdfAnalysis);
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
        }
      };

      worker.onerror = (err) => {
        console.error('Analysis worker error:', err);
        clearAnalysisTimeout();
        setErrorMsg('The PDF analysis engine could not start in this browser. Please refresh and try again.');
        setStage('error');
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      };

      worker.postMessage(
        { type: 'ANALYZE', payload: { buffer, targetPct: 100, fileName: f.name } },
        [buffer]
      );

      analysisTimeoutRef.current = window.setTimeout(() => {
        if (analysisSeq !== analysisSeqRef.current) return;
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        setErrorMsg('PDF analysis timed out. Please refresh and try again.');
        setStage('error');
      }, 45000);
    };
    reader.onerror = () => {
      if (analysisSeq === analysisSeqRef.current) {
        clearAnalysisTimeout();
        console.error('Failed to read PDF for analysis.');
        setErrorMsg('Failed to read the PDF file. Please try again.');
        setStage('error');
      }
    };
    reader.readAsArrayBuffer(f);
  }, [clearAnalysisTimeout]);

  const startCompress = useCallback(() => {
    if (!file) return;

    analysisSeqRef.current++;
    clearAnalysisTimeout();
    workerRef.current?.terminate();
    workerRef.current = null;
    setStage('compressing');
    setProgress({ stage: 'analysis', pct: 2, message: 'Starting compression…' });
    setResult(null);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (!buffer) {
        setStage('error');
        setErrorMsg('Failed to read the PDF file. Please try again.');
        return;
      }

      // Spawn the Web Worker
      const worker = new Worker(
        new URL('../workers/compressionWorker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const { type, payload } = event.data;

        switch (type) {
          case 'PROGRESS': {
            const p = payload as ProgressState;
            setProgress(p);
            break;
          }
          case 'ANALYSIS': {
            const a = payload as PdfAnalysis;
            setAnalysis(a);
            break;
          }
          case 'DONE': {
            const d = payload as {
              buffer: ArrayBuffer;
              originalSize: number;
              compressedSize: number;
              passes: PassRecord[];
            };

            // Revoke previous URL
            if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);

            const blob = new Blob([d.buffer], { type: 'application/pdf' });
            const url  = URL.createObjectURL(blob);
            resultUrlRef.current = url;

            // Build compressed filename
            const baseName = file.name.replace(/\.pdf$/i, '');
            const dlName   = `${baseName}_compressed.pdf`;

            setResult({
              originalSize:   d.originalSize,
              compressedSize: d.compressedSize,
              targetSize:     computeTargetSize(d.originalSize, targetPct),
              passes:         d.passes,
              downloadUrl:    url,
              fileName:       dlName,
            });
            setStage('done');
            worker.terminate();
            workerRef.current = null;
            break;
          }
          case 'ERROR': {
            const err = payload as { message: string };
            setErrorMsg(err.message);
            setStage('error');
            worker.terminate();
            workerRef.current = null;
            break;
          }
        }
      };

      worker.onerror = (err) => {
        console.error('Worker error:', err);
        setErrorMsg('An unexpected error occurred in the compression engine. Please try again.');
        setStage('error');
        worker.terminate();
        workerRef.current = null;
      };

      // Send work to worker — transfer the buffer for zero-copy
      worker.postMessage(
        { type: 'COMPRESS', payload: { buffer, targetPct, fileName: file.name } },
        [buffer]
      );
    };

    reader.onerror = () => {
      setStage('error');
      setErrorMsg('Failed to read the file. It may be corrupted or inaccessible.');
    };

    reader.readAsArrayBuffer(file);
  }, [clearAnalysisTimeout, file, targetPct]);

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    clearAnalysisTimeout();
    workerRef.current = null;
    if (resultUrlRef.current) { URL.revokeObjectURL(resultUrlRef.current); resultUrlRef.current = null; }
    setStage('idle');
    setFile(null);
    setAnalysis(null);
    setProgress(DEFAULT_PROGRESS);
    setResult(null);
    setErrorMsg(null);
    setTargetPct(50);
  }, [clearAnalysisTimeout]);

  return {
    stage,
    file,
    analysis,
    progress,
    result,
    errorMsg,
    targetPct,
    setTargetPct,
    loadFile,
    startCompress,
    reset,
  };
}
