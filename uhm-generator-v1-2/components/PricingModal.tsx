import React from 'react';
import { Check, X, Zap, Package, Music, Infinity as InfinityIcon } from 'lucide-react';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}

const PricingModal: React.FC<PricingModalProps> = ({ isOpen, onClose, onUpgrade }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>
      
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-300 flex flex-col md:flex-row">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-white z-10 p-1 bg-slate-800/50 rounded-full"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Free Tier */}
        <div className="flex-1 p-8 flex flex-col border-b md:border-b-0 md:border-r border-slate-700 bg-slate-900/50">
          <h3 className="text-xl font-bold text-slate-200 mb-2">Hobbyist</h3>
          <div className="text-3xl font-bold text-white mb-6">$0 <span className="text-sm font-normal text-slate-500">/ forever</span></div>
          
          <ul className="space-y-4 mb-8 flex-1">
            <li className="flex items-start space-x-3 text-slate-300">
              <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <span className="text-sm">5 Generations per day</span>
            </li>
            <li className="flex items-start space-x-3 text-slate-300">
              <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <span className="text-sm">Standard Scripting Engine</span>
            </li>
            <li className="flex items-start space-x-3 text-slate-300">
              <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <span className="text-sm">Basic Visualizer</span>
            </li>
            <li className="flex items-start space-x-3 text-slate-500 opacity-50">
              <X className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">Audio-to-UHM Conversion</span>
            </li>
            <li className="flex items-start space-x-3 text-slate-500 opacity-50">
              <X className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">Library Batch Generator</span>
            </li>
          </ul>

          <button 
            disabled
            className="w-full py-3 rounded-lg border border-slate-700 text-slate-400 font-bold text-sm bg-slate-800/50 cursor-default"
          >
            Current Plan
          </button>
        </div>

        {/* Pro Tier */}
        <div className="flex-1 p-8 flex flex-col bg-gradient-to-b from-slate-900 to-indigo-950/30 relative">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-400 to-indigo-500"></div>
          
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-xl font-bold text-white">Pro Studio</h3>
            <span className="bg-indigo-500 text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
              Popular
            </span>
          </div>
          <div className="text-3xl font-bold text-white mb-6">$12 <span className="text-sm font-normal text-slate-400">/ month</span></div>
          
          <ul className="space-y-4 mb-8 flex-1">
            <li className="flex items-start space-x-3 text-white">
              <div className="p-1 bg-cyan-500/20 rounded-full">
                 <InfinityIcon className="w-3 h-3 text-cyan-400" />
              </div>
              <span className="text-sm font-semibold">Unlimited Generations</span>
            </li>
            <li className="flex items-start space-x-3 text-white">
              <div className="p-1 bg-indigo-500/20 rounded-full">
                 <Package className="w-3 h-3 text-indigo-400" />
              </div>
              <span className="text-sm font-semibold">Library Generator (200+ Presets)</span>
            </li>
             <li className="flex items-start space-x-3 text-white">
              <div className="p-1 bg-fuchsia-500/20 rounded-full">
                 <Music className="w-3 h-3 text-fuchsia-400" />
              </div>
              <span className="text-sm font-semibold">Audio-to-UHM Conversion</span>
            </li>
            <li className="flex items-start space-x-3 text-white">
              <div className="p-1 bg-emerald-500/20 rounded-full">
                 <Zap className="w-3 h-3 text-emerald-400" />
              </div>
              <span className="text-sm font-semibold">Commercial License</span>
            </li>
          </ul>

          <button 
            onClick={() => {
              onUpgrade();
              onClose();
            }}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 transition-all transform hover:scale-[1.02]"
          >
            Upgrade to Pro
          </button>
          <p className="text-center text-xs text-slate-500 mt-3">7-day money-back guarantee</p>
        </div>

      </div>
    </div>
  );
};

export default PricingModal;