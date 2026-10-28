import React from 'react';
import { X, Cloud, Terminal, CheckCircle2, ArrowRight, ExternalLink, Zap, ShieldCheck } from 'lucide-react';

interface CloudflareGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloudflareGuideModal: React.FC<CloudflareGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-600 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Cloud className="w-6 h-6 text-white" />
            <div>
              <h2 className="text-lg font-bold">Deploying YAMA Bot to Cloudflare</h2>
              <p className="text-xs text-orange-100">Full Cloudflare Pages & Automated Cron Architecture</p>
            </div>
          </div>
          <button onClick={onClose} className="text-orange-200 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-700">
          {/* Quick Answer Banner */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-emerald-900 text-sm">
                Yes! You can host this entire system with 100% free Cloudflare services.
              </h4>
              <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                The visual web application builds directly with Vite and deploys to <strong>Cloudflare Pages</strong>. For the daily automated 24/7 price extraction and Telegram alerts, you can either trigger extractions on-demand from the Pages dashboard or run the included <strong>GitHub Actions daily cron</strong>.
              </p>
            </div>
          </div>

          {/* Architecture Card */}
          {/* Architecture Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50">
              <div className="flex items-center gap-1.5 text-slate-900 font-semibold mb-1 text-xs">
                <Cloud className="w-4 h-4 text-orange-500" />
                1. Web App (Pages)
              </div>
              <ul className="text-[11px] space-y-1 text-slate-600">
                <li>• Room mapping interface &amp; live dashboard</li>
                <li>• Free SSL certificate, global CDN</li>
                <li>• Fast Vite build deployed globally</li>
              </ul>
            </div>

            <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50">
              <div className="flex items-center gap-1.5 text-slate-900 font-semibold mb-1 text-xs">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                2. Database (Cloudflare D1)
              </div>
              <ul className="text-[11px] space-y-1 text-slate-600">
                <li>• Serverless SQLite relational database</li>
                <li>• Auto-scales to zero with free tier</li>
                <li>• Stores rooms, mappings &amp; run history</li>
              </ul>
            </div>

            <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50">
              <div className="flex items-center gap-1.5 text-slate-900 font-semibold mb-1 text-xs">
                <Zap className="w-4 h-4 text-blue-600" />
                3. Automated Cron
              </div>
              <ul className="text-[11px] space-y-1 text-slate-600">
                <li>• Daily automated price query</li>
                <li>• Rates calculated in MYR</li>
                <li>• Dated Excel report to Telegram</li>
              </ul>
            </div>
          </div>

          {/* Step by step guide */}
          <div className="space-y-4">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-700" />
              Step-by-Step Cloudflare + D1 Database Deployment
            </h3>

            {/* Step 1 */}
            <div className="border-l-2 border-indigo-500 pl-4 space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-indigo-600">Step 1: Create &amp; Provision Cloudflare D1 Database</div>
              <p className="text-xs text-slate-600">Run in your terminal using Wrangler:</p>
              <div className="bg-slate-900 text-slate-200 p-2.5 rounded-lg text-xs font-mono mt-1 space-y-1">
                <code>npx wrangler d1 create yama_db</code>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Copy the <code>database_id</code> returned by Cloudflare and paste it into your <code>wrangler.toml</code> file.
              </p>
            </div>

            {/* Step 2 */}
            <div className="border-l-2 border-orange-500 pl-4 space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-orange-600">Step 2: Initialize D1 Relational Schema</div>
              <p className="text-xs text-slate-600">Execute the included schema to create all 8 database tables:</p>
              <div className="bg-slate-900 text-slate-200 p-2.5 rounded-lg text-xs font-mono mt-1">
                <code>npx wrangler d1 execute yama_db --file=src/db/schema.sql</code>
              </div>
            </div>

            {/* Step 3 */}
            <div className="border-l-2 border-emerald-500 pl-4 space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-600">Step 3: Deploy Full-Stack to Cloudflare Pages</div>
              <p className="text-xs text-slate-600">Build and deploy the application and serverless D1 API functions:</p>
              <div className="bg-slate-900 text-slate-200 p-2.5 rounded-lg text-xs font-mono mt-1">
                <code>npm run build && npx wrangler pages deploy dist --project-name=yama-bot</code>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex justify-between items-center shrink-0">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Static client build - No backend server costs on Cloudflare
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-semibold"
          >
            Got it, thanks!
          </button>
        </div>
      </div>
    </div>
  );
};
