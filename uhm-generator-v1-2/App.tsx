
import React, { useState } from 'react';
import Header from './components/Header';
import InputSection from './components/InputSection';
import ResultSection from './components/ResultSection';
import CommunityFeed from './components/CommunityFeed';
import { generateUhmScript, generateVariations, generateBatchVariations, generateUhmFromAudio, generateWebAudioPreview, generateVisualizerCode } from './services/geminiService';
import { GenerationState, AppView, CommunityPreset } from './types';
import JSZip from 'jszip';

// MOCK DATA FOR MOAT STRATEGY
const MOCK_PRESETS: CommunityPreset[] = [
  {
    id: '1',
    name: 'Neural Reese Bass',
    description: 'A heavily distorted neuro bass that uses phase modulation to create tearing artifacts.',
    author: 'AudioAlchemist',
    likes: 342,
    script: `Info "neural reese"\nNumFrames = 100\nWave start=0 end=99 "tanh(sin(2*pi*phase) * (1 + 5*frame/100))"\nWave start=0 end=99 blend=add "0.2 * rand"\nSpectrum lowest=0 highest=0 "0"\nNormalize base=each`,
    tags: ['bass', 'neuro', 'aggressive'],
    date: '2d ago'
  },
  {
    id: '2',
    name: 'Ethereal Glass Pad',
    description: 'Shimmering, evolving pad suitable for cinematic intros.',
    author: 'SkyRunner',
    likes: 128,
    script: `Info "glass pad"\nNumFrames = 100\nSpectrum start=0 end=99 lowest=1 highest=16 "1/index * sin(frame/100 * pi)"\nWave start=0 end=99 blend=add "0.05 * sin(2*pi*phase*8)"\nSpectrum lowest=0 highest=0 "0"\nNormalize base=each`,
    tags: ['pad', 'ambient', 'glass'],
    date: '5h ago'
  },
  {
    id: '3',
    name: 'Cyberpunk Drone',
    description: 'Dark, low-end drone with metallic overtones.',
    author: 'GlitchMaster',
    likes: 89,
    script: `Info "cyber drone"\nNumFrames = 100\nWave start=0 end=99 "sin(2*pi*phase + 0.5*tanh(10*phase*frame/100))"\nSpectrum lowest=0 highest=0 "0"\nNormalize base=each`,
    tags: ['drone', 'dark', 'scifi'],
    date: '1w ago'
  }
];

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>('generator');
  const [communityPresets, setCommunityPresets] = useState<CommunityPreset[]>(MOCK_PRESETS);
  
  const [state, setState] = useState<GenerationState>({
    isLoading: false,
    error: null,
    result: null,
    variations: [],
    isGeneratingVariations: false,
    isGeneratingLibrary: false,
    libraryProgress: 0,
    libraryTotal: 0,
    previewCode: null,
    isGeneratingPreview: false,
    visualizerCache: {},
    isGeneratingVisualizer: false
  });

  const handleGenerate = async (prompt: string, isAudio: boolean = false, audioData?: string) => {
    setState({ 
      isLoading: true, 
      error: null, 
      result: null, 
      variations: [], 
      isGeneratingVariations: false,
      isGeneratingLibrary: false,
      libraryProgress: 0,
      libraryTotal: 0,
      previewCode: null,
      isGeneratingPreview: false,
      visualizerCache: {},
      isGeneratingVisualizer: false
    });
    
    try {
      let result = "";
      if (isAudio && audioData) {
        result = await generateUhmFromAudio(audioData);
      } else {
        result = await generateUhmScript(prompt);
      }

      setState({ 
        isLoading: false, 
        error: null, 
        result,
        variations: [],
        isGeneratingVariations: false,
        isGeneratingLibrary: false,
        libraryProgress: 0,
        libraryTotal: 0,
        previewCode: null, // Reset preview
        isGeneratingPreview: false,
        visualizerCache: {},
        isGeneratingVisualizer: false
      });
    } catch (error: any) {
      setState({ 
        isLoading: false, 
        error: error.message || "An unexpected error occurred", 
        result: null,
        variations: [],
        isGeneratingVariations: false,
        isGeneratingLibrary: false,
        libraryProgress: 0,
        libraryTotal: 0,
        previewCode: null,
        isGeneratingPreview: false,
        visualizerCache: {},
        isGeneratingVisualizer: false
      });
    }
  };

  const handleGenerateVariations = async (sourceScript: string) => {
    if (state.isGeneratingVariations || state.isGeneratingLibrary) return;
    
    setState(prev => ({ ...prev, isGeneratingVariations: true, error: null }));
    
    try {
      const variations = await generateVariations(sourceScript);
      setState(prev => ({ 
        ...prev, 
        variations, 
        isGeneratingVariations: false 
      }));
    } catch (error: any) {
      setState(prev => ({ 
        ...prev, 
        isGeneratingVariations: false, 
        error: "Failed to generate variations: " + (error.message || "Unknown error")
      }));
    }
  };

  const handleGenerateLibrary = async (sourceScript: string, totalCount: number) => {
    if (state.isGeneratingLibrary) return;

    setState(prev => ({
      ...prev,
      isGeneratingLibrary: true,
      libraryProgress: 0,
      libraryTotal: totalCount,
      error: null
    }));

    const zip = new JSZip();
    const BATCH_SIZE = 5; // Fetch 5 variations at a time
    let collectedCount = 0;
    
    // Helper to delay if needed
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      while (collectedCount < totalCount) {
        // Calculate remaining needed
        const remaining = totalCount - collectedCount;
        const currentBatchSize = Math.min(remaining, BATCH_SIZE);
        
        // Fetch batch
        const scripts = await generateBatchVariations(sourceScript, currentBatchSize);
        
        // Add to ZIP
        for (const script of scripts) {
          collectedCount++;
          // Extract name for filename
          const nameMatch = script.match(/Info "([^"]+)"/);
          let safeName = `variation_${collectedCount}`;
          if (nameMatch && nameMatch[1]) {
            safeName = nameMatch[1].replace(/[^a-z0-9]/gi, '_').toLowerCase();
            // Ensure uniqueness in zip if duplicate names occur
            if (zip.file(`${safeName}.uhm`)) {
               safeName = `${safeName}_${collectedCount}`;
            }
          }
          zip.file(`${safeName}.uhm`, script);
        }

        // Update progress
        setState(prev => ({
          ...prev,
          libraryProgress: (collectedCount / totalCount) * 100
        }));

        // Small delay to be polite to the API rate limiter
        if (collectedCount < totalCount) await delay(500);
      }

      // Generate ZIP blob
      const content = await zip.generateAsync({ type: "blob" });
      
      // Trigger Download
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `uhm_library_${totalCount}_presets.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setState(prev => ({
        ...prev,
        isGeneratingLibrary: false,
        libraryProgress: 100
      }));

    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isGeneratingLibrary: false,
        error: "Library generation failed: " + (error.message || "Unknown error")
      }));
    }
  };

  const handleGeneratePreview = async (script: string) => {
    // Reset code first to ensure effect triggers when new code arrives
    setState(prev => ({ ...prev, isGeneratingPreview: true, previewCode: null }));
    try {
       const code = await generateWebAudioPreview(script);
       setState(prev => ({ ...prev, previewCode: code, isGeneratingPreview: false }));
    } catch (error) {
       console.error(error);
       setState(prev => ({ ...prev, isGeneratingPreview: false }));
    }
  };

  const handleGenerateVisualizer = async (script: string) => {
    // If cached, do nothing (ui should handle it)
    if (state.visualizerCache[script]) return;

    setState(prev => ({ ...prev, isGeneratingVisualizer: true }));
    try {
        const jsCode = await generateVisualizerCode(script);
        setState(prev => ({
            ...prev,
            isGeneratingVisualizer: false,
            visualizerCache: { ...prev.visualizerCache, [script]: jsCode }
        }));
    } catch (error) {
        console.error(error);
        setState(prev => ({ ...prev, isGeneratingVisualizer: false }));
    }
  }

  const handlePublish = (script: string, name: string) => {
    const newPreset: CommunityPreset = {
      id: Date.now().toString(),
      name: name,
      description: "Community generated preset using UHM-GPT.",
      author: "You",
      likes: 1,
      script: script,
      tags: ['user-generated'],
      date: 'Just now'
    };
    
    setCommunityPresets(prev => [newPreset, ...prev]);
    // Optionally switch view to discover to see it
    // setCurrentView('discover');
  };

  const handleLoadFromCommunity = (script: string) => {
    setState({ 
        isLoading: false, 
        error: null, 
        result: script, 
        variations: [], 
        isGeneratingVariations: false,
        isGeneratingLibrary: false,
        libraryProgress: 0,
        libraryTotal: 0,
        previewCode: null,
        isGeneratingPreview: false,
        visualizerCache: {},
        isGeneratingVisualizer: false
      });
      setCurrentView('generator');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <div className="fixed inset-0 z-0 opacity-20 pointer-events-none" 
           style={{
             backgroundImage: 'radial-gradient(circle at 50% 50%, #1e293b 1px, transparent 1px)',
             backgroundSize: '24px 24px'
           }}>
      </div>
      
      <div className="relative z-10 flex-grow flex flex-col">
        <Header 
            currentView={currentView}
            onChangeView={setCurrentView}
        />
        
        <main className="flex-grow w-full">
          {currentView === 'discover' ? (
            <CommunityFeed presets={communityPresets} onLoadPreset={handleLoadFromCommunity} />
          ) : (
            <>
              <InputSection 
                onGenerate={handleGenerate} 
                isLoading={state.isLoading} 
              />
              
              {state.error && (
                <div className="w-full max-w-2xl mx-auto mt-6 px-4 animate-in fade-in slide-in-from-top-4">
                  <div className="bg-red-900/20 border border-red-800 text-red-200 px-4 py-3 rounded-lg flex items-center">
                    <span className="font-bold mr-2">Error:</span> {state.error}
                  </div>
                </div>
              )}

              {state.result && (
                <ResultSection 
                  result={state.result} 
                  variations={state.variations}
                  isGeneratingVariations={state.isGeneratingVariations}
                  onGenerateVariations={handleGenerateVariations}
                  isGeneratingLibrary={state.isGeneratingLibrary}
                  libraryProgress={state.libraryProgress}
                  libraryTotal={state.libraryTotal}
                  onGenerateLibrary={handleGenerateLibrary}
                  previewCode={state.previewCode}
                  isGeneratingPreview={state.isGeneratingPreview}
                  onGeneratePreview={handleGeneratePreview}
                  visualizerCache={state.visualizerCache}
                  isGeneratingVisualizer={state.isGeneratingVisualizer}
                  onGenerateVisualizer={handleGenerateVisualizer}
                  onPublish={handlePublish}
                />
              )}
            </>
          )}
        </main>

        <footer className="py-6 text-center text-slate-600 text-sm border-t border-slate-900 bg-slate-950">
          <p>© {new Date().getFullYear()} UHM-GPT Generator. Not affiliated with u-he.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
