import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RefreshCw, Eye, Waves } from 'lucide-react';

interface VisualizerProps {
  script: string;
  code: string | null;
  isLoading: boolean;
  onGenerate: () => void;
}

const Visualizer: React.FC<VisualizerProps> = ({ script, code, isLoading, onGenerate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tablePos, setTablePos] = useState(0); // 0.0 to 1.0
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<number>(0);

  // Animation Loop
  useEffect(() => {
    const animate = () => {
      if (isPlaying) {
        setTablePos(prev => {
          const next = prev + 0.005;
          return next > 1 ? 0 : next;
        });
        requestRef.current = requestAnimationFrame(animate);
      }
    };
    
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(requestRef.current);
    }

    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying]);

  // Drawing Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid Lines
    ctx.strokeStyle = '#1e293b'; // slate-800
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    if (!code) {
      // Placeholder Text if not loaded
      ctx.fillStyle = '#475569';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText("Visualizer not generated", canvas.width / 2, canvas.height / 2 - 10);
      return;
    }

    try {
      // Create function from code
      // Signature: (phase, table) => amplitude
      // phase: 0..1, table: 0..1
      const waveformFn = new Function('phase', 'table', `
        try {
          ${code}
        } catch (e) { return 0; }
      `);

      ctx.beginPath();
      ctx.strokeStyle = '#22d3ee'; // cyan-400
      ctx.lineWidth = 2;
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#06b6d4';

      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;
      const ampScale = height / 2.2; // Keep some padding

      for (let x = 0; x < width; x++) {
        const phase = x / width;
        // Evaluate user code
        // We use 'tablePos' from state
        let amp = 0;
        try {
            const val = waveformFn(phase, tablePos);
            if (typeof val === 'number' && !isNaN(val)) {
                amp = Math.max(-1, Math.min(1, val));
            }
        } catch (e) {
            // fail silently during draw
        }

        const y = centerY - (amp * ampScale);
        
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.stroke();
      ctx.shadowBlur = 0;
      setError(null);

    } catch (err: any) {
      console.error("Visualizer Render Error:", err);
      setError("Error rendering waveform");
    }

  }, [code, tablePos]);

  // Reset if script changes significantly (simple check)
  useEffect(() => {
      // If code is null, reset play
      if (!code) setIsPlaying(false);
  }, [code]);

  return (
    <div className="w-full bg-slate-900 border border-slate-700 rounded-xl overflow-hidden mb-6 shadow-xl relative group">
        
        {/* Header / Controls */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-slate-700 backdrop-blur">
            <div className="flex items-center space-x-2">
                <Waves className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Wavetable Visualizer</span>
            </div>
            
            <div className="flex items-center space-x-4">
                 {code && (
                    <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-mono text-slate-500 uppercase">Pos: {tablePos.toFixed(2)}</span>
                        <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.01" 
                            value={tablePos}
                            onChange={(e) => {
                                setTablePos(parseFloat(e.target.value));
                                setIsPlaying(false);
                            }}
                            className="w-24 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        />
                    </div>
                 )}
                 
                 {code ? (
                    <button 
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="p-1.5 rounded-md hover:bg-slate-700 text-cyan-400 transition-colors"
                        title={isPlaying ? "Pause" : "Auto Scan"}
                    >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                 ) : (
                    <button 
                        onClick={onGenerate}
                        disabled={isLoading}
                        className={`
                            flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all
                            ${isLoading 
                                ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                                : 'bg-cyan-900/40 text-cyan-300 hover:bg-cyan-900/60 border border-cyan-700/50'}
                        `}
                    >
                        {isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                        <span>Load Visualizer</span>
                    </button>
                 )}
            </div>
        </div>

        {/* Canvas Area */}
        <div className="relative h-48 bg-slate-950">
            <canvas 
                ref={canvasRef}
                width={800}
                height={192}
                className="w-full h-full block"
            />
            
            {!code && !isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 pointer-events-none">
                    <Waves className="w-12 h-12 mb-2 opacity-20" />
                    <p className="text-sm font-medium opacity-50">Click "Load Visualizer" to render preview</p>
                </div>
            )}
            
            {error && (
                 <div className="absolute inset-0 flex items-center justify-center bg-red-900/10">
                    <p className="text-red-400 text-xs font-mono">{error}</p>
                 </div>
            )}
        </div>
    </div>
  );
};

export default Visualizer;