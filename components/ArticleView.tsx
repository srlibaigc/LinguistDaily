import React, { useEffect, useState, useRef } from 'react';
import { Article } from '../types';
import { decodeAudioData } from '../services/geminiService';

interface Props {
  article: Article;
  onWordSelect: (word: string, context: string) => void;
}

export const ArticleView: React.FC<Props> = ({ article, onWordSelect }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);

  // Initialize Audio and Decode
  useEffect(() => {
    if (article.audioBase64) {
      const initAudio = async () => {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        setAudioContext(ctx);
        try {
          const buffer = await decodeAudioData(article.audioBase64!, ctx);
          setAudioBuffer(buffer);
        } catch (e) {
          console.error("Error decoding audio", e);
        }
      };
      initAudio();
    }
    
    // Cleanup
    return () => {
      if (sourceRef.current) {
        try { sourceRef.current.stop(); } catch(e){}
      }
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
      }
    };
  }, [article.audioBase64]);

  const togglePlay = () => {
    if (!audioContext || !audioBuffer) return;

    if (isPlaying) {
      // Pause
      if (sourceRef.current) {
        sourceRef.current.stop();
        pausedAtRef.current += audioContext.currentTime - startedAtRef.current;
        sourceRef.current = null;
      }
      setIsPlaying(false);
    } else {
      // Play
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
      startedAtRef.current = audioContext.currentTime;
      source.start(0, pausedAtRef.current);
      sourceRef.current = source;
      setIsPlaying(true);

      source.onended = () => {
        setIsPlaying(false);
        pausedAtRef.current = 0;
      };
    }
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      const word = selection.toString().trim();
      // Grab the whole paragraph as context if possible
      const anchorNode = selection.anchorNode;
      const context = anchorNode?.parentElement?.textContent || "";
      
      // Simple validation to avoid selecting huge blocks
      if (word.length < 50) {
         onWordSelect(word, context);
      }
    }
  };

  return (
    <div className="max-w-3xl mx-auto animate-fade-in pb-20">
      <header className="mb-8 border-b pb-6 border-slate-200">
        <div className="text-sm text-slate-500 mb-2 uppercase tracking-wider font-semibold">
          {article.language} &bull; {article.date}
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 leading-tight mb-6">
          {article.title}
        </h1>
        
        {/* Audio Player Control */}
        <div className="flex items-center gap-4 bg-indigo-50 p-4 rounded-lg border border-indigo-100">
          <button 
            onClick={togglePlay}
            disabled={!audioBuffer}
            className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors ${
              !audioBuffer ? 'bg-slate-200 text-slate-400 cursor-not-allowed' :
              isPlaying ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-white text-indigo-600 border-2 border-indigo-600 hover:bg-indigo-50'
            }`}
          >
            {isPlaying ? (
               <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
            ) : (
               <svg className="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>
          <div className="flex-1">
             <div className="text-sm font-medium text-slate-700">Audio Narration</div>
             <div className="text-xs text-slate-500">
               {audioBuffer ? "AI Narrator (High Quality)" : "Loading Audio..."}
             </div>
          </div>
        </div>
      </header>

      <article 
        className="article-text text-lg md:text-xl leading-relaxed text-slate-800 space-y-6 select-text"
        onMouseUp={handleTextSelection}
        onTouchEnd={handleTextSelection} // Basic mobile support
      >
        {article.content.split('\n').map((para, i) => 
          para.trim() && <p key={i}>{para}</p>
        )}
      </article>

      <div className="mt-12 p-4 bg-yellow-50 border border-yellow-100 rounded text-sm text-yellow-800 flex items-start gap-3">
        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>Highlight any word to add it to your vocabulary list and see detailed definitions.</p>
      </div>
    </div>
  );
};