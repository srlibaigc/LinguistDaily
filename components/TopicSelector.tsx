import React from 'react';

interface Props {
  topics: string[];
  onSelect: (topic: string) => void;
  language: string;
}

export const TopicSelector: React.FC<Props> = ({ topics, onSelect, language }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
      <div className="bg-indigo-100 text-indigo-800 text-sm font-medium px-3 py-1 rounded-full mb-6">
        {language} Learning Mode
      </div>
      <h2 className="text-3xl font-bold text-slate-800 mb-4 text-center">
        What interests you today?
      </h2>
      <p className="text-slate-500 mb-10 text-center">
        Select a topic to generate your daily lesson.
      </p>
      <div className="space-y-4 w-full max-w-xl px-4">
        {topics.map((topic, idx) => (
          <button
            key={idx}
            onClick={() => onSelect(topic)}
            className="w-full p-5 text-left bg-white border border-slate-200 rounded-lg hover:border-indigo-500 hover:ring-1 hover:ring-indigo-500 transition-all duration-200 shadow-sm flex justify-between items-center group"
          >
            <span className="text-lg font-medium text-slate-700 group-hover:text-indigo-700">
              {topic}
            </span>
            <svg className="w-5 h-5 text-slate-300 group-hover:text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
};