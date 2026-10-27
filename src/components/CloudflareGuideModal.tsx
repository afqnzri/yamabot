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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
              <div className="flex items-center gap-2 text-slate-900 font-semibold mb-2">
                <Cloud className="w-4 h-4 text-orange-500" />
                Component 1: Web App (Cloudflare Pages)
              </div>
              <ul className="text-xs space-y-1.5 text-slate-600">
                <li>• Hosts your hotel mapping interface & live dashboard</li>
                <li>• Allows hotel staff to edit room mappings anytime</li>
                <li>• Free SSL certificate, global CDN, and custom domain</li>
                <li>• Generates and downloads Excel reports on demand</li>
              </ul>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
              <div className="flex items-center gap-2 text-slate-900 font-semibold mb-2">
                <Zap className="w-4 h-4 text-blue-600" />
                Component 2: Automated Daily Bot (Cron)
              </div>
              <ul className="text-xs space-y-1.5 text-slate-600">
                <li>• Automated headless execution (every morning at 8:00 AM)</li>
                <li>• Queries RapidAPI Booking.com endpoints</li>
                <li>• Calculates min/avg rates and generates dated <code>.xlsx</code></li>
                <li>• Dispatches report directly to your Telegram chat</li>
              </ul>
            </div>
          </div>

          {/* Step by step guide */}
          <div className="space-y-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-700" />
              Step-by-Step Deployment Instructions
            </h3>

            {/* Step 1 */}
            <div className="border-l-2 border-orange-500 pl-4 space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-orange-600">Step 1</div>
              <h4 className="font-semibold text-slate-900 text-sm">Deploy Web Interface to Cloudflare Pages</h4>
              <p className="text-xs text-slate-600">
                Push this project to your GitHub repository, then open the Cloudflare dashboard:
              </p>
              <div className="bg-slate-900 text-slate-200 p-3 rounded-lg text-xs font-mono mt-2 space-y-1">
                <p>1. Go to Cloudflare Dashboard &gt; <strong>Workers & Pages</strong> &gt; <strong>Create application</strong> &gt; <strong>Pages</strong></p>
                <p>2. Select <strong>Connect to Git</strong> and choose your repository</p>
                <p>3. Framework preset: <span className="text-amber-400">Vite</span></p>
                <p>4. Build command: <span className="text-amber-400">npm run build</span></p>
                <p>5. Build output directory: <span className="text-amber-400">dist</span></p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="border-l-2 border-blue-500 pl-4 space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-blue-600">Step 2</div>
              <h4 className="font-semibold text-slate-900 text-sm">Deploy via Wrangler CLI (Alternative)</h4>
              <p className="text-xs text-slate-600">If you prefer deploying straight from your terminal:</p>
              <div className="bg-slate-900 text-slate-200 p-2.5 rounded-lg text-xs font-mono mt-1">
                <code>npm run build && npx wrangler pages deploy dist --project-name=yama-bot</code>
              </div>
            </div>

            {/* Step 3 */}
            <div className="border-l-2 border-emerald-500 pl-4 space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-600">Step 3</div>
              <h4 className="font-semibold text-slate-900 text-sm">Enable Automated 24/7 Daily Telegram Alerts</h4>
              <p className="text-xs text-slate-600">
                In your GitHub repository, go to <strong>Settings</strong> &gt; <strong>Secrets</strong> &gt; <strong>Actions</strong> and add:
              </p>
              <div className="grid grid-cols-2 gap-2 mt-2 text-xs font-mono bg-slate-100 p-2.5 rounded-lg border border-slate-200">
                <div><span className="font-bold text-slate-800">RAPIDAPI_KEY</span>: your key</div>
                <div><span className="font-bold text-slate-800">TELEGRAM_BOT_TOKEN</span>: your token</div>
                <div><span className="font-bold text-slate-800">TELEGRAM_CHAT_ID</span>: your chat ID</div>
                <div><span className="font-bold text-slate-800">RAPIDAPI_HOST</span>: booking-com15.p.rapidapi.com</div>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                The included <code>.github/workflows/daily_price_monitor.yml</code> will automatically run every day at your chosen time and forward the dated Excel report directly to Telegram!
              </p>
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
