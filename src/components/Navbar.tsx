import React from 'react';
import { 
  Building2, 
  Settings, 
  Layers, 
  Activity
} from 'lucide-react';

interface NavbarProps {
  activeTab: 'flow1' | 'flow2';
  setActiveTab: (tab: 'flow1' | 'flow2') => void;
  onOpenSettings: () => void;
  isSimulated: boolean;
  telegramConfigured: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenSettings,
  isSimulated,
  telegramConfigured
}) => {
  return (
    <header className="bg-white text-slate-900 border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Clean Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              Y
            </div>
            <span className="font-semibold text-base text-slate-900 tracking-tight">
              YAMA Bot
            </span>
          </div>

          {/* Clean Segmented Tab Control */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200/80">
            <button
              onClick={() => setActiveTab('flow1')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'flow1'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>Flow 1: Room Mapping</span>
            </button>
            <button
              onClick={() => setActiveTab('flow2')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'flow2'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-slate-500" />
              <span>Flow 2: Price Monitoring</span>
            </button>
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
              <span className={`w-2 h-2 rounded-full ${isSimulated ? 'bg-amber-500' : 'bg-emerald-600'}`} />
              <span className="font-medium text-slate-600">
                {isSimulated ? 'Mod Simulasi' : 'Live Booking API'}
              </span>
            </div>

            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-medium transition-colors shadow-xs"
              title="Tetapan & Integrasi"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>Tetapan</span>
              {telegramConfigured && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 ml-0.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
