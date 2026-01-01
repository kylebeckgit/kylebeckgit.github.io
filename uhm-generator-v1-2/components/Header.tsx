
import React from 'react';
import { Activity, Globe, Zap, Coffee } from 'lucide-react';
import { AppView } from '../types';

interface HeaderProps {
  currentView: AppView;
  onChangeView: (view: AppView) => void;
}

const Header: React.FC<HeaderProps> = ({ currentView, onChangeView }) => {
  return (
    <header className="flex flex-col md:flex-row md:items-center justify-between py-4 px-8 border-b border-white/5 bg-slate-950/50 backdrop-blur-md sticky top-0 z-40 gap-4 md:gap-0">
      <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onChangeView('generator')}>
        <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 rounded-lg border border-cyan-500/20">
            <Activity className="w-6 h-6 text-cyan-400" />
        </div>
        <div>
            <h1 className="text-2xl font-bold tracking-tighter text-white">
            .uhm Generator
            </h1>
            <p className="text-xs text-slate-500 font-mono uppercase tracking-widest">For u-he Hive 2</p>
        </div>
      </div>

      <nav className="flex items-center bg-slate-900/50 p-1 rounded-lg border border-slate-800 self-start md:self-center">
        <button
          onClick={() => onChangeView('generator')}
          className={`px-4 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${
            currentView === 'generator' 
              ? 'bg-slate-800 text-white shadow-sm' 
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Generator</span>
        </button>
        <button
          onClick={() => onChangeView('discover')}
          className={`px-4 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${
            currentView === 'discover' 
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Discover</span>
          <span className="bg-indigo-500/20 text-indigo-300 text-[10px] px-1.5 rounded-full">New</span>
        </button>
      </nav>

      <div className="flex items-center space-x-4 self-end md:self-center">
        <a 
            href="https://buymeacoffee.com/kylebeck"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 px-4 py-2 rounded-lg text-sm font-bold transition-all hover:scale-105"
        >
            <Coffee className="w-4 h-4" />
            <span>Buy me a coffee</span>
        </a>
      </div>
    </header>
  );
};

export default Header;
