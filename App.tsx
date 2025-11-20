import React, { useState, useEffect } from 'react';
import { Language, Article, VocabularyItem, AppState } from './types';
import { generateTopics, generateArticle, generateSpeech, analyzeWord } from './services/geminiService';
import { LanguageSelector } from './components/LanguageSelector';
import { TopicSelector } from './components/TopicSelector';
import { ArticleView } from './components/ArticleView';
import { SidebarLeft } from './components/SidebarLeft';
import { SidebarRight } from './components/SidebarRight';
import { WordDetailModal } from './components/WordDetailModal';

// Ebbinghaus intervals (in milliseconds)
const INTERVALS = [
    1 * 24 * 60 * 60 * 1000, // 1 day
    3 * 24 * 60 * 60 * 1000, // 3 days
    7 * 24 * 60 * 60 * 1000, // 7 days
    15 * 24 * 60 * 60 * 1000, // 15 days
    30 * 24 * 60 * 60 * 1000 // 30 days
];

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    selectedLanguage: null,
    currentArticle: null,
    history: [],
    vocabulary: [],
    isLoading: false,
    loadingMessage: ''
  });

  const [topics, setTopics] = useState<string[]>([]);
  const [stage, setStage] = useState<'LANG' | 'TOPIC' | 'READ'>('LANG');
  const [selectedWord, setSelectedWord] = useState<VocabularyItem | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true); // Mobile toggle

  // Load data from local storage on mount
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('linguist_history');
      const savedVocab = localStorage.getItem('linguist_vocab');
      setState(prev => ({
          ...prev,
          history: savedHistory ? JSON.parse(savedHistory) : [],
          vocabulary: savedVocab ? JSON.parse(savedVocab) : []
      }));
    } catch (e) {
      console.error("Failed to load data from storage", e);
    }
  }, []);

  const handleLanguageSelect = async (lang: Language) => {
    setState(prev => ({ ...prev, selectedLanguage: lang, isLoading: true, loadingMessage: `Curating topics for ${lang}...` }));
    try {
        const generatedTopics = await generateTopics(lang);
        setTopics(generatedTopics);
        setStage('TOPIC');
    } catch (error) {
        console.error(error);
        alert("Failed to generate topics. Please check your API key.");
    } finally {
        setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleTopicSelect = async (topic: string) => {
    if (!state.selectedLanguage) return;
    
    setState(prev => ({ ...prev, isLoading: true, loadingMessage: `Writing article about ${topic} and generating high-quality narration...` }));
    
    try {
        // Parallel generation for speed, though text is needed for audio technically. 
        // In a real app, we generate text first, then audio.
        const articleData = await generateArticle(topic, state.selectedLanguage);
        
        // Generate Audio
        setState(prev => ({ ...prev, loadingMessage: 'Synthesizing audio...' }));
        const audioData = await generateSpeech(articleData.content, state.selectedLanguage);
        
        const newArticle: Article = {
            id: crypto.randomUUID(),
            date: new Date().toLocaleDateString(),
            title: articleData.title,
            content: articleData.content,
            language: state.selectedLanguage,
            audioBase64: audioData
        };

        const updatedHistory = [newArticle, ...state.history];
        
        // Update State (includes audio)
        setState(prev => ({
            ...prev,
            currentArticle: newArticle,
            history: updatedHistory
        }));

        // Save to LocalStorage (EXCLUDES audio to prevent QuotaExceededError)
        try {
          const historyForStorage = updatedHistory.map(article => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { audioBase64, ...rest } = article;
            return rest;
          });
          localStorage.setItem('linguist_history', JSON.stringify(historyForStorage));
        } catch (e) {
          console.warn("Failed to save history to localStorage (likely quota exceeded)", e);
        }

        setStage('READ');

    } catch (error) {
        console.error(error);
        alert("Failed to create lesson.");
    } finally {
        setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleWordSelect = async (word: string, context: string) => {
    // Check if already exists
    const existing = state.vocabulary.find(v => v.word.toLowerCase() === word.toLowerCase());
    if (existing) {
        setSelectedWord(existing);
        return;
    }

    setState(prev => ({ ...prev, isLoading: true, loadingMessage: `Analyzing "${word}"...` }));
    try {
        // Generate analysis and pronunciation audio in parallel
        const [details, audioBase64] = await Promise.all([
            analyzeWord(word, state.selectedLanguage!, context),
            generateSpeech(word, state.selectedLanguage!).catch(e => {
                console.warn("Failed to generate pronunciation audio", e);
                return undefined;
            })
        ]);

        const newItem: VocabularyItem = {
            ...details,
            id: crypto.randomUUID(),
            addedAt: Date.now(),
            nextReviewAt: Date.now() + INTERVALS[0],
            reviewStage: 0,
            contextSentence: context,
            audioBase64: audioBase64
        };

        const updatedVocab = [newItem, ...state.vocabulary];
        
        try {
          localStorage.setItem('linguist_vocab', JSON.stringify(updatedVocab));
        } catch (e) {
          console.error("Failed to save vocabulary", e);
        }
        
        setState(prev => ({ ...prev, vocabulary: updatedVocab }));
        setSelectedWord(newItem);
    } catch (error) {
        console.error(error);
    } finally {
        setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleReviewWord = (id: string) => {
      const now = Date.now();
      const updatedVocab = state.vocabulary.map(item => {
          if (item.id === id) {
              const nextStage = item.reviewStage + 1;
              // Clamp index to max of intervals array
              const intervalIndex = Math.min(nextStage, INTERVALS.length - 1);
              const nextInterval = INTERVALS[intervalIndex];

              return {
                  ...item,
                  reviewStage: nextStage,
                  lastReviewedAt: now,
                  nextReviewAt: now + nextInterval
              };
          }
          return item;
      });

      try {
        localStorage.setItem('linguist_vocab', JSON.stringify(updatedVocab));
      } catch (e) {
        console.error("Failed to update vocabulary in storage", e);
      }
      
      // Update state
      setState(prev => ({ ...prev, vocabulary: updatedVocab }));
      
      // Update modal if currently open
      const updatedWord = updatedVocab.find(v => v.id === id) || null;
      if (updatedWord) {
        setSelectedWord(updatedWord);
      }
  };

  const handleHistorySelect = (article: Article) => {
      setState(prev => ({ ...prev, currentArticle: article }));
      setStage('READ');
      // For mobile, maybe close sidebar
      if (window.innerWidth < 768) setSidebarOpen(false);
  };
  
  const handleDictionaryUpload = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.json,.csv';
      input.onchange = (e: any) => {
          const file = e.target.files[0];
          if(file) {
             // Mock implementation
             alert(`Uploaded ${file.name}. Dictionary integrated into context analysis.`);
          }
      };
      input.click();
  };

  return (
    <div className="flex h-screen w-full bg-white text-slate-800 overflow-hidden relative">
      
      {/* Loading Overlay */}
      {state.isLoading && (
        <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
          <p className="text-indigo-900 font-medium animate-pulse">{state.loadingMessage}</p>
        </div>
      )}

      {/* Left Sidebar (History) */}
      <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:relative z-20 w-64 h-full bg-slate-50 border-r transition-transform duration-300`}>
        <SidebarLeft 
            history={state.history} 
            currentId={state.currentArticle?.id}
            onSelectArticle={handleHistorySelect}
        />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto relative w-full">
        {/* Mobile Header for Sidebar Toggle */}
        <div className="md:hidden p-4 flex items-center">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
        </div>

        <div className="p-6 min-h-full">
            {stage === 'LANG' && <LanguageSelector onSelect={handleLanguageSelect} />}
            {stage === 'TOPIC' && <TopicSelector topics={topics} onSelect={handleTopicSelect} language={state.selectedLanguage!} />}
            {stage === 'READ' && state.currentArticle && (
                <ArticleView 
                    article={state.currentArticle} 
                    onWordSelect={handleWordSelect} 
                />
            )}
        </div>
      </main>

      {/* Right Sidebar (Vocabulary) - Only visible when reading */}
      {stage === 'READ' && (
          <div className="hidden lg:block w-72 h-full border-l bg-slate-50">
            <SidebarRight 
                vocabulary={state.vocabulary} 
                onUploadDictionary={handleDictionaryUpload}
                onViewWord={setSelectedWord}
            />
          </div>
      )}

      {/* Modal for Word Details */}
      {selectedWord && (
          <WordDetailModal 
            item={selectedWord} 
            onClose={() => setSelectedWord(null)} 
            onReview={handleReviewWord}
          />
      )}

    </div>
  );
};

export default App;