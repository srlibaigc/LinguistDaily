import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Article, Language } from '../types';
import { decodeAudioData } from '../services/geminiService';

interface Props {
  article: Article;
  onWordSelect: (word: string, context: string) => void;
}

interface SentenceData {
  text: string;
  startChar: number;
  endChar: number;
  startTime: number;
  endTime: number;
  id: string;
  isWhitespace: boolean;
}

// Map full language names to ISO codes for Intl.Segmenter
const getIsoCode = (lang: Language | string): string => {
  switch(lang) {
      case 'Japanese': return 'ja';
      case 'Korean': return 'ko';
      case 'French': return 'fr';
      case 'Italian': return 'it';
      case 'Dutch': return 'nl';
      case 'English': return 'en';
      case 'Cantonese': return 'zh-HK';
      case 'Spanish': return 'es';
      default: return 'en';
  }
};

const formatTime = (seconds: number) => {
  if (!isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const ArticleView: React.FC<Props> = ({ article, onWordSelect }) => {
  // Audio State
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loopingSentenceId, setLoopingSentenceId] = useState<string | null>(null);
  const [loopRange, setLoopRange] = useState<{start: number, end: number} | null>(null);
  const [volume, setVolume] = useState(1);

  // Refs for audio control
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef<number>(0); // When playback started (AudioContext time)
  const pausedAtRef = useRef<number>(0); // Offset within the file
  const rafRef = useRef<number | null>(null);
  
  // Parsed Data
  const [sentences, setSentences] = useState<SentenceData[]>([]);

  // 1. Initialize Audio Context & Decode
  useEffect(() => {
    let active = true;
    const initAudio = async () => {
      if (!article.audioBase64) return;
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 24000 });
      
      // Create Gain Node for Volume
      const gainNode = ctx.createGain();
      gainNode.gain.value = 1; // Initial volume
      gainNode.connect(ctx.destination);
      gainNodeRef.current = gainNode;

      setAudioContext(ctx);
      
      try {
        const buffer = await decodeAudioData(article.audioBase64, ctx);
        if (active) {
            setAudioBuffer(buffer);
            setDuration(buffer.duration);
        }
      } catch (e) {
        console.error("Error decoding audio", e);
      }
    };
    initAudio();
    
    return () => {
      active = false;
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
      }
    };
  }, [article.audioBase64]);

  // Volume update effect
  useEffect(() => {
    if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  // 2. Segmentation & Time Mapping Logic
  useEffect(() => {
    if (!audioBuffer || !article.content) return;

    const isoCode = getIsoCode(article.language);
    let rawSegments: { segment: string, index: number }[] = [];
    
    try {
        const segmenter = new (Intl as any).Segmenter(isoCode, { granularity: 'sentence' });
        rawSegments = Array.from(segmenter.segment(article.content));
    } catch (e) {
        // Fallback regex split
        const raw = article.content.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [article.content];
        let currentIndex = 0;
        rawSegments = raw.map(s => {
            const item = { segment: s, index: currentIndex };
            currentIndex += s.length;
            return item;
        });
    }

    // Heuristic Weighting for better time distribution
    // TTS pauses at punctuation, so we add "weight" (virtual characters) to segments with punctuation.
    const getWeight = (text: string) => {
       let w = text.length; 
       // Count punctuation
       const periods = (text.match(/[.!?]/g) || []).length;
       const commas = (text.match(/[,;]/g) || []).length;
       const newlines = (text.match(/\n/g) || []).length;
       
       // Add virtual length for pauses
       w += periods * 12; // Strong pause
       w += commas * 4;   // Weak pause
       w += newlines * 15; // Paragraph pause
       return w;
    };

    const totalWeight = rawSegments.reduce((acc, s) => acc + getWeight(s.segment), 0);
    const totalDuration = audioBuffer.duration;

    let currentWeight = 0;
    const allMapped = rawSegments.map((s, i) => {
       const w = getWeight(s.segment);
       const startT = (currentWeight / totalWeight) * totalDuration;
       const endT = ((currentWeight + w) / totalWeight) * totalDuration;
       
       currentWeight += w;

       return {
           id: `s-${i}`,
           text: s.segment,
           startChar: s.index,
           endChar: s.index + s.segment.length,
           startTime: startT,
           endTime: endT,
           isWhitespace: !s.segment.trim()
       };
    });

    // Filter out whitespace-only segments for the UI, but they were included in time calc
    setSentences(allMapped.filter(s => !s.isWhitespace));

  }, [audioBuffer, article.content, article.language]);

  // 3. Playback Logic
  const play = useCallback((offset: number, range?: { start: number, end: number }) => {
      if (!audioContext || !audioBuffer || !gainNodeRef.current) return;

      // Stop existing
      if (sourceRef.current) {
          try { sourceRef.current.stop(); } catch(e){}
          sourceRef.current = null;
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      // Connect to gain node instead of destination directly
      source.connect(gainNodeRef.current);

      if (range) {
          source.loop = true;
          source.loopStart = range.start;
          source.loopEnd = range.end;
          
          // Ensure offset is within bounds
          if (offset < range.start || offset > range.end) {
              offset = range.start;
          }
          setLoopRange(range);
      } else {
          setLoopRange(null);
      }

      source.onended = () => {
          if (!source.loop) {
             setIsPlaying(false);
             // Reset if reached end
             if (audioContext.currentTime - startTimeRef.current >= audioBuffer.duration - offset - 0.1) {
                 setCurrentTime(0);
                 pausedAtRef.current = 0;
             }
          }
      };

      source.start(0, offset);
      
      sourceRef.current = source;
      startTimeRef.current = audioContext.currentTime - offset;
      pausedAtRef.current = offset;
      setIsPlaying(true);
  }, [audioContext, audioBuffer]);

  const stop = useCallback(() => {
      if (sourceRef.current) {
          try { sourceRef.current.stop(); } catch(e){}
          sourceRef.current = null;
      }
      setIsPlaying(false);
      setLoopingSentenceId(null);
      setLoopRange(null);
  }, []);

  const togglePlay = () => {
      if (isPlaying) {
          // Pause
          stop();
          if (audioContext) {
              pausedAtRef.current = audioContext.currentTime - startTimeRef.current;
              setLoopingSentenceId(null);
          }
      } else {
          // Play
          let startPos = pausedAtRef.current;
          if (startPos >= duration) startPos = 0;
          play(startPos);
      }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      setCurrentTime(time);
      pausedAtRef.current = time;
      setLoopingSentenceId(null); // Seek breaks loop

      if (isPlaying) {
          play(time);
      }
  };

  const handleSentenceClick = (sentence: SentenceData) => {
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;

      setLoopingSentenceId(sentence.id);
      
      // Add padding to ensure the sentence isn't cut off
      const PADDING_START = 0.2; 
      const PADDING_END = 0.25;

      const safeStart = Math.max(0, sentence.startTime - PADDING_START);
      const safeEnd = Math.min(duration, sentence.endTime + PADDING_END);

      setCurrentTime(safeStart);
      play(safeStart, { start: safeStart, end: safeEnd });
  };

  // 4. Animation Loop for UI Update
  useEffect(() => {
      const loop = () => {
          if (isPlaying && audioContext) {
              if (loopRange && sourceRef.current?.loop) {
                  // In loop mode, approximate visual progress
                  const loopDuration = loopRange.end - loopRange.start;
                  const rawElapsed = audioContext.currentTime - startTimeRef.current; 
                  let linearPos = rawElapsed;
                  
                  if (loopDuration > 0) {
                      const relativePos = (linearPos - loopRange.start) % loopDuration;
                      linearPos = loopRange.start + relativePos;
                      if (linearPos < loopRange.start) linearPos = loopRange.start;
                  }
                  
                  setCurrentTime(linearPos);

              } else {
                  const rawTime = audioContext.currentTime - startTimeRef.current;
                  setCurrentTime(Math.min(rawTime, duration));
              }
          }
          rafRef.current = requestAnimationFrame(loop);
      };
      
      rafRef.current = requestAnimationFrame(loop);
      return () => {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
  }, [isPlaying, audioContext, duration, loopRange]);


  // 5. Text Selection Logic - Double Click
  const handleDoubleClick = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      const word = selection.toString().trim();
      const anchorNode = selection.anchorNode;
      const context = anchorNode?.parentElement?.textContent || "";
      
      if (word.length < 50) {
         onWordSelect(word, context);
      }
    }
  };

  const activeSentenceId = useMemo(() => {
      return sentences.find(s => currentTime >= s.startTime && currentTime < s.endTime)?.id;
  }, [currentTime, sentences]);

  return (
    <div className="max-w-3xl mx-auto animate-fade-in pb-32 px-2 md:px-0">
      {/* Sticky Audio Player */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-indigo-100 shadow-sm -mx-6 px-6 py-4 mb-8 transition-all rounded-b-xl">
         <div className="max-w-3xl mx-auto flex flex-col gap-2">
             <div className="flex items-center justify-between mb-1">
                 <h1 className="text-lg font-bold text-slate-800 truncate pr-4">{article.title}</h1>
                 <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2 py-1 rounded hidden sm:inline-block">
                     {loopingSentenceId ? 'Looping Segment' : 'Standard Playback'}
                 </span>
             </div>
             
             <div className="flex items-center gap-4">
                 <button 
                    onClick={togglePlay}
                    disabled={!audioBuffer}
                    className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full transition-all shadow-sm ${
                      !audioBuffer ? 'bg-slate-200 text-slate-400 cursor-not-allowed' :
                      isPlaying ? 'bg-indigo-600 text-white hover:scale-105 active:scale-95' : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300'
                    }`}
                 >
                   {isPlaying ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                   ) : (
                      <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                   )}
                 </button>
                 
                 <div className="flex-1 flex items-center gap-3">
                     <span className="text-xs text-slate-500 font-mono w-8 text-right hidden sm:inline-block">{formatTime(currentTime)}</span>
                     <div className="relative flex-1 h-8 flex items-center group">
                        {/* Progress Track Background */}
                        <div className="absolute w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-indigo-200 transition-all duration-100" 
                                style={{ width: `${(currentTime / (duration || 1)) * 100}%` }} 
                            />
                        </div>
                        
                        {/* Loop Markers */}
                        {loopRange && (
                            <div 
                                className="absolute h-1.5 bg-indigo-500/30 pointer-events-none z-10 rounded-sm"
                                style={{ 
                                    left: `${(loopRange.start / (duration || 1)) * 100}%`, 
                                    width: `${((loopRange.end - loopRange.start) / (duration || 1)) * 100}%` 
                                }}
                            />
                        )}

                        {/* Input Range */}
                        <input 
                            type="range" 
                            min="0" 
                            max={duration || 100} 
                            step="0.05"
                            value={currentTime}
                            onChange={handleSeek}
                            className="absolute inset-0 w-full opacity-0 cursor-pointer z-20"
                        />
                        
                        {/* Thumb Visual */}
                        <div 
                            className="absolute w-3 h-3 bg-indigo-600 rounded-full shadow pointer-events-none transition-all duration-75 group-hover:scale-125 z-10"
                            style={{ left: `${(currentTime / (duration || 1)) * 100}%`, transform: 'translateX(-50%)' }}
                        />
                     </div>
                     <span className="text-xs text-slate-400 font-mono w-8 hidden sm:inline-block">{formatTime(duration)}</span>
                 </div>
             </div>
         </div>
      </div>

      {/* Content */}
      <article 
        className="article-text text-lg md:text-xl leading-loose text-slate-800 select-text"
        onDoubleClick={handleDoubleClick}
      >
        {sentences.length === 0 ? (
            article.content.split('\n').map((para, i) => <p key={i} className="mb-6">{para}</p>)
        ) : (
            <div className="space-y-6">
               <p>
                   {sentences.map((s) => {
                       const isActive = s.id === activeSentenceId;
                       const isLooping = s.id === loopingSentenceId;
                       
                       return (
                         <span 
                            key={s.id}
                            onClick={() => handleSentenceClick(s)}
                            className={`
                                transition-colors duration-200 rounded px-1 py-0.5 cursor-pointer
                                ${isActive ? 'bg-yellow-100 text-slate-900' : 'hover:bg-indigo-50'}
                                ${isLooping ? 'ring-2 ring-indigo-400 bg-indigo-50' : ''}
                            `}
                            title="Click to play sentence. Double click word to add to vocabulary."
                         >
                            {s.text}{' '}
                         </span>
                       );
                   })}
               </p>
            </div>
        )}
      </article>

      {/* Dedicated Audio Controls Section */}
      <div className="mt-12 border-t border-slate-100 pt-8">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                Audio Controls
            </h3>
            
            <div className="flex flex-col gap-6">
                {/* Time Scrubber */}
                <div className="flex items-center gap-3 text-xs font-mono font-medium text-slate-500">
                    <span className="w-10 text-right">{formatTime(currentTime)}</span>
                    <div className="relative flex-1 h-2 group cursor-pointer">
                         <div className="absolute inset-0 bg-slate-100 rounded-full"></div>
                         <div className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full" style={{ width: `${(currentTime/(duration || 1))*100}%` }}></div>
                         <input type="range" className="absolute inset-0 w-full opacity-0 cursor-pointer" min={0} max={duration || 1} step="0.1" value={currentTime} onChange={handleSeek} />
                    </div>
                    <span className="w-10">{formatTime(duration)}</span>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                    {/* Main Controls */}
                    <div className="flex items-center gap-6 order-2 sm:order-1">
                        <button 
                            onClick={() => {
                                const newTime = Math.max(0, currentTime - 10);
                                setCurrentTime(newTime);
                                if(isPlaying) play(newTime);
                                else pausedAtRef.current = newTime;
                            }}
                            className="text-slate-400 hover:text-indigo-600 transition-colors flex flex-col items-center gap-1 group"
                            title="Rewind 10s"
                        >
                            <svg className="w-8 h-8 bg-slate-50 rounded-full p-1.5 group-hover:bg-indigo-50 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8L4.066 11.2z" /></svg>
                            <span className="text-[10px] font-bold uppercase">10s</span>
                        </button>

                        <button 
                            onClick={togglePlay}
                            className="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 hover:scale-105 active:scale-95"
                        >
                             {isPlaying ? (
                                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                             ) : (
                                <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                             )}
                        </button>

                        <button 
                            onClick={() => {
                                const newTime = Math.min(duration, currentTime + 10);
                                setCurrentTime(newTime);
                                if(isPlaying) play(newTime);
                                else pausedAtRef.current = newTime;
                            }}
                             className="text-slate-400 hover:text-indigo-600 transition-colors flex flex-col items-center gap-1 group"
                             title="Forward 10s"
                        >
                            <svg className="w-8 h-8 bg-slate-50 rounded-full p-1.5 group-hover:bg-indigo-50 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" /></svg>
                            <span className="text-[10px] font-bold uppercase">10s</span>
                        </button>
                    </div>

                    {/* Volume Control */}
                    <div className="flex items-center gap-3 group/vol bg-slate-50 px-4 py-2 rounded-lg order-1 sm:order-2">
                        <button onClick={() => setVolume(v => v === 0 ? 1 : 0)} className="text-slate-400 hover:text-slate-600">
                            {volume === 0 ? (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                            )}
                        </button>
                        <div className="w-24 h-1.5 bg-slate-200 rounded-full relative overflow-hidden cursor-pointer">
                            <div className="absolute inset-y-0 left-0 bg-slate-400 group-hover/vol:bg-indigo-500 transition-colors" style={{ width: `${volume * 100}%` }}></div>
                            <input 
                                type="range" 
                                min="0" 
                                max="1" 
                                step="0.05" 
                                value={volume} 
                                onChange={(e) => setVolume(parseFloat(e.target.value))}
                                className="absolute inset-0 w-full opacity-0 cursor-pointer"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>

      <div className="mt-8 p-4 bg-indigo-50 border border-indigo-100 rounded-lg text-sm text-indigo-800 flex items-start gap-3">
        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
            <p className="font-semibold mb-1">Interactive Learning Tips:</p>
            <ul className="list-disc list-inside space-y-1 opacity-90">
                <li>Click any sentence to listen to it on loop.</li>
                <li><strong>Double-click</strong> any word to see definitions and add it to your vocabulary list.</li>
                <li>Use the audio controls below to control speed and volume.</li>
            </ul>
        </div>
      </div>
    </div>
  );
};