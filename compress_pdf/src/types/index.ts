/**
 * Shared TypeScript types for PDF Compressor application.
 */

export type AppStage =
  | 'idle'         // No file loaded
  | 'loaded'       // File loaded, ready to compress
  | 'compressing'  // Compression in progress
  | 'done'         // Compression complete
  | 'error';       // Error state

export interface PdfAnalysis {
  pages: number;
  images: number;
  fonts: number;
  originalSize: number; // bytes
}

export interface PassRecord {
  pass: number;
  size: number;           // bytes
  qualityLabel: string;
}

export interface CompressionResult {
  originalSize: number;   // bytes
  compressedSize: number; // bytes
  targetSize: number;     // bytes (= originalSize * targetPct/100)
  passes: PassRecord[];
  downloadUrl: string;    // object URL
  fileName: string;
}

export interface ProgressState {
  stage: string;          // e.g. 'analysis', 'images', 'saving'
  pct: number;            // 0–100
  message: string;
}

export interface WorkerMessage {
  type: 'PROGRESS' | 'ANALYSIS' | 'DONE' | 'ERROR';
  payload: unknown;
}

/** Quality impact label for UI preview */
export type QualityImpact = 'Minimal' | 'Low' | 'Medium' | 'High' | 'Maximum Safe';

export function getQualityImpact(targetPct: number): QualityImpact {
  if (targetPct >= 80) return 'Minimal';
  if (targetPct >= 60) return 'Low';
  if (targetPct >= 40) return 'Medium';
  if (targetPct >= 25) return 'High';
  return 'Maximum Safe';
}

export function getQualityColor(impact: QualityImpact): string {
  switch (impact) {
    case 'Minimal':      return 'text-emerald-700';
    case 'Low':          return 'text-green-700';
    case 'Medium':       return 'text-amber-700';
    case 'High':         return 'text-orange-700';
    case 'Maximum Safe': return 'text-red-700';
  }
}

export function getQualityBg(impact: QualityImpact): string {
  switch (impact) {
    case 'Minimal':      return 'bg-emerald-50 border-emerald-200';
    case 'Low':          return 'bg-green-50 border-green-200';
    case 'Medium':       return 'bg-amber-50 border-amber-200';
    case 'High':         return 'bg-orange-50 border-orange-200';
    case 'Maximum Safe': return 'bg-red-50 border-red-200';
  }
}
