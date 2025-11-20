import React, { useState, useEffect } from 'react';
import { Language, Article, VocabularyItem, AppState } from './types';
import { generateSpeech, analyzeWord, preloadLanguageContent, decodeAudioData } from './services/geminiService';
import { LanguageSelector } from './components/LanguageSelector';
import { DailySelection } from './components/DailySelection';
import { ArticleView } from './components/ArticleView';
import { SidebarLeft } from './components/SidebarLeft';
import { SidebarRight } from './components/SidebarRight';
import { WordDetailModal } from './components/WordDetailModal';
import { FlashcardMode } from './components/FlashcardMode';
import { Breadcrumbs } from './components/Breadcrumbs';

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

  // Track loading state for each language
  const [langLoadState, setLangLoadState] = useState<Record<Language, { loading: boolean, ready: boolean }>>({} as any);
  // Store preloaded articles per language
  const [preloadedContent, setPreloadedContent] = useState<Record<Language, Article[]>>({} as any);

  const [stage, setStage] = useState<'LANG' | 'SELECTION' | 'READ'>('LANG');
  const [selectedWord, setSelectedWord] = useState<VocabularyItem | null>(null);
  
  // Sidebar states
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);

  // Flashcard State
  const [isFlashcardMode, setIsFlashcardMode] = useState(false);
  const [flashcardItems, setFlashcardItems] = useState<VocabularyItem[]>([]);

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

  // INITIALIZATION: Preload content for all languages
  useEffect(() => {
    const languages = Object.values(Language);
    
    // Initialize states
    const initialStates: any = {};
    languages.forEach(l => {
        initialStates[l] = { loading: true, ready: false };
    });
    setLangLoadState(initialStates);

    // Trigger preloads
    languages.forEach(lang => {
        preloadLanguageContent(lang).then(articles => {
            setPreloadedContent(prev => ({ ...prev, [lang]: articles }));
            setLangLoadState(prev => ({
                ...prev,
                [lang]: { loading: false, ready: articles.length > 0 }
            }));
        }).catch(err => {
            console.error(`Failed to preload ${lang}`, err);
            setLangLoadState(prev => ({
                ...prev,
                [lang]: { loading: false, ready: false } // Failed
            }));
        });
    });
  }, []);

  const handleLanguageSelect = (lang: Language) => {
    setState(prev => ({ ...prev, selectedLanguage: lang }));
    setStage('SELECTION');
  };

  const handleArticleSelect = async (article: Article) => {
      const updatedHistory = [article, ...state.history];
      
      setState(prev => ({
          ...prev,
          currentArticle: article,
          history: updatedHistory
      }));

      // Save to LocalStorage (EXCLUDES audio)
      try {
        const historyForStorage = updatedHistory.map(a => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { audioBase64, ...rest } = a;
          return rest;
        });
        localStorage.setItem('linguist_history', JSON.stringify(historyForStorage));
      } catch (e) {
        console.warn("Failed to save history", e);
      }

      setStage('READ');
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

  // General update function for vocabulary item status
  const updateVocabularyItem = (id: string, updater: (item: VocabularyItem) => VocabularyItem) => {
    const updatedVocab = state.vocabulary.map(item => {
        if (item.id === id) {
            return updater(item);
        }
        return item;
    });

    try {
      localStorage.setItem('linguist_vocab', JSON.stringify(updatedVocab));
    } catch (e) {
      console.error("Failed to update vocabulary in storage", e);
    }
    
    setState(prev => ({ ...prev, vocabulary: updatedVocab }));
    return updatedVocab;
  };

  // Handle manual "Mark as Reviewed" from Modal
  const handleReviewWord = (id: string) => {
      const updatedVocab = updateVocabularyItem(id, (item) => {
          const now = Date.now();
          const nextStage = item.reviewStage + 1;
          const intervalIndex = Math.min(nextStage, INTERVALS.length - 1);
          const nextInterval = INTERVALS[intervalIndex];
          return {
              ...item,
              reviewStage: nextStage,
              lastReviewedAt: now,
              nextReviewAt: now + nextInterval
          };
      });

      // Update modal if currently open
      const updatedWord = updatedVocab.find(v => v.id === id) || null;
      if (updatedWord) {
        setSelectedWord(updatedWord);
      }
  };

  // Handle Flashcard Result (Success vs Failure)
  const handleFlashcardResult = (id: string, success: boolean) => {
      updateVocabularyItem(id, (item) => {
          const now = Date.now();
          if (success) {
               // Advance stage
               const nextStage = item.reviewStage + 1;
               const intervalIndex = Math.min(nextStage, INTERVALS.length - 1);
               return {
                   ...item,
                   reviewStage: nextStage,
                   lastReviewedAt: now,
                   nextReviewAt: now + INTERVALS[intervalIndex]
               };
          } else {
               // Reset stage on failure (Ebbinghaus reset)
               return {
                   ...item,
                   reviewStage: 0,
                   lastReviewedAt: now,
                   nextReviewAt: now + INTERVALS[0] // Reset to 1 day
               };
          }
      });
  };

  const startFlashcardSession = () => {
      const now = Date.now();
      // Prefer due items, if none, take all sorted by review date
      let itemsToReview = state.vocabulary.filter(v => v.nextReviewAt <= now);
      
      if (itemsToReview.length === 0) {
          // If nothing due, just practice everything, oldest review first
          itemsToReview = [...state.vocabulary].sort((a, b) => a.nextReviewAt - b.nextReviewAt);
      }

      if (itemsToReview.length > 0) {
          setFlashcardItems(itemsToReview);
          setIsFlashcardMode(true);
          // Close sidebars on mobile
          setRightSidebarOpen(false);
      } else {
          alert("Add some words to your vocabulary first!");
      }
  };

  const handlePlayAudio = async (base64: string) => {
     try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass({ sampleRate: 24000 });
        const buffer = await decodeAudioData(base64, ctx);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
     } catch(e) {
         console.error(e);
     }
  };

  const handleHistorySelect = (article: Article) => {
      setState(prev => ({ ...prev, currentArticle: article }));
      setStage('READ');
      // For mobile, close sidebar
      setLeftSidebarOpen(false);
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

  const handleNavigation = (dest: 'LANG' | 'SELECTION') => {
      setStage(dest);
      if (dest === 'LANG') {
          setState(prev => ({ ...prev, selectedLanguage: null }));
      }
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

      {/* Left Sidebar (History) - Responsive Drawer */}
      <div className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-slate-50 border-r transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:inset-auto
        ${leftSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        <SidebarLeft 
            history={state.history} 
            currentId={state.currentArticle?.id}
            onSelectArticle={handleHistorySelect}
        />
        {/* Close button for mobile */}
        <button 
            onClick={() => setLeftSidebarOpen(false)}
            className="absolute top-4 right-4 lg:hidden text-slate-400 hover:text-slate-600"
        >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Overlay for mobile Left Sidebar */}
      {leftSidebarOpen && (
        <div 
            className="fixed inset-0 bg-black/20 z-20 lg:hidden"
            onClick={() => setLeftSidebarOpen(false)}
        ></div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto relative w-full flex flex-col">
        
        {/* Mobile Header for Sidebar Toggles */}
        <div className="lg:hidden p-4 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <button 
                onClick={() => setLeftSidebarOpen(true)} 
                className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            
            <span className="font-bold text-indigo-600">LinguistDaily</span>

            {stage === 'READ' && (
                <button 
                    onClick={() => setRightSidebarOpen(true)} 
                    className="p-2 -mr-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                >
                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                </button>
            )}
            {stage !== 'READ' && <div className="w-10"></div>}
        </div>

        <div className="p-4 md:p-6 flex-1">
            <Breadcrumbs 
                stage={stage} 
                selectedLanguage={state.selectedLanguage} 
                articleTitle={state.currentArticle?.title}
                onNavigate={handleNavigation}
            />
            
            {stage === 'LANG' && (
                <LanguageSelector 
                    onSelect={handleLanguageSelect} 
                    loadingStates={langLoadState}
                />
            )}
            {stage === 'SELECTION' && state.selectedLanguage && (
                <DailySelection 
                    articles={preloadedContent[state.selectedLanguage] || []}
                    onSelect={handleArticleSelect}
                    language={state.selectedLanguage}
                />
            )}
            {stage === 'READ' && state.currentArticle && (
                <ArticleView 
                    article={state.currentArticle} 
                    onWordSelect={handleWordSelect} 
                />
            )}
        </div>
      </main>

      {/* Right Sidebar (Vocabulary) - Responsive Drawer */}
      {stage === 'READ' && (
        <>
            <div className={`
                fixed inset-y-0 right-0 z-30 w-72 bg-slate-50 border-l transform transition-transform duration-300 ease-in-out
                lg:translate-x-0 lg:static lg:inset-auto
                ${rightSidebarOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full'}
            `}>
                <SidebarRight 
                    vocabulary={state.vocabulary} 
                    onUploadDictionary={handleDictionaryUpload}
                    onViewWord={setSelectedWord}
                    onStartReview={startFlashcardSession}
                />
                {/* Close button for mobile */}
                <button 
                    onClick={() => setRightSidebarOpen(false)}
                    className="absolute top-4 left-4 lg:hidden text-slate-400 hover:text-slate-600 bg-white/80 rounded-full p-1"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            
             {/* Overlay for mobile Right Sidebar */}
            {rightSidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black/20 z-20 lg:hidden"
                    onClick={() => setRightSidebarOpen(false)}
                ></div>
            )}
        </>
      )}

      {/* Modal for Word Details */}
      {selectedWord && (
          <WordDetailModal 
            item={selectedWord} 
            onClose={() => setSelectedWord(null)} 
            onReview={handleReviewWord}
          />
      )}

      {/* Flashcard Mode Overlay */}
      {isFlashcardMode && (
          <FlashcardMode 
             items={flashcardItems}
             onClose={() => setIsFlashcardMode(false)}
             onResult={handleFlashcardResult}
             onPlayAudio={handlePlayAudio}
          />
      )}

    </div>
  );
};

export default App;
