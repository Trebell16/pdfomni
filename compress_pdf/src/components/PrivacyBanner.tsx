/**
 * PrivacyBanner.tsx
 * ------------------
 * Prominent privacy notice displayed at the top of the app.
 */

import React from 'react';
import { ShieldCheck } from 'lucide-react';

export const PrivacyBanner: React.FC = () => (
  <div className="flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-2xl
    bg-emerald-50 border border-emerald-100 text-xs text-emerald-800 shadow-sm">
    <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
    <span>
      <strong>100% Private:</strong> All PDF processing occurs locally in your browser.
      Your files are <strong>never uploaded</strong> to any server.
    </span>
  </div>
);
