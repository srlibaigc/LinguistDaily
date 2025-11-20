import React from 'react';
import { Language } from '../types';

interface Props {
  onSelect: (lang: Language) => void;
  loadingStates: Record<Language, { loading: boolean; ready: boolean }>;
}

const languages = Object.values(Language);

export const LanguageSelector: React.FC<Props> = ({ onSelect, loadingStates }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
      <h1 className="text-4xl font-bold text-slate-800 mb-8 text-center">
        Choose Your Journey
      </h1>
      <p className="text-slate-500 mb-12 text-center max-w-md">
        We are curating daily news and lessons for you. Please wait for your language to be ready.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl w-full px-4">
        {languages.map((lang) => {
          const status = loadingStates[lang] || { loading: true, ready: false };
          const isReady = status.ready;
          const isLoading = status.loading;

          return (
            <button
              key={lang}
              onClick={() => isReady && onSelect(lang)}
              disabled={!isReady}
              className={`relative p-6 border rounded-xl shadow-sm transition-all duration-200 flex flex-col items-center gap-3 group overflow-hidden
                ${isReady 
                  ? 'bg-white border-slate-200 hover:shadow-md hover:border-indigo-500 hover:bg-indigo-50 cursor-pointer' 
                  : 'bg-slate-50 border-slate-100 opacity-70 cursor-not-allowed'
                }
              `}
            >
              {isLoading && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
                   <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
              
              <span className={`text-3xl transition-all duration-300 ${isReady ? 'grayscale group-hover:grayscale-0' : 'grayscale'}`}>
                 {lang === Language.JAPANESE && '🇯🇵'}
                 {lang === Language.KOREAN && '🇰🇷'}
                 {lang === Language.FRENCH && '🇫🇷'}
                 {lang === Language.ITALIAN && '🇮🇹'}
                 {lang === Language.DUTCH && '🇳🇱'}
                 {lang === Language.ENGLISH && '🇬🇧'}
                 {lang === Language.CANTONESE && '🇭🇰'}
                 {lang === Language.SPANISH && '🇪🇸'}
              </span>
              <span className={`font-medium ${isReady ? 'text-slate-700 group-hover:text-indigo-600' : 'text-slate-400'}`}>
                {lang}
              </span>
              
              {/* Status Text */}
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                  {isLoading ? 'Preloading...' : isReady ? 'Ready' : 'Pending'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};