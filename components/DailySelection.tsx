import React from 'react';
import { Article } from '../types';

interface Props {
  articles: Article[];
  onSelect: (article: Article) => void;
  language: string;
}

export const DailySelection: React.FC<Props> = ({ articles, onSelect, language }) => {
  // Identify the news article (it has a sourceUrl)
  const newsArticle = articles.find(a => a.sourceUrl);
  const otherArticles = articles.filter(a => a !== newsArticle);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in pb-10">
      <div className="bg-indigo-100 text-indigo-800 text-sm font-medium px-3 py-1 rounded-full mb-6">
        {language} Daily Selection
      </div>
      <h2 className="text-3xl font-bold text-slate-800 mb-4 text-center">
        Your Daily Readings
      </h2>
      <p className="text-slate-500 mb-10 text-center max-w-lg">
        Select an article to begin. We've curated the top story of the day and some interesting cultural topics for you.
      </p>

      <div className="w-full max-w-4xl px-4 grid gap-6 md:grid-cols-3">
        {/* Top News Card */}
        {newsArticle && (
            <div 
                onClick={() => onSelect(newsArticle)}
                className="md:col-span-3 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl p-6 text-white shadow-lg cursor-pointer hover:scale-[1.01] transition-transform relative overflow-hidden group"
            >
                <div className="absolute top-0 right-0 bg-white/20 backdrop-blur px-3 py-1 rounded-bl-lg text-xs font-bold tracking-wider">
                    MOST VIEWED TODAY
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3 text-indigo-100 text-xs font-mono uppercase">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                        Global News
                    </div>
                    <h3 className="text-2xl font-bold mb-3 leading-tight">{newsArticle.title}</h3>
                    <p className="text-indigo-100 line-clamp-2 mb-4 text-sm opacity-90">
                        {newsArticle.content.substring(0, 150)}...
                    </p>
                    <div className="flex items-center justify-between mt-4">
                        <span className="inline-flex items-center gap-1 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full text-xs font-medium transition-colors">
                            Read & Listen
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </span>
                        {newsArticle.sourceUrl && (
                             <a 
                                href={newsArticle.sourceUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-indigo-200 hover:text-white underline decoration-indigo-400/50"
                             >
                                View Official Source ↗
                             </a>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* Other Articles */}
        {otherArticles.map((article, idx) => (
            <div 
                key={article.id}
                onClick={() => onSelect(article)}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer flex flex-col h-full group"
            >
                 <div className="flex items-center gap-2 mb-3 text-slate-400 text-xs font-mono uppercase">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                    Topic {idx + 1}
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-indigo-700 line-clamp-2">
                    {article.title}
                </h3>
                <div className="mt-auto pt-4 flex justify-end">
                    <span className="text-indigo-600 text-sm font-medium group-hover:translate-x-1 transition-transform flex items-center gap-1">
                        Start Lesson
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </span>
                </div>
            </div>
        ))}
      </div>
    </div>
  );
};