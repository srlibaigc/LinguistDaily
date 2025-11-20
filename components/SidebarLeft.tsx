import React from 'react';
import { Article } from '../types';

interface Props {
  history: Article[];
  currentId?: string;
  onSelectArticle: (article: Article) => void;
}

export const SidebarLeft: React.FC<Props> = ({ history, currentId, onSelectArticle }) => {
  // Group history by date (simple mock)
  return (
    <div className="h-full bg-slate-50 border-r border-slate-200 p-4 flex flex-col overflow-hidden">
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
        Learning History
      </h2>
      
      <div className="flex-1 overflow-y-auto pr-2 space-y-3">
        {history.length === 0 ? (
            <div className="text-slate-400 text-sm italic p-2">No history yet.</div>
        ) : (
            history.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelectArticle(item)}
                className={`w-full text-left p-3 rounded-lg text-sm transition-all ${
                  item.id === currentId 
                    ? 'bg-white shadow-sm border-l-4 border-indigo-500' 
                    : 'hover:bg-slate-200 text-slate-600'
                }`}
              >
                <div className="font-semibold mb-1 truncate">{item.title}</div>
                <div className="text-xs text-slate-400 flex justify-between">
                    <span>{item.language}</span>
                    <span>{item.date}</span>
                </div>
              </button>
            ))
        )}
      </div>
    </div>
  );
};