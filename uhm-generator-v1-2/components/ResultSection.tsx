
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Copy, Download, Check, FileCode, BookOpen, Sparkles, Layers, RefreshCw, Library, Package, Play, Square, Globe, ThumbsUp, Mic } from 'lucide-react';
import Visualizer from './Visualizer';

interface ResultSectionProps {
  result: string;
  variations?: string[];
  isGeneratingVariations?: boolean;
  onGenerateVariations?: (script: string) => void;
  isGeneratingLibrary?: boolean;
  libraryProgress?: number;
  libraryTotal?: number;
  onGenerateLibrary?: (script: string, count: number) => void;
  previewCode: string | null;
  isGeneratingPreview: boolean;
  onGeneratePreview?: (script: string) => void;
  // Visualizer Props
  visualizerCache?: Record<string, string>;
  isGeneratingVisualizer?: boolean;
  onGenerateVisualizer?: (script: string) => void;
  // Community Props
  onPublish?: (script: string, name: string) => void;
}

interface Token {
  type: 'keyword' | 'attribute' | 'string' | 'number' | 'comment' | 'whitespace' | 'operator' | 'text';
  value: string;
}

const UHM_KEYWORDS = new Set(['Info', 'NumFrames', 'Spectrum', 'Wave', 'Phase', 'Normalize']);

const tokenizeUHM = (code: string): Token[] => {
  const tokens: Token[] = [];
  let cursor = 0;

  while (cursor < code.length) {
    const char = code[cursor];
    const remaining = code.slice(cursor);

    // 1. Whitespace
    const whitespaceMatch = remaining.match(/^\s+/);
    if (whitespaceMatch) {
      tokens.push({ type: 'whitespace', value: whitespaceMatch[0] });
      cursor += whitespaceMatch[0].length;
      continue;
    }

    // 2. Comments
    if (remaining.startsWith('//')) {
      const lineEnd = remaining.indexOf('\n');
      const value = lineEnd === -1 ? remaining : remaining.slice(0, lineEnd);
      tokens.push({ type: 'comment', value });
      cursor += value.length;
      continue;
    }

    // 3. Strings (formulas)
    if (char === '"') {
      let end = 1;
      while (end < remaining.length) {
        if (remaining[end] === '"' && remaining[end - 1] !== '\\') {
          end++;
          break;
        }
        end++;
      }
      tokens.push({ type: 'string', value: remaining.slice(0, end) });
      cursor += end;
      continue;
    }

    // 4. Attributes
    const attrMatch = remaining.match(/^[a-z]+(?==)/);
    if (attrMatch) {
      tokens.push({ type: 'attribute', value: attrMatch[0] });
      cursor += attrMatch[0].length;
      continue;
    }

    // 5. Keywords and Identifiers
    const wordMatch = remaining.match(/^[A-Za-z_]\w*/);
    if (wordMatch) {
      const word = wordMatch[0];
      if (UHM_KEYWORDS.has(word)) {
        tokens.push({ type: 'keyword', value: word });
      } else {
        tokens.push({ type: 'text', value: word });
      }
      cursor += word.length;
      continue;
    }

    // 6. Numbers
    const numberMatch = remaining.match(/^-?\d+(\.\d+)?/);
    if (numberMatch) {
      tokens.push({ type: 'number', value: numberMatch[0] });
      cursor += numberMatch[0].length;
      continue;
    }

    // 7. Operators and Symbols
    if (/[=(){},]/.test(char)) {
      tokens.push({ type: 'operator', value: char });
      cursor++;
      continue;
    }

    // Fallback
    tokens.push({ type: 'text', value: char });
    cursor++;
  }

  return tokens;
};

const getLineExplanation = (line: string): string | null => {
  const cleanLine = line.trim();
  if (!cleanLine) return null;
  
  // Comments
  if (cleanLine.startsWith('//')) return "User information / comment.";
  
  // Meta Commands
  if (cleanLine.startsWith('Info')) return "Meta: Sets the preset name displayed in the Hive browser.";
  if (cleanLine.startsWith('NumFrames')) return "Meta: Defines the wavetable length (typically 100 for Hive).";
  
  // Normalization
  if (cleanLine.startsWith('Normalize')) {
    if (cleanLine.includes('base=each')) return "Dynamics: Maximizes volume per frame (prevents quiet spots).";
    return "Dynamics: Maximizes volume across the entire wavetable.";
  }

  // Phase
  if (cleanLine.startsWith('Phase')) {
    return "Phase Distortion: Warps the readout phase for FM/PD effects.";
  }

  // Helper to check formula contents
  const quoteMatch = cleanLine.match(/"([^"]*)"/);
  const formula = quoteMatch ? quoteMatch[1] : "";
  const hasTable = formula.includes('table') || formula.includes('frame');

  // Spectrum Commands
  if (cleanLine.startsWith('Spectrum')) {
    // Cleanup Check
    if (cleanLine.includes('lowest=0') && cleanLine.includes('highest=0')) {
      return "Cleanup: Removes DC offset (0Hz) & extreme highs to prevent clicking.";
    }
    
    let expl = "";
    if (cleanLine.includes('blend=add')) expl += "Add: ";
    else expl += "Base: ";
    
    // Formula Analysis
    if (formula.includes('rand')) expl += "Injects spectral noise/air. ";
    else if (formula.includes('sin') || formula.includes('cos')) expl += "Creates formant-like harmonic clusters. ";
    else expl += "Sets harmonic amplitudes. ";
    
    // Range Analysis
    const lowestMatch = cleanLine.match(/lowest=(\d+)/);
    const highestMatch = cleanLine.match(/highest=(\d+)/);
    if (lowestMatch && highestMatch) {
       expl += `(Harmonics ${lowestMatch[1]}-${highestMatch[1]})`;
    }

    if (hasTable) expl += " Morphs over time.";
    
    return expl;
  }
  
  // Wave Commands
  if (cleanLine.startsWith('Wave')) {
    let expl = "";
    
    // Blend Mode
    if (cleanLine.includes('blend=add')) expl = "Layer: Adds ";
    else expl = "Base: Generates ";
    
    // Synthesis Type Analysis
    if (formula.includes('tanh')) {
       expl += "saturated/distorted signal (tanh). ";
    } else if (formula.includes('rand') || formula.includes('noise')) {
       expl += "noise/grit texture. ";
    } else if (formula.includes('lowpass') || formula.includes('bandpass')) {
       expl += "subtractive filter sweep. ";
    } else if (formula.includes('sin') && formula.includes('sin(')) {
       // Nested sin often implies FM
       expl += "FM-modulated sine wave. ";
    } else if (formula.includes('sin')) {
       expl += "fundamental sine wave. ";
    } else {
       expl += "mathematical waveform. ";
    }
    
    if (hasTable) {
      expl += "Morphs frame-by-frame.";
    }
    
    return expl;
  }

  return null;
};

const ResultSection: React.FC<ResultSectionProps> = ({ 
  result, 
  variations = [], 
  isGeneratingVariations = false, 
  onGenerateVariations,
  isGeneratingLibrary = false,
  libraryProgress = 0,
  libraryTotal = 0,
  onGenerateLibrary,
  previewCode,
  isGeneratingPreview,
  onGeneratePreview,
  visualizerCache = {},
  isGeneratingVisualizer = false,
  onGenerateVisualizer,
  onPublish
}) => {
  const [copied, setCopied] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [code, setCode] = useState('');
  const [showExplanations, setShowExplanations] = useState(false);
  const [activeTabIndex, setActiveTabIndex] = useState(-1); // -1 = Original, 0-4 = Variations
  
  const [librarySize, setLibrarySize] = useState(25);
  const [showLibraryPanel, setShowLibraryPanel] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasLiked, setHasLiked] = useState(false);
  const [isPublished, setIsPublished] = useState(false);

  // Audio Context Ref
  const audioCtxRef = useRef<AudioContext | null>(null);

  const activeRawScript = activeTabIndex === -1 ? result : variations[activeTabIndex];
  const isAudioAnalysis = result.includes("SPEECH RESYNTHESIS") || explanation.toLowerCase().includes("analyze") || explanation.toLowerCase().includes("audio");

  useEffect(() => {
    setActiveTabIndex(-1);
    setIsPublished(false);
    setHasLiked(false);
  }, [result]);

  useEffect(() => {
    // Reset interaction states when switching variations
    setIsPublished(false);
    setHasLiked(false);
  }, [activeTabIndex]);

  useEffect(() => {
    if (!activeRawScript) return;

    const codeBlockMatch = activeRawScript.match(/```(?:uhm)?([\s\S]*?)```/);
    let rawCode = "";
    let rawExplanation = "";

    if (codeBlockMatch) {
      rawCode = codeBlockMatch[1].trim();
      rawExplanation = activeRawScript.split(/```/)[0].trim();
    } else {
      const infoIndex = activeRawScript.indexOf('Info "');
      if (infoIndex !== -1) {
        rawExplanation = activeRawScript.substring(0, infoIndex).trim();
        rawCode = activeRawScript.substring(infoIndex).trim();
      } else {
        rawCode = activeRawScript;
        rawExplanation = "Generated Script:";
      }
    }

    setExplanation(rawExplanation);
    
    // Inject explanation as comment at top of file
    const commentBlock = rawExplanation 
      ? `// ${rawExplanation.replace(/\n/g, '\n// ')}\n\n`
      : '';
      
    setCode(commentBlock + rawCode);

  }, [activeRawScript]);

  const handlePreviewSound = async () => {
    // STOP case
    if (isPlaying) {
      setIsPlaying(false);
      if (audioCtxRef.current) {
        try {
          await audioCtxRef.current.close();
        } catch (e) { console.error(e); }
        audioCtxRef.current = null;
      }
      return;
    }

    // START case
    setIsPlaying(true);
    
    // Initialize Context immediately on click to capture user gesture
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          audioCtxRef.current = new AudioContextClass();
      }
      
      // Resume if suspended
      if (audioCtxRef.current.state === 'suspended') {
          await audioCtxRef.current.resume();
      }
    } catch (err) {
      console.error("Failed to initialize AudioContext", err);
      setIsPlaying(false);
      return;
    }

    // Trigger generation
    if (onGeneratePreview) {
        onGeneratePreview(activeRawScript);
    }
  };

  // Effect to actually play when code arrives
  useEffect(() => {
    if (previewCode && isPlaying && audioCtxRef.current) {
        const ctx = audioCtxRef.current;
        
        try {
            // Check if code is valid syntax before executing
            // This prevents "just spinning" if the code is bad
            if (previewCode.trim().length === 0) throw new Error("Empty code");

            const playSound = new Function('ctx', previewCode);
            playSound(ctx);
            
            // Auto stop timer
            const timer = setTimeout(() => {
                setIsPlaying(false);
                // Ensure silence by closing context
                ctx.close().then(() => { audioCtxRef.current = null; }).catch(console.error);
            }, 3000); // 3 seconds max duration
            
            return () => clearTimeout(timer);
            
        } catch (error) {
            console.error("Preview Execution Error", error);
            setIsPlaying(false);
            // Cleanup context on error
            ctx.close().then(() => { audioCtxRef.current = null; }).catch(console.error);
        }
    }
  }, [previewCode, isPlaying]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const nameMatch = code.match(/Info "([^"]+)"/);
    const filename = nameMatch && nameMatch[1] 
      ? `${nameMatch[1].replace(/\s+/g, '_')}.uhm` 
      : 'patch.uhm';
      
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleGenerateVars = () => {
    if (onGenerateVariations && activeRawScript) {
      onGenerateVariations(activeRawScript);
    }
  }

  const handleGenerateLib = () => {
    if (onGenerateLibrary && activeRawScript) {
      onGenerateLibrary(activeRawScript, librarySize);
    }
  }

  const handlePublish = () => {
    if (!onPublish || isPublished) return;
    const nameMatch = code.match(/Info "([^"]+)"/);
    const name = nameMatch && nameMatch[1] ? nameMatch[1] : 'Untitled Preset';
    onPublish(code, name);
    setIsPublished(true);
    setHasLiked(true); // Auto-like your own
  };

  const tokenizedLines = useMemo(() => {
    return code.split('\n').map(line => ({
      tokens: tokenizeUHM(line),
      explanation: getLineExplanation(line)
    }));
  }, [code]);

  if (!result) return null;

  return (
    <section className="w-full max-w-5xl mx-auto mt-12 mb-20 px-4 animate-in fade-in slide-in-from-bottom-8 duration-500">
      
      {/* Tabs and Actions Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 md:pb-0 no-scrollbar">
          <button 
            onClick={() => setActiveTabIndex(-1)}
            className={`
              flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap
              ${activeTabIndex === -1 
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40' 
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}
            `}
          >
            <Layers className="w-4 h-4" />
            <span>Original</span>
          </button>
          
          {variations.length > 0 && variations.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveTabIndex(idx)}
              className={`
                px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap
                ${activeTabIndex === idx 
                  ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-900/40' 
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}
              `}
            >
              Variation {idx + 1}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-2">
            {onGenerateVariations && variations.length === 0 && !isGeneratingLibrary && (
              <button
                onClick={handleGenerateVars}
                disabled={isGeneratingVariations}
                className={`
                  flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-bold text-white transition-all
                  ${isGeneratingVariations 
                    ? 'bg-slate-700 cursor-not-allowed text-slate-400' 
                    : 'bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 shadow-lg shadow-purple-900/20'}
                `}
              >
                {isGeneratingVariations ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>{isGeneratingVariations ? 'Creating Variations...' : 'Generate 5 Variations'}</span>
              </button>
            )}
            
            {onGenerateLibrary && (
               <button 
                 onClick={() => setShowLibraryPanel(!showLibraryPanel)}
                 disabled={isGeneratingLibrary || isGeneratingVariations}
                 className={`
                    flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border
                    ${showLibraryPanel ? 'bg-indigo-900/50 border-indigo-500 text-indigo-200' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}
                    ${isGeneratingLibrary ? 'opacity-50 cursor-not-allowed' : ''}
                 `}
               >
                 <Library className="w-4 h-4" />
                 <span>Library</span>
               </button>
            )}
        </div>
      </div>

      {/* Library Generation Panel */}
      {(showLibraryPanel || isGeneratingLibrary) && (
        <div className="mb-6 p-5 bg-indigo-950/30 border border-indigo-500/30 rounded-xl animate-in fade-in slide-in-from-top-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
               <h3 className="text-indigo-200 font-bold flex items-center gap-2">
                 <Package className="w-5 h-5" />
                 Preset Library Generator
               </h3>
               <p className="text-indigo-300/60 text-xs mt-1">
                 Create a zip file containing multiple unique variations of the current preset.
               </p>
            </div>
            
            {!isGeneratingLibrary ? (
              <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-lg border border-slate-700/50">
                    <span className="text-xs font-semibold text-slate-400 pl-2">Count:</span>
                    <select 
                      value={librarySize}
                      onChange={(e) => setLibrarySize(Number(e.target.value))}
                      className="bg-transparent text-indigo-300 text-sm font-bold focus:outline-none p-1"
                    >
                      {[25, 50, 75, 100, 125, 150, 175, 200].map(n => (
                        <option key={n} value={n} className="bg-slate-900">{n}</option>
                      ))}
                    </select>
                 </div>
                 <button
                   onClick={handleGenerateLib}
                   className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-lg shadow-indigo-900/40 transition-all flex items-center gap-2"
                 >
                   <Download className="w-4 h-4" />
                   Generate & Download Zip
                 </button>
              </div>
            ) : (
              <div className="flex items-center gap-4 w-full md:w-auto min-w-[300px]">
                <div className="flex-grow">
                   <div className="flex justify-between text-xs text-indigo-300 mb-1">
                      <span>Generating Presets...</span>
                      <span>{Math.round(libraryProgress)}% ({Math.floor((libraryProgress/100) * libraryTotal)}/{libraryTotal})</span>
                   </div>
                   <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-indigo-500 h-2.5 rounded-full transition-all duration-300 ease-out" 
                        style={{ width: `${libraryProgress}%` }}
                      ></div>
                   </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VISUALIZER COMPONENT */}
      <Visualizer 
        script={activeRawScript}
        code={visualizerCache[activeRawScript] || null}
        isLoading={isGeneratingVisualizer}
        onGenerate={() => onGenerateVisualizer && onGenerateVisualizer(activeRawScript)}
      />

      {/* Publish / Engagement Bar */}
      <div className="flex items-center justify-between mb-4 p-4 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="flex items-center space-x-3">
          {explanation && (
             <p className="text-slate-300 italic text-sm border-l-2 border-cyan-500 pl-3">
               {isAudioAnalysis && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-900/50 text-cyan-300 mr-2 uppercase tracking-wide"><Mic className="w-3 h-3 mr-1" /> Audio Analysis</span>}
               {explanation}
             </p>
          )}
        </div>
        <div className="flex items-center space-x-2">
           <button
             onClick={() => setHasLiked(!hasLiked)}
             className={`p-2 rounded-full transition-all ${hasLiked ? 'text-fuchsia-500 bg-fuchsia-900/20' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
             title="This generation is good"
           >
             <ThumbsUp className={`w-5 h-5 ${hasLiked ? 'fill-current' : ''}`} />
           </button>
           
           <button
             onClick={handlePublish}
             disabled={isPublished}
             className={`
               flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all
               ${isPublished 
                 ? 'bg-green-900/20 text-green-400 border border-green-900/50 cursor-default' 
                 : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20'}
             `}
           >
             {isPublished ? <Check className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
             <span>{isPublished ? 'Published' : 'Publish to Community'}</span>
           </button>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden border border-slate-700 bg-[#0d1117] shadow-2xl relative">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/90 border-b border-slate-700 backdrop-blur-sm">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <FileCode className="w-4 h-4 text-cyan-500" />
              <span className="text-sm font-mono text-slate-400">
                {activeTabIndex === -1 ? 'original.uhm' : `variation_${activeTabIndex + 1}.uhm`}
              </span>
            </div>
            
            <button
              onClick={() => setShowExplanations(!showExplanations)}
              className={`
                flex items-center space-x-1.5 px-2 py-1 text-xs font-medium rounded transition-colors
                ${showExplanations 
                  ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-800' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 border border-transparent'}
              `}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{showExplanations ? 'Hide Details' : 'Explain Script'}</span>
            </button>
            
            <button
               onClick={handlePreviewSound}
               disabled={isGeneratingPreview}
               className={`
                  flex items-center space-x-1.5 px-2 py-1 text-xs font-medium rounded transition-colors
                  ${isPlaying 
                     ? 'bg-red-500/20 text-red-300 border border-red-500/50' 
                     : 'text-emerald-400 hover:bg-emerald-900/20 border border-emerald-500/30'}
               `}
            >
               {isGeneratingPreview ? (
                   <div className="w-3.5 h-3.5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin"></div>
               ) : (
                   isPlaying ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />
               )}
               <span>{isPlaying ? 'Stop' : 'Preview Sound'}</span>
            </button>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-white bg-cyan-700 hover:bg-cyan-600 rounded-md transition-colors shadow-lg shadow-cyan-900/20 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .uhm</span>
            </button>
          </div>
        </div>
        
        <div className="relative overflow-x-auto custom-scrollbar bg-[#0d1117]">
            <pre className="p-4 text-sm font-mono leading-relaxed w-full">
                <code className="table w-full">
                {tokenizedLines.map(({tokens, explanation: lineExplanation}, lineIndex) => (
                    <div key={lineIndex} className="table-row hover:bg-white/5 transition-colors group">
                        <span className="table-cell select-none text-slate-700 text-right pr-4 w-10 border-r border-slate-800/50 align-top pt-[2px]">
                            {lineIndex + 1}
                        </span>
                        <span className="table-cell pl-4 pr-4 whitespace-pre-wrap break-all align-top">
                            {tokens.map((token, tokenIndex) => {
                                let className = "text-slate-300";
                                switch (token.type) {
                                    case 'keyword': className = "text-fuchsia-400 font-bold"; break;
                                    case 'string': className = "text-emerald-400"; break;
                                    case 'attribute': className = "text-sky-400 italic"; break;
                                    case 'number': className = "text-amber-400"; break;
                                    case 'comment': className = "text-slate-500 italic"; break;
                                    case 'operator': className = "text-slate-500"; break;
                                    default: className = "text-slate-200";
                                }
                                return <span key={tokenIndex} className={className}>{token.value}</span>
                            })}
                        </span>
                        {showExplanations && (
                          <span className="table-cell w-64 xl:w-96 pl-4 border-l border-slate-800/50 align-top py-0.5 text-xs italic text-slate-500 group-hover:text-cyan-400/80 transition-colors">
                            {lineExplanation}
                          </span>
                        )}
                    </div>
                ))}
                </code>
            </pre>
        </div>
      </div>

      <div className="mt-6 text-center text-slate-500 text-xs">
        <p>Ensure you place the .uhm file in your Hive "Wavetables" folder.</p>
        <p className="mt-1 opacity-70">Windows: VstPlugins\u-he\Hive\Wavetables &nbsp;|&nbsp; Mac: /Library/Audio/Presets/u-he/Hive/Wavetables</p>
      </div>
    </section>
  );
};

export default ResultSection;
