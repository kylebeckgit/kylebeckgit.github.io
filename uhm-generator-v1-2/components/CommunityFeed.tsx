
import React, { useState } from 'react';
import { Heart, Download, Copy, Search, User, Tag, Check } from 'lucide-react';
import { CommunityPreset } from '../types';

interface CommunityFeedProps {
  presets: CommunityPreset[];
  onLoadPreset: (script: string) => void;
}

const CommunityFeed: React.FC<CommunityFeedProps> = ({ presets, onLoadPreset }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredPresets = presets.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleCopy = (id: string, script: string) => {
    navigator.clipboard.writeText(script);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (name: string, script: string) => {
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}.uhm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-6xl mx-auto mt-8 px-4 mb-20">
      {/* Header */}
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-white mb-2">Community Library</h2>
        <p className="text-slate-400">Discover and download wavetables curated by sound designers.</p>
      </div>

      {/* Search */}
      <div className="relative max-w-xl mx-auto mb-10">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-500" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl leading-5 bg-slate-900 text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          placeholder="Search for 'bass', 'pad', 'neuro'..."
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPresets.map((preset) => (
          <div key={preset.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-indigo-500/50 transition-all group hover:shadow-xl hover:shadow-indigo-900/10 flex flex-col">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">{preset.name}</h3>
                <div className="flex items-center text-xs text-slate-500 mt-1">
                  <User className="w-3 h-3 mr-1" />
                  <span>{preset.author}</span>
                  <span className="mx-2">•</span>
                  <span>{preset.date}</span>
                </div>
              </div>
              <div className="flex items-center space-x-1 bg-slate-800/50 px-2 py-1 rounded-full">
                <Heart className="w-3 h-3 text-fuchsia-500 fill-fuchsia-500" />
                <span className="text-xs font-bold text-fuchsia-200">{preset.likes}</span>
              </div>
            </div>

            <p className="text-sm text-slate-400 mb-4 flex-grow line-clamp-2">{preset.description}</p>

            <div className="flex flex-wrap gap-2 mb-4">
              {preset.tags.map(tag => (
                <span key={tag} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700">
                  #{tag}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-4 border-t border-slate-800">
              <button 
                onClick={() => onLoadPreset(preset.script)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg text-xs font-bold transition-colors"
              >
                Load to Editor
              </button>
              
              <button 
                onClick={() => handleCopy(preset.id, preset.script)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                title="Copy Code"
              >
                {copiedId === preset.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
              
              <button 
                onClick={() => handleDownload(preset.name, preset.script)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                title="Download .uhm"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CommunityFeed;
