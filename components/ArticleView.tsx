
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Article, Language } from '../types';
import { decodeAudioData } from '../services/aiService';

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
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const ArticleView: React.FC<Props> = ({ article, onWordSelect }) => {
  // Audio State
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  
  // HTML5 Audio State (for external URLs)
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const [isExternalAudio, setIsExternalAudio] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loopingSentenceId, setLoopingSentenceId] = useState<string | null>(null);
  const [loopRange, setLoopRange] = useState<{start: number, end: number} | null>(null);
  const [volume, setVolume] = useState(1);

  // Refs for Web Audio control
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef<number>(0); // When playback started (AudioContext time)
  const pausedAtRef = useRef<number>(0); // Offset within the file
  const rafRef = useRef<number | null>(null);
  
  // Parsed Data
  const [sentences, setSentences] = useState<SentenceData[]>([]);

  // 1. Initialize Audio (Hybrid Engine)
  useEffect(() => {
    // cleanup previous
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close();
    }
    if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current = null;
    }
    setAudioContext(null);
    setAudioBuffer(null);
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    pausedAtRef.current = 0;
    setLoopRange(null);
    setLoopingSentenceId(null);

    const initAudio = async () => {
      // Case A: External URL (Official Media)
      if (article.audioUrl) {
          setIsExternalAudio(true);
          const audio = new Audio(article.audioUrl);
          audio.crossOrigin = "anonymous"; // Try to allow CORS if possible
          audioElRef.current = audio;
          
          audio.addEventListener('loadedmetadata', () => {
              setDuration(audio.duration);
          });
          
          audio.addEventListener('timeupdate', () => {
             if (!audioElRef.current) return;
             // Only update if playing or we need sync
             setCurrentTime(audio.currentTime);
          });

          audio.addEventListener('ended', () => {
             setIsPlaying(false);
             setCurrentTime(0);
          });

          audio.addEventListener('error', (e) => {
              console.warn("Error playing external audio", e);
          });

          return;
      }

      // Case B: Generated TTS (Base64)
      if (article.audioBase64) {
          setIsExternalAudio(false);
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass({ sampleRate: 24000 });
          
          const gainNode = ctx.createGain();
          gainNode.gain.value = volume; 
          gainNode.connect(ctx.destination);
          gainNodeRef.current = gainNode;

          setAudioContext(ctx);
          
          try {
            // Pass encoding type to decoder
            const buffer = await decodeAudioData(article.audioBase64, ctx, article.audioEncoding || 'pcm');
            setAudioBuffer(buffer);
            setDuration(buffer.duration);
          } catch (e) {
            console.error("Error decoding audio", e);
          }
      }
    };

    initAudio();
    
    return () => {
      if (audioContext && audioContext.state !== 'closed') audioContext.close();
      if (audioElRef.current) {
          audioElRef.current.pause();
          audioElRef.current = null;
      }
    };
  }, [article.id, article.audioUrl, article.audioBase64]);

  // Volume update effect
  useEffect(() => {
    if (isExternalAudio && audioElRef.current) {
        audioElRef.current.volume = volume;
    } else if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = volume;
    }
  }, [volume, isExternalAudio]);

  // 2. Segmentation & Time Mapping Logic (Depends on DURATION)
  useEffect(() => {
    // Wait for duration to be known (parsed from buffer or loaded from metadata)
    if (!duration || !article.content) return;

    const isoCode = getIsoCode(article.language);
    let rawSegments: { segment: string, index: number }[] = [];
    
    try {
        const segmenter = new (Intl as any).Segmenter(isoCode, { granularity: 'sentence' });
        rawSegments = Array.from(segmenter.segment(article.content));
    } catch (e) {
        // Fallback regex split (Enhanced for CJK)
        const raw = article.content.match(/[^.!?。！？]+[.!?。！？]+["']?|[^.!?。！？]+$/g) || [article.content];
        let currentIndex = 0;
        rawSegments = raw.map(s => {
            const item = { segment: s, index: currentIndex };
            currentIndex += s.length;
            return item;
        });
    }

    // Heuristic Weighting - Refined for Better Timestamp Alignment
    const getWeight = (text: string) => {
       let w = text.length; 
       
       // Punctuation marks imply pauses in speech
       const periods = (text.match(/[.!?。！？]/g) || []).length; // Sentence terminators
       const commas = (text.match(/[,;：、，；]/g) || []).length; // Mid-sentence pauses
       const quotes = (text.match(/["'""'']/g) || []).length;
       const newlines = (text.match(/\n/g) || []).length;
       
       w += periods * 20;  // Approx 1.2s equivalent chars pause
       w += commas * 8;    // Approx 0.5s equivalent chars pause
       w += quotes * 2;
       w += newlines * 25; // Paragraph breaks are long
       return w;
    };

    const totalWeight = rawSegments.reduce((acc, s) => acc + getWeight(s.segment), 0);
    // Map text to audio duration
    const totalDuration = duration;

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

    setSentences(allMapped.filter(s => !s.isWhitespace));

  }, [duration, article.content, article.language]);

  // 3. Playback Logic
  const play = useCallback((offset: number, range?: { start: number, end: number }) => {
      // HTML5 Audio Engine
      if (isExternalAudio && audioElRef.current) {
          const audio = audioElRef.current;
          
          setLoopRange(range || null);
          
          // Handle Offset
          if (range) {
               if (offset < range.start || offset > range.end) {
                  offset = range.start;
               }
          }
          
          audio.currentTime = offset;
          
          // Attempt play
          audio.play().then(() => {
              setIsPlaying(true);
          }).catch(e => console.error("Play failed", e));
          return;
      }

      // Web Audio Engine
      if (!isExternalAudio && audioContext && audioBuffer && gainNodeRef.current) {
          // Stop existing
          if (sourceRef.current) {
              try { sourceRef.current.stop(); } catch(e){}
              sourceRef.current = null;
          }

          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(gainNodeRef.current);

          if (range) {
              source.loop = true;
              source.loopStart = range.start;
              // Clamp loopEnd to buffer duration to prevent glitches
              source.loopEnd = Math.min(audioBuffer.duration, range.end);
              
              if (offset < range.start || offset > source.loopEnd) {
                  offset = range.start;
              }
              setLoopRange(range);
          } else {
              setLoopRange(null);
          }

          source.onended = () => {
              if (!source.loop) {
                 setIsPlaying(false);
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
      }
  }, [audioContext, audioBuffer, isExternalAudio]);

  const stop = useCallback(() => {
      if (isExternalAudio && audioElRef.current) {
          audioElRef.current.pause();
          setIsPlaying(false);
          setLoopingSentenceId(null);
          setLoopRange(null);
          return;
      }

      if (sourceRef.current) {
          try { sourceRef.current.stop(); } catch(e){}
          sourceRef.current = null;
      }
      setIsPlaying(false);
      setLoopingSentenceId(null);
      setLoopRange(null);
  }, [isExternalAudio]);

  const togglePlay = () => {
      if (isPlaying) {
          stop();
          // Store pause position logic varies by engine
          if (!isExternalAudio && audioContext) {
               pausedAtRef.current = audioContext.currentTime - startTimeRef.current;
          } else if (isExternalAudio && audioElRef.current) {
               pausedAtRef.current = audioElRef.current.currentTime;
          }
      } else {
          let startPos = pausedAtRef.current;
          if (startPos >= duration) startPos = 0;
          play(startPos);
      }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      setCurrentTime(time);
      pausedAtRef.current = time;
      setLoopingSentenceId(null);
      setLoopRange(null);
      
      // For HTML5 audio, we must update currentTime immediately
      if (isExternalAudio && audioElRef.current) {
          audioElRef.current.currentTime = time;
      }

      if (isPlaying) {
          play(time);
      }
  };

  const handleSentenceClick = (sentence: SentenceData) => {
      // Don't trigger if selecting text
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;

      setLoopingSentenceId(sentence.id);
      
      // Add generous padding to ensure the full sentence and its natural pause are played
      const PADDING_START = 0.1; 
      const PADDING_END = 1.0; 

      const safeStart = Math.max(0, sentence.startTime - PADDING_START);
      const safeEnd = Math.min(duration, sentence.endTime + PADDING_END);

      setCurrentTime(safeStart);
      if (isExternalAudio && audioElRef.current) {
          audioElRef.current.currentTime = safeStart;
      }
      
      play(safeStart, { start: safeStart, end: safeEnd });
  };

  // 4. Animation Loop (Unified)
  useEffect(() => {
      const loop = () => {
          // A-B Loop Check for HTML5 Audio
          if (isExternalAudio && isPlaying && loopRange && audioElRef.current) {
              if (audioElRef.current.currentTime >= loopRange.end) {
                  audioElRef.current.currentTime = loopRange.start;
              }
          }

          if (isPlaying) {
              // For Web Audio, calculate manually
              if (!isExternalAudio && audioContext) {
                  if (loopRange && sourceRef.current?.loop) {
                      const loopDuration = (sourceRef.current.loopEnd || loopRange.end) - sourceRef.current.loopStart;
                      const rawElapsed = audioContext.currentTime - startTimeRef.current; 
                      
                      // Calculate position within the loop
                      let linearPos = rawElapsed;
                      if (loopDuration > 0) {
                          // Position relative to start of loop
                          const offsetInLoop = (rawElapsed - loopRange.start) % loopDuration;
                          linearPos = loopRange.start + offsetInLoop;
                          
                          // Correction for modulo of negative numbers if start time calc is off
                          if (linearPos < loopRange.start) linearPos = loopRange.start;
                      } else {
                          linearPos = loopRange.start;
                      }
                      setCurrentTime(linearPos);
                  } else {
                      const rawTime = audioContext.currentTime - startTimeRef.current;
                      setCurrentTime(Math.min(rawTime, duration));
                  }
              }
              // For HTML5 Audio, we rely on timeupdate/RAF for smoother UI
              else if (isExternalAudio && audioElRef.current) {
                  setCurrentTime(audioElRef.current.currentTime);
              }
          }
          rafRef.current = requestAnimationFrame(loop);
      };
      
      rafRef.current = requestAnimationFrame(loop);
      return () => {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
  }, [isPlaying, audioContext, duration, loopRange, isExternalAudio]);


  // 5. Text Selection
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
      {/* Article Header Information */}
      <div className="mb-8 mt-4 border-b border-slate-100 pb-6">
          <h1 className="text-3xl font-bold text-slate-800 leading-tight mb-4">{article.title}</h1>
          <div className="flex items-center gap-2">
             {isExternalAudio && (
                 <span className="text-xs font-mono text-orange-600 bg-orange-50 px-2 py-1 rounded inline-block border border-orange-100">
                     Official Audio
                 </span>
             )}
             <span className={`text-xs font-mono px-2 py-1 rounded inline-block transition-colors ${loopingSentenceId ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 bg-slate-50'}`}>
                 {loopingSentenceId ? 'Looping Segment' : 'Standard Playback'}
             </span>
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
                                if(isExternalAudio && audioElRef.current) audioElRef.current.currentTime = newTime;
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
                                if(isExternalAudio && audioElRef.current) audioElRef.current.currentTime = newTime;
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
    