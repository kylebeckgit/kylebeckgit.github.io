
import React, { useState, useEffect, useRef } from 'react';
import { Wand2, RefreshCw, Zap, Upload, Music, FileAudio, X } from 'lucide-react';

interface InputSectionProps {
  onGenerate: (prompt: string, isAudio?: boolean, audioData?: string) => void;
  isLoading: boolean;
}

const SIMPLE_SUGGESTIONS = [
  'Deep sub bass for techno',
  'Bright sawtooth lead',
  'Soft ambient pad',
  'Metallic FM bell',
  'Distorted 808 bass',
  'Retro sci-fi scanner',
  'Warm analog strings',
  'Glassy texture',
  'Heavy dubstep growl',
  'Chiptune arpeggio',
  'Dark cinematic drone',
  'Plucky synth bass',
  'Evolving vocal choir',
  'Underwater bubbles',
  'Broken radio static',
  'Laser zap effect',
  'PWM Square Wave',
  'Vocal VOSIM Texture',
  'Bitcrushed Sine',
  'Karplus Strong Pluck'
];

const COMPLEX_SUGGESTIONS = [
  // FM & Phase Distortion (Advanced)
  'Classic 2-operator FM Bass: Use aux buffers to create a modulator sine that distorts the carrier phase',
  '3-Op FM Bell: Stacked sine waves with non-integer ratios for metallic inharmonic tones',
  'Aggressive Phase Distortion: Warping a sine wave using a "kink" formula that evolves over the table',
  
  // Vocal & Formant (VOSIM/Additive)
  'VOSIM Vocal Synth: Emulate human vowels using the (1-phase)*abs(sin(...)) formula pattern',
  'Robotic Formant Sweep: Spectral additive synthesis focusing on harmonics 7 and 12 for "Ah" vowel',
  'Throat Singing Drone: Deep fundamental with high-frequency formant clusters jittering randomly',

  // Physical Modeling / Karplus (Feedback)
  'Karplus-Strong Pluck: Noisy burst that decays into a sine using recursive lowpass filtering logic',
  'Resonant Metallic Strike: Short impulse passed through a high-resonance bandpass filter sweep',

  // Morphing & Interpolation
  'Morphing Filter Sweep: Interpolate from a dull lowpassed saw at frame 0 to a bright noise at frame 100',
  'Wavetable PWM: A square wave where the pulse width narrows from 50% to 5% across the table',
  'Shape-Shifter: Start as a Triangle wave, morph into a Saw, and end as a Bit-Crushed Sine',

  // Lo-Fi & Glitch
  'Bit-Crushed Sweep: A pure sine wave that progressively reduces bit-depth using the round() function',
  'Glitch Texture: Randomly switching waveforms every 10 frames using modulus logic',
  
  // Existing favorites
  'Biomechanical neuro bass morphing from sine to crushed square using phase distortion',
  'Ethereal choir pad morphing through vowels A-E-I-O-U using spectral windows'
];

const getRandomSuggestions = (count: number, isComplex: boolean) => {
  const pool = isComplex ? COMPLEX_SUGGESTIONS : SIMPLE_SUGGESTIONS;
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

const InputSection: React.FC<InputSectionProps> = ({ onGenerate, isLoading }) => {
  const [activeTab, setActiveTab] = useState<'text' | 'audio'>('text');
  const [prompt, setPrompt] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isComplexMode, setIsComplexMode] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSuggestions(getRandomSuggestions(4, isComplexMode));
  }, [isComplexMode]);

  const handleRefreshSuggestions = () => {
    setSuggestions(getRandomSuggestions(4, isComplexMode));
  };

  const toggleComplexity = () => {
    setIsComplexMode(!isComplexMode);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (activeTab === 'text') {
      if (prompt.trim()) {
        onGenerate(prompt, false);
      }
    } else {
      if (file) {
        // Read file
        const reader = new FileReader();
        reader.onload = (ev) => {
          const result = ev.target?.result as string;
          if (result) {
            onGenerate("Audio Conversion", true, result);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type === 'audio/wav' || selectedFile.name.endsWith('.wav')) {
        if (selectedFile.size > 5 * 1024 * 1024) {
          setFileError("File size must be under 5MB");
          setFile(null);
        } else {
          setFile(selectedFile);
          setFileError(null);
        }
      } else {
        setFileError("Please upload a .wav file");
        setFile(null);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
       const selectedFile = e.dataTransfer.files[0];
       if (selectedFile.type === 'audio/wav' || selectedFile.name.endsWith('.wav')) {
         if (selectedFile.size > 5 * 1024 * 1024) {
           setFileError("File size must be under 5MB");
           setFile(null);
         } else {
           setFile(selectedFile);
           setFileError(null);
         }
       } else {
         setFileError("Please upload a .wav file");
         setFile(null);
       }
    }
  };

  const clearFile = () => {
    setFile(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <section className="w-full max-w-2xl mx-auto mt-8 px-4">
      <div className="flex space-x-1 mb-4 bg-slate-900/50 p-1 rounded-lg w-max mx-auto border border-slate-800">
        <button
          onClick={() => setActiveTab('text')}
          disabled={isLoading}
          className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
            activeTab === 'text' 
              ? 'bg-slate-800 text-white shadow-sm' 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Text Description
        </button>
        <button
          onClick={() => setActiveTab('audio')}
          disabled={isLoading}
          className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'audio' 
              ? 'bg-slate-800 text-white shadow-sm' 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Audio to UHM</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
        {activeTab === 'text' ? (
          <div className="relative animate-in fade-in zoom-in-95 duration-300">
            <label htmlFor="prompt" className="block text-sm font-medium text-slate-300 mb-2">
              Describe your wavetable
            </label>
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg blur opacity-30 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={isComplexMode 
                  ? "e.g., An aggressive neuro bass that morphs into a metallic scream using phase distortion..."
                  : "e.g., A deep sub bass..."}
                className="relative w-full h-32 bg-slate-900 text-slate-100 border border-slate-700 rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-slate-600 resize-none font-sans text-lg"
                disabled={isLoading}
              />
            </div>
          </div>
        ) : (
          <div className="relative animate-in fade-in zoom-in-95 duration-300">
            <label className="block text-sm font-medium text-slate-300 mb-2 flex justify-between">
              <span>Upload Audio Reference (.wav)</span>
            </label>
            
            <div 
                className={`
                    relative w-full h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors cursor-pointer
                    ${file 
                    ? 'bg-slate-800/80 border-cyan-500/50' 
                    : 'bg-slate-900 border-slate-700 hover:border-cyan-500/50 hover:bg-slate-800'}
                `}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => !file && fileInputRef.current?.click()}
            >
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    className="hidden" 
                    accept=".wav,audio/wav"
                />
                
                {file ? (
                    <div className="flex items-center space-x-4">
                    <div className="p-3 bg-cyan-900/30 rounded-full">
                        <Music className="w-8 h-8 text-cyan-400" />
                    </div>
                    <div className="text-left">
                        <p className="text-sm font-bold text-white max-w-[200px] truncate">{file.name}</p>
                        <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button 
                        onClick={(e) => { e.stopPropagation(); clearFile(); }}
                        className="p-1 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    </div>
                ) : (
                    <>
                    <Upload className="w-8 h-8 text-slate-500 mb-2" />
                    <p className="text-sm text-slate-400 font-medium">Click to upload or drag & drop</p>
                    <p className="text-xs text-slate-600 mt-1">MAX 5MB (WAV only)</p>
                    </>
                )}
            </div>
            
            {fileError && <p className="text-red-400 text-xs mt-2 text-center font-bold">{fileError}</p>}
          </div>
        )}
        
        <button
          type="submit"
          disabled={isLoading || (activeTab === 'text' ? !prompt.trim() : !file)}
          className={`
            relative flex items-center justify-center space-x-2 py-4 px-6 rounded-lg font-bold text-white transition-all duration-200
            ${isLoading || (activeTab === 'text' ? !prompt.trim() : !file)
              ? 'bg-slate-800 cursor-not-allowed text-slate-500' 
              : 'bg-cyan-600 hover:bg-cyan-500 shadow-lg shadow-cyan-500/20 active:scale-95'}
          `}
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>{activeTab === 'text' ? 'Synthesizing Script...' : 'Analyzing & Converting...'}</span>
            </>
          ) : (
            <>
              {activeTab === 'text' ? <Wand2 className="w-5 h-5" /> : <FileAudio className="w-5 h-5" />}
              <span>{activeTab === 'text' ? 'Generate .uhm Script' : 'Convert WAV to .uhm'}</span>
            </>
          )}
        </button>
      </form>
      
      {activeTab === 'text' && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Try a creative preset idea</span>
              
              <button
                onClick={toggleComplexity}
                className={`flex items-center space-x-1.5 px-2 py-1 rounded text-xs font-bold transition-all border ${
                  isComplexMode 
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50' 
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <Zap className={`w-3 h-3 ${isComplexMode ? 'fill-indigo-300' : ''}`} />
                <span>{isComplexMode ? 'Complex Ideas' : 'Add Complexity'}</span>
              </button>
            </div>

            <button 
              onClick={handleRefreshSuggestions}
              className="flex items-center space-x-1 text-xs text-slate-400 hover:text-cyan-400 transition-colors"
              title="Refresh suggestions"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setPrompt(suggestion)}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-cyan-400 py-2 px-3 rounded-md border border-slate-700 transition-colors text-left leading-tight max-w-full truncate"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default InputSection;
