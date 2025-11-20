import React, { useState } from 'react';
import { VocabularyItem } from '../types';

interface Props {
  items: VocabularyItem[];
  onClose: () => void;
  onResult: (id: string, success: boolean) => void;
  onPlayAudio: (base64: string) => void;
}

export const FlashcardMode: React.FC<Props> = ({ items, onClose, onResult, onPlayAudio }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [finished, setFinished] = useState(false);

  // Safety check if items are empty
  if (!items || items.length === 0) return null;

  const currentItem = items[currentIndex];

  const handleNext = (success: boolean) => {
    onResult(currentItem.id, success);
    if (currentIndex < items.length - 1) {
      setIsFlipped(false);
      // Small delay to allow flip reset if needed, but usually better to just swap content
      // or wait for user. Here we swap immediately after state update.
      setTimeout(() => setCurrentIndex(currentIndex + 1), 200);
    } else {
      setFinished(true);
    }
  };

  const handleCardClick = () => {
      // Allow text selection without flipping
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;
      
      setIsFlipped(!isFlipped);
  };

  if (finished) {
      return (
          <div className="fixed inset-0 z-50 bg-slate-900/95 flex items-center justify-center p-4 animate-fade-in">
               <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
                   <div className="text-6xl mb-6">🎉</div>
                   <h2 className="text-3xl font-bold text-slate-800 mb-2">Session Complete!</h2>
                   <p className="text-slate-500 mb-8 text-lg">You've reviewed {items.length} words.</p>
                   <button onClick={onClose} className="bg-indigo-600 text-white px-6 py-4 rounded-xl font-bold w-full hover:bg-indigo-700 transition-colors shadow-lg hover:shadow-indigo-500/30">
                       Back to Reading
                   </button>
               </div>
          </div>
      );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center p-4">
        {/* Header */}
        <div className="w-full max-w-md flex justify-between items-center text-white/80 mb-8">
            <span className="font-mono font-medium tracking-wide">Word {currentIndex + 1} of {items.length}</span>
            <button 
                onClick={onClose} 
                className="hover:bg-white/10 p-2 rounded-full transition-colors"
                title="Close Review"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        {/* Card Container */}
        <div 
            className="relative w-full max-w-md aspect-[3/4] perspective-1000 group cursor-pointer" 
            onClick={handleCardClick}
        >
            <div className={`relative w-full h-full transition-transform duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
                
                {/* Front: Word */}
                <div className="absolute inset-0 backface-hidden bg-white rounded-3xl shadow-2xl flex flex-col items-center justify-center p-8 border-4 border-slate-100">
                    <div className="flex-1 flex flex-col items-center justify-center w-full">
                        <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-6">Vocabulary</span>
                        <h2 className="text-5xl font-bold text-slate-800 mb-8 text-center break-words w-full">{currentItem.word}</h2>
                        
                        {currentItem.audioBase64 && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); onPlayAudio(currentItem.audioBase64!); }}
                                className="p-5 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-600 hover:text-white hover:scale-110 transition-all shadow-sm ring-1 ring-indigo-100"
                                title="Play Pronunciation"
                            >
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                            </button>
                        )}
                    </div>
                    <p className="text-slate-300 text-sm font-medium animate-pulse mt-auto">Tap card to flip</p>
                </div>

                {/* Back: Definitions */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-50 rounded-3xl shadow-2xl flex flex-col p-8 border-4 border-indigo-100 overflow-y-auto custom-scrollbar text-left">
                     <div className="flex justify-between items-center mb-6 border-b border-indigo-100 pb-4">
                        <h3 className="text-3xl font-bold text-indigo-900">{currentItem.word}</h3>
                        <span className="font-mono text-indigo-500 bg-white px-2 py-1 rounded shadow-sm">/{currentItem.phonetic}/</span>
                     </div>
                     
                     <div className="space-y-6 flex-1">
                        <div>
                            <div className="text-xs font-bold text-indigo-400 uppercase mb-1">English Definition</div>
                            <p className="text-slate-800 leading-relaxed font-medium">{currentItem.definitionEN}</p>
                        </div>
                        
                        <div>
                             <div className="text-xs font-bold text-indigo-400 uppercase mb-1">Chinese Definition</div>
                             <p className="text-slate-700">{currentItem.definitionCN}</p>
                        </div>

                        <div className="bg-white p-5 rounded-xl shadow-sm border border-indigo-100/50">
                            <div className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                                Context Example
                            </div>
                            <p className="text-slate-700 italic leading-relaxed">"{currentItem.dailyExample}"</p>
                        </div>
                     </div>
                     
                     <p className="mt-4 self-center text-indigo-400 text-sm font-medium opacity-70">
                        Tap anywhere to flip back
                     </p>
                </div>
            </div>
        </div>

        {/* Controls */}
        <div className={`flex gap-4 mt-8 w-full max-w-md transition-all duration-500 ${isFlipped ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-4 pointer-events-none'}`}>
             <button 
                onClick={(e) => { e.stopPropagation(); handleNext(false); }}
                className="flex-1 bg-rose-100 text-rose-600 py-4 rounded-xl font-bold hover:bg-rose-200 active:scale-95 transition-all shadow-sm flex flex-col items-center"
             >
                <span className="text-lg">Needs Review</span>
                <span className="text-[10px] opacity-70 font-normal uppercase tracking-wide">Reset Stage</span>
             </button>
             <button 
                onClick={(e) => { e.stopPropagation(); handleNext(true); }}
                className="flex-1 bg-emerald-100 text-emerald-600 py-4 rounded-xl font-bold hover:bg-emerald-200 active:scale-95 transition-all shadow-sm flex flex-col items-center"
             >
                <span className="text-lg">I Know This</span>
                <span className="text-[10px] opacity-70 font-normal uppercase tracking-wide">Next Interval</span>
             </button>
        </div>
    </div>
  );
};