import React from 'react';
import { Language } from '../types';

interface Props {
  stage: 'LANG' | 'SELECTION' | 'READ';
  selectedLanguage: Language | null;
  articleTitle?: string;
  onNavigate: (dest: 'LANG' | 'SELECTION') => void;
}

export const Breadcrumbs: React.FC<Props> = ({ stage, selectedLanguage, articleTitle, onNavigate }) => {
  return (
    <nav className="flex items-center text-sm font-medium text-slate-500 mb-4 px-1 overflow-x-auto whitespace-nowrap pb-2 md:pb-0">
      <button 
        onClick={() => onNavigate('LANG')}
        className={`hover:text-indigo-600 transition-colors flex items-center gap-1 ${stage === 'LANG' ? 'text-indigo-800 font-bold cursor-default' : ''}`}
        disabled={stage === 'LANG'}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
        Home
      </button>
      
      {stage !== 'LANG' && selectedLanguage && (
        <>
          <svg className="w-3 h-3 mx-2 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <button 
            onClick={() => onNavigate('SELECTION')}
            className={`hover:text-indigo-600 transition-colors ${stage === 'SELECTION' ? 'text-indigo-800 font-bold cursor-default' : ''}`}
            disabled={stage === 'SELECTION'}
          >
            {selectedLanguage}
          </button>
        </>
      )}

      {stage === 'READ' && articleTitle && (
         <>
          <svg className="w-3 h-3 mx-2 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <span className="text-indigo-800 font-bold truncate max-w-[150px] md:max-w-md block" title={articleTitle}>
            {articleTitle}
          </span>
        </>
      )}
    </nav>
  );
};
