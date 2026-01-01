
import { GoogleGenAI } from "@google/genai";
import { UHM_SYSTEM_INSTRUCTION } from '../constants';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateUhmScript = async (userPrompt: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: userPrompt,
      config: {
        systemInstruction: UHM_SYSTEM_INSTRUCTION,
        temperature: 0.7, // Balance creativity with strict syntax adherence
      }
    });

    const text = response.text || "";
    return text;

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to generate UHM script. Please try again.");
  }
};

/**
 * Analyzes the audio buffer to find Volume Peaks (for timing) and 
 * Spectral Brightness (for vowel guessing)
 */
const analyzeAudioSignal = async (base64Data: string): Promise<string> => {
  try {
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const arrayBuffer = bytes.buffer;

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    
    const rawData = audioBuffer.getChannelData(0);
    const slices = 10;
    const samplesPerSlice = Math.floor(rawData.length / slices);
    
    let report = "### CLIENT-SIDE AUDIO ANALYSIS DATA ###\n";
    report += "Use this timing data to sequence your Spectrum commands:\n\n";

    for(let i=0; i<slices; i++) {
        const startIdx = i * samplesPerSlice;
        const endIdx = startIdx + samplesPerSlice;
        const slice = rawData.slice(startIdx, endIdx);
        
        // 1. RMS (Volume)
        let sumSq = 0;
        for(let s=0; s<slice.length; s++) sumSq += slice[s]*slice[s];
        const rms = Math.sqrt(sumSq / slice.length);
        const volume = rms > 0.05 ? "LOUD (Syllable Active)" : (rms > 0.01 ? "Quiet" : "Silent");
        
        // 2. Zero Crossing Rate (Rough Brightness/Pitch)
        // Helps distinguish Vowels (low ZCR) vs Noise/Sibilance (high ZCR)
        let zcr = 0;
        for(let s=1; s<slice.length; s++) {
            if((slice[s] >= 0 && slice[s-1] < 0) || (slice[s] < 0 && slice[s-1] >= 0)) zcr++;
        }
        // Normalize ZCR roughly relative to length
        const zcrRatio = zcr / slice.length;
        let timbre = "Deep/Vowel";
        if (zcrRatio > 0.1) timbre = "Bright/Vowel";
        if (zcrRatio > 0.3) timbre = "Noisy/Consonant (S/T/Ch)";

        const frameStart = Math.floor((i / slices) * 100);
        const frameEnd = Math.floor(((i+1) / slices) * 100) - 1;
        
        report += `Frames ${frameStart}-${frameEnd}: Volume=${volume} | Timbre=${timbre} (RMS: ${rms.toFixed(3)})\n`;
    }
    
    // Cleanup context
    ctx.close().catch(e => console.error(e));

    return report;
  } catch (e) {
    console.error("Analysis Failed", e);
    return "Analysis Failed. Rely solely on audio.";
  }
}

export const generateUhmFromAudio = async (base64Audio: string): Promise<string> => {
  try {
    // Remove data URL prefix if present to get raw base64
    const base64Data = base64Audio.split(',')[1] || base64Audio;

    // 1. Perform Client-Side DSP Analysis to get timing map
    const analysisReport = await analyzeAudioSignal(base64Data);

    // 2. Send Audio + Analysis to Gemini
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Flash is excellent for multimodal audio analysis
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'audio/wav',
              data: base64Data
            }
          },
          {
            text: `
            TASK: Convert this audio into a u-he Hive .uhm wavetable.
            
            ${analysisReport}

            INSTRUCTIONS:
            1. Listen to the audio to identify the PHONEMES (Vowels/Consonants).
            2. Look at the ANALYSIS REPORT above. 
               - Where Volume is "LOUD", that is a syllable.
               - Map the syllables to the "Frames X-Y" provided in the report.
            3. Use the **SPEECH RESYNTHESIS MODE** from the system instructions.
               - You MUST use the VOWEL FORMANT CHEAT SHEET.
               - If you hear "AH", use harmonics 7 & 12.
               - If you hear "EE", use harmonics 3 & 25.
               - If you hear "OH", use harmonic 5.
            
            4. Construct the script using multiple 'Spectrum' commands for each time segment defined in the report.
            
            Example Logic:
            - "I see Loud volume at Frames 0-30. I hear 'Be'. That is an 'EH' vowel. I will place a Peak at Harmonic 5 & 18 for Frames 0-30."
            
            OUTPUT THE VALID .UHM SCRIPT NOW.
            `
          }
        ]
      },
      config: {
        systemInstruction: UHM_SYSTEM_INSTRUCTION,
        temperature: 0.4, // Lower temp for more accurate mapping
      }
    });

    return response.text || "";
  } catch (error) {
    console.error("Audio Analysis Error:", error);
    throw new Error("Failed to analyze audio and generate script.");
  }
};

export const generateWebAudioPreview = async (uhmScript: string, description?: string): Promise<string> => {
  const prompt = `
    You are an expert in the Web Audio API.
    
    Task: Write a JavaScript function body that uses the 'ctx' (AudioContext) variable to synthesize a sound that ROUGHLY approximates the following u-he Hive wavetable script description.
    
    Goal: Give the user a quick 2-second sonic preview of what this wavetable might sound like (e.g., if it's a bass, make a bass sound; if it's a pad, make a chord).
    
    Script Info:
    ${uhmScript.substring(0, 500)}...
    
    Description: ${description || "Unknown sound"}

    Requirements:
    1. Use 'ctx.currentTime' to schedule events.
    2. Create oscillators, gain nodes, filters as needed.
    3. Connect the final node to 'ctx.destination'.
    4. The sound MUST last exactly 2 seconds and then fade out completely to silence.
    5. DO NOT define 'ctx'. Assume 'ctx' is already available in scope.
    6. Return ONLY the code inside the function. No markdown, no "javascript" tags, no comments outside the code.
    7. Ensure volume is reasonable (max gain 0.3).
    8. Do NOT use any external libraries or samples. Synthesis only.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.5,
      }
    });

    let code = response.text || "";
    
    // Robust cleanup of markdown code blocks
    // Matches ```javascript, ```js, or just ``` at start
    // And ``` at end
    if (code.includes("```")) {
      const match = code.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
      if (match && match[1]) {
        code = match[1];
      } else {
        // Fallback simple replace if regex fails but backticks exist
        code = code.replace(/```(?:javascript|js)?/gi, '').replace(/```/g, '');
      }
    }
    
    return code.trim();
  } catch (error) {
    console.error("Preview Generation Error:", error);
    return "";
  }
};

export const generateVariations = async (originalScript: string): Promise<string[]> => {
  // We want drastic differences for the 5 variations
  const variationPrompts = [
    "Create a DRASTICALLY different variation. Make it much more aggressive, heavily distorted, and harmonically chaotic using tanh and phase modulation.",
    "Create a variation that is pure ATMOSPHERE. Remove harshness, add breathy noise, spectral shimmering, and make it very soft and evolving.",
    "Create a variation focused on RHYTHMIC TEXTURE. Change the 'table' interaction so the sound creates a rhythmic scanning effect or wobble.",
    "Create a variation that flips the tonality. If it was bright, make it dark and submerged. If it was dark, make it piercingly bright and metallic.",
    "Create a WEIRD/GLITCH variation. Use randomization (rand/randf), extreme phase distortion, and unusual harmonic intervals."
  ];

  try {
    const promises = variationPrompts.map(instruction => 
      ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `${instruction}\n\nORIGINAL SCRIPT:\n${originalScript}`,
        config: {
          systemInstruction: UHM_SYSTEM_INSTRUCTION,
          temperature: 0.9, // Higher temp for more creativity
        }
      }).then(res => res.text || "")
    );
    
    return await Promise.all(promises);
  } catch (error) {
    console.error("Variation Error:", error);
    throw new Error("Failed to generate variations.");
  }
};

export const generateBatchVariations = async (originalScript: string, count: number): Promise<string[]> => {
  // We request 'count' variations in a single prompt to be efficient, separated by a delimiter.
  // Although the model might output text, we strip it.
  const prompt = `
    GENERATE ${count} UNIQUE VARIATIONS of the script below.
    
    RULES:
    1. Output ONLY the code for the ${count} scripts.
    2. Separate each script with exactly: "===PARTITION==="
    3. Ensure each script has a unique 'Info' name.
    4. Vary the synthesis parameters SIGNIFICANTLY and DRASTICALLY for each one.
       - Use different math formulas for the waveforms.
       - Change phase distortion amounts.
       - Change harmonic spectra.
       - Ensure they do NOT sound the same.
    5. No explanations, no markdown, just the code.

    ORIGINAL SCRIPT:
    ${originalScript}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        systemInstruction: UHM_SYSTEM_INSTRUCTION,
        temperature: 0.95, // Very high temperature for maximum variance in batch generation
      }
    });

    const text = response.text || "";
    // Split by partition and cleanup
    return text.split("===PARTITION===")
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.includes("NumFrames")); // Basic validity check
  } catch (error) {
    console.error("Batch Generation Error:", error);
    return []; // Return empty on fail so the app can retry or skip
  }
};

export const generateVisualizerCode = async (uhmScript: string): Promise<string> => {
  const prompt = `
    You are a math and audio visualization expert.
    
    I have a u-he Hive .uhm wavetable script. I need a JavaScript function to visualize the waveform on an HTML5 canvas.
    
    SCRIPT:
    ${uhmScript}

    TASK:
    Write a raw JavaScript function body (no function declaration, no markdown) that calculates the amplitude (-1.0 to 1.0) for a given phase and table position.

    INPUT VARIABLES available in scope:
    - phase: float (0.0 to 1.0) representing x-axis within one cycle.
    - table: float (0.0 to 1.0) representing the wavetable frame index (morph position).

    OUTPUT:
    - Return a float value between -1.0 and 1.0.

    RULES:
    1. Translate the 'Wave' or 'Spectrum' logic from the script into JavaScript Math functions.
    2. For 'Wave "sin(2*pi*phase)"', output 'return Math.sin(2 * Math.PI * phase);'.
    3. For 'Spectrum', approximate it by summing the first 8-16 harmonics based on the script's logic. 
       Example: 'return Math.sin(phase * 2 * Math.PI) + 0.5 * Math.sin(phase * 4 * Math.PI);'
    4. If 'rand' is used, use 'Math.random()'.
    5. If 'tanh' is used, use 'Math.tanh()'.
    6. Handle the 'table' variable if the script morphs (e.g., '2*pi*phase + table').
    7. Return ONLY the function body. No markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.2 }
    });

    let code = response.text || "";
    
    // Cleanup markdown
    if (code.includes("```")) {
      const match = code.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
      code = match ? match[1] : code.replace(/```/g, '');
    }
    
    return code.trim();
  } catch (error) {
    console.error("Visualizer Gen Error:", error);
    return "";
  }
};
