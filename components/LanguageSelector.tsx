import React from 'react';
import { Language } from '../types';

interface Props {
  onSelect: (lang: Language) => void;
}

const languages = Object.values(Language);

export const LanguageSelector: React.FC<Props> = ({ onSelect }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
      <h1 className="text-4xl font-bold text-slate-800 mb-8 text-center">
        Choose Your Journey
      </h1>
      <p className="text-slate-500 mb-12 text-center max-w-md">
        Select a language to begin your daily immersive learning experience.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl w-full px-4">
        {languages.map((lang) => (
          <button
            key={lang}
            onClick={() => onSelect(lang)}
            className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-indigo-500 hover:bg-indigo-50 transition-all duration-200 flex flex-col items-center gap-3 group"
          >
            <span className="text-3xl grayscale group-hover:grayscale-0 transition-all duration-300">
               {/* Simple Maps/Flags via emoji for visual cue */}
               {lang === Language.JAPANESE && '🇯🇵'}
               {lang === Language.KOREAN && '🇰🇷'}
               {lang === Language.FRENCH && '🇫🇷'}
               {lang === Language.ITALIAN && '🇮🇹'}
               {lang === Language.DUTCH && '🇳🇱'}
               {lang === Language.ENGLISH && '🇬🇧'}
               {lang === Language.CANTONESE && '🇭🇰'}
               {lang === Language.SPANISH && '🇪🇸'}
            </span>
            <span className="font-medium text-slate-700 group-hover:text-indigo-600">
              {lang}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};