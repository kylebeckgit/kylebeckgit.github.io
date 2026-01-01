
export interface GenerationState {
  isLoading: boolean;
  error: string | null;
  result: string | null;
  variations: string[];
  isGeneratingVariations: boolean;
  isGeneratingLibrary: boolean;
  libraryProgress: number; // 0 to 100
  libraryTotal: number;
  previewCode: string | null; // JavaScript code for Web Audio API preview
  isGeneratingPreview: boolean;
  visualizerCache: Record<string, string>; // Map of script content -> JS visualizer function body
  isGeneratingVisualizer: boolean;
}

export enum SynthesisMode {
  WAVE = "WAVE",
  SPECTRUM = "SPECTRUM",
  HYBRID = "HYBRID"
}

export interface CommunityPreset {
  id: string;
  name: string;
  description: string;
  author: string;
  likes: number;
  script: string;
  tags: string[];
  date: string;
}

export type AppView = 'generator' | 'discover';
