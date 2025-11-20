import React from 'react';
import { VocabularyItem } from '../types';
import { decodeAudioData } from '../services/geminiService';

interface Props {
  vocabulary: VocabularyItem[];
  onUploadDictionary: () => void;
  onViewWord: (word: VocabularyItem) => void;
}

// Helper to calculate urgency based on Ebbinghaus
const getReviewStatus = (nextReview: number) => {
    const now = Date.now();
    const diffHours = (nextReview - now) / (1000 * 60 * 60);
    
    if (diffHours < 0) return { color: 'bg-red-500', text: 'Review Now' };
    if (diffHours < 24) return { color: 'bg-orange-400', text: 'Soon' };
    return { color: 'bg-green-400', text: 'On Track' };
};

export const SidebarRight: React.FC<Props> = ({ vocabulary, onUploadDictionary, onViewWord }) => {

  const playAudio = async (e: React.MouseEvent, base64?: string) => {
    e.stopPropagation();
    if (!base64) return;
    
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 24000 });
      const buffer = await decodeAudioData(base64, ctx);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      source.onended = () => {
          setTimeout(() => ctx.close(), 200);
      };
    } catch (err) {
      console.error("Error playing audio:", err);
    }
  };

  return (
    <div className="h-full bg-slate-50 border-l border-slate-200 p-4 flex flex-col overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Vocabulary
        </h2>
        <button 
          onClick={onUploadDictionary}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          Import Dict
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto pr-2 space-y-2">
         {vocabulary.length === 0 ? (
            <div className="text-slate-400 text-sm italic p-2 text-center mt-10">
                Select words in the text to add them here.
            </div>
         ) : (
             vocabulary.map((item) => {
                 const status = getReviewStatus(item.nextReviewAt);
                 // Visual cap for the stages (since there are 5 intervals defined in App.tsx)
                 const maxStages = 5;
                 const currentStage = Math.min(item.reviewStage, maxStages);

                 return (
                    <div 
                        key={item.id}
                        onClick={() => onViewWord(item)}
                        className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 cursor-pointer hover:border-indigo-300 transition-all group"
                    >
                        <div className="flex justify-between items-start mb-1">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800 group-hover:text-indigo-600">{item.word}</span>
                                {item.audioBase64 && (
                                    <button 
                                        onClick={(e) => playAudio(e, item.audioBase64)}
                                        className="text-slate-400 hover:text-indigo-600 transition-colors p-1 rounded-full hover:bg-indigo-50"
                                        title="Play pronunciation"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                            <span className={`w-2 h-2 rounded-full ${status.color}`} title={status.text}></span>
                        </div>
                        
                        <div className="text-xs text-slate-500 truncate mb-2">{item.definitionEN}</div>
                        
                        {/* Ebbinghaus Mastery Stage Indicator */}
                        <div className="flex gap-1 items-center mt-2" title={`Mastery Stage: ${item.reviewStage}/5`}>
                            {Array.from({ length: maxStages }).map((_, i) => (
                                <div 
                                    key={i} 
                                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                                        i < currentStage ? 'bg-indigo-500' : 'bg-slate-200'
                                    }`} 
                                />
                            ))}
                        </div>
                    </div>
                 );
             })
         )}
      </div>
    </div>
  );
};