import React from 'react';
import { VocabularyItem } from '../types';

interface Props {
  item: VocabularyItem | null;
  onClose: () => void;
  onReview: (id: string) => void;
}

export const WordDetailModal: React.FC<Props> = ({ item, onClose, onReview }) => {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
           <div>
             <h2 className="text-3xl font-bold text-slate-900">{item.word}</h2>
             <p className="text-indigo-600 font-mono text-lg mt-1">/{item.phonetic}/</p>
           </div>
           <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
           </button>
        </div>
        
        <div className="p-6 space-y-6">
            {/* Pronunciation Guide */}
            <div className="bg-indigo-50 p-4 rounded-lg text-indigo-900 text-sm">
                <strong>Pronunciation Tip:</strong> {item.pronunciationGuide}
            </div>

            {/* Definitions */}
            <div className="grid gap-4">
                <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">English Definition</h4>
                    <p className="text-slate-800">{item.definitionEN}</p>
                </div>
                <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Chinese Definition</h4>
                    <p className="text-slate-800">{item.definitionCN}</p>
                </div>
                <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Original Definition</h4>
                    <p className="text-slate-800 italic">{item.definitionSource}</p>
                </div>
            </div>

            <hr className="border-slate-100" />

            {/* Examples */}
            <div className="space-y-4">
                <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Daily Life Example</h4>
                    <p className="text-slate-700 bg-slate-50 p-3 rounded border border-slate-100">{item.dailyExample}</p>
                </div>
                <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Academic Example</h4>
                    <p className="text-slate-700 bg-slate-50 p-3 rounded border border-slate-100">{item.academicExample}</p>
                </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="text-xs text-slate-400">
                    <div>Last Reviewed: {new Date(item.lastReviewedAt || item.addedAt).toLocaleDateString()}</div>
                    <div>Next Review: {new Date(item.nextReviewAt).toLocaleDateString()}</div>
                </div>
                <button 
                  onClick={() => onReview(item.id)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Mark as Reviewed
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};