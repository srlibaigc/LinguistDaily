import React from 'react';
import { VocabularyItem } from '../types';

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
                 return (
                    <div 
                        key={item.id}
                        onClick={() => onViewWord(item)}
                        className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 cursor-pointer hover:border-indigo-300 transition-all group"
                    >
                        <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-slate-800 group-hover:text-indigo-600">{item.word}</span>
                            <span className={`w-2 h-2 rounded-full ${status.color}`} title={status.text}></span>
                        </div>
                        <div className="text-xs text-slate-500 truncate">{item.definitionEN}</div>
                    </div>
                 );
             })
         )}
      </div>
    </div>
  );
};