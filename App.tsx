
import React, { useState, useEffect } from 'react';
import { Language, Article, VocabularyItem, AppState, ApiSettings } from './types';
import { generateSpeech, analyzeWord, preloadLanguageContent, decodeAudioData, isQuotaError } from './services/aiService';
import { fetchSupabaseConfig } from './services/supabaseService';
import { LanguageSelector } from './components/LanguageSelector';
import { DailySelection } from './components/DailySelection';
import { ArticleView } from './components/ArticleView';
import { SidebarLeft } from './components/SidebarLeft';
import { SidebarRight } from './components/SidebarRight';
import { WordDetailModal } from './components/WordDetailModal';
import { FlashcardMode } from './components/FlashcardMode';
import { Breadcrumbs } from './components/Breadcrumbs';
import { SettingsModal } from './components/SettingsModal';

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
      isLoading: true, // Start loading while we init settings
      loadingMessage: 'Initializing application...',
      apiSettings: {
          primary: 'openai',
          backup: 'deepseek',
          keys: {}
      }
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

  // Settings Modal
  const [showSettings, setShowSettings] = useState(false);

  // REUSABLE: Refresh content logic with Recovery
  const refreshContent = async (settings: ApiSettings) => {
    const languages = Object.values(Language);
    
    // 1. Reset loading states
    const initialStates: any = {};
    languages.forEach(l => {
        initialStates[l] = { loading: true, ready: false };
    });
    setLangLoadState(initialStates);
    
    // Clear current preloaded content to reflect refresh
    setPreloadedContent({} as any);

    // 2. Process languages sequentially
    for (const lang of languages) {
        try {
            // Pass the settings provided to the function
            const articles = await preloadLanguageContent(lang, settings);
            setPreloadedContent(prev => ({ ...prev, [lang]: articles }));
            setLangLoadState(prev => ({
                ...prev,
                [lang]: { loading: false, ready: articles.length > 0 }
            }));
        } catch (err: any) {
            if (isQuotaError(err)) {
                console.warn(`Quota exceeded for ${lang}. Attempting recovery via Supabase...`);
                // Try to fetch fresh config from Supabase
                const freshConfig = await fetchSupabaseConfig();
                
                // If we got fresh keys and they look different from what we have (or just valid)
                if (freshConfig && freshConfig.keys) {
                    const newGeminiKey = freshConfig.keys.gemini;
                    const currentGeminiKey = settings.keys.gemini;

                    // Prevent infinite loops if the DB key is the same one that just failed
                    if (newGeminiKey && newGeminiKey !== currentGeminiKey) {
                        console.log("New keys found. Updating settings and retrying init...");
                        const newSettings = {
                             ...settings,
                             keys: {
                                 ...settings.keys,
                                 ...freshConfig.keys
                             }
                        };
                        
                        // Trigger save, which updates state and restarts refreshContent
                        handleSettingsSave(newSettings);
                        return; // Stop the current loop, let the new execution take over
                    } else {
                        console.warn("Fetched keys from Supabase are identical to current failed keys. Aborting retry.");
                    }
                }
            }

            console.error(`Failed to preload ${lang}`, err);
            setLangLoadState(prev => ({
                ...prev,
                [lang]: { loading: false, ready: false }
            }));
        }
        // Small delay between requests to be gentle on API limits
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
  };

  // INITIALIZATION SEQUENCE
  useEffect(() => {
    const initApp = async () => {
        // 1. Fetch Supabase Config FIRST (Primary Source of Truth)
        let remoteConfig: Partial<ApiSettings> | null = null;
        try {
            remoteConfig = await fetchSupabaseConfig();
        } catch (e) {
            console.warn("Supabase init failed", e);
        }

        // 2. Load LocalStorage
        let savedHistory: Article[] = [];
        let savedVocab: VocabularyItem[] = [];
        let localSettings: ApiSettings | null = null;

        try {
            const h = localStorage.getItem('linguist_history');
            if (h) savedHistory = JSON.parse(h);
            
            const v = localStorage.getItem('linguist_vocab');
            if (v) savedVocab = JSON.parse(v);

            const s = localStorage.getItem('linguist_settings');
            if (s) localSettings = JSON.parse(s);
        } catch (e) {
            console.error("Failed to load local storage", e);
        }

        // 3. Construct Settings
        // Priority: Supabase (Remote) > LocalStorage (User Override) > Process.Env (Fallback)
        // Note: We prefer Remote keys for 'gemini' if they exist, assuming it's a managed key.
        
        const envKeys = {
            gemini: process.env.API_KEY,
            openai: process.env.OPENAI_API_KEY,
            deepseek: process.env.DEEPSEEK_API_KEY
        };

        const baseKeys = {
            gemini: remoteConfig?.keys?.gemini || envKeys.gemini,
            openai: remoteConfig?.keys?.openai || envKeys.openai,
            deepseek: remoteConfig?.keys?.deepseek || envKeys.deepseek
        };

        const finalSettings: ApiSettings = {
            primary: localSettings?.primary || 'gemini',
            backup: localSettings?.backup || remoteConfig?.backup || 'openai',
            keys: {
                // For Gemini, use Remote key if available (managed), otherwise fallback to local/env
                gemini: remoteConfig?.keys?.gemini || localSettings?.keys?.gemini || envKeys.gemini,
                
                // For others, allow local overrides to persist (user might add their own openai key)
                openai: localSettings?.keys?.openai || remoteConfig?.keys?.openai || envKeys.openai,
                deepseek: localSettings?.keys?.deepseek || remoteConfig?.keys?.deepseek || envKeys.deepseek
            }
        };

        // 4. Update State
        setState(prev => ({
            ...prev,
            history: savedHistory,
            vocabulary: savedVocab,
            apiSettings: finalSettings,
            isLoading: false
        }));

        // 5. Start Content Load
        refreshContent(finalSettings);
    };

    initApp();
  }, []);

  const handleSettingsSave = (newSettings: ApiSettings) => {
      setState(prev => ({ ...prev, apiSettings: newSettings }));
      localStorage.setItem('linguist_settings', JSON.stringify(newSettings));
      
      // Refresh data with new settings
      refreshContent(newSettings);

      // Return to home screen to show loading progress
      if (stage !== 'LANG') {
          setStage('LANG');
          setState(prev => ({ ...prev, selectedLanguage: null, currentArticle: null }));
      }
  };

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
        const [details, audioResult] = await Promise.all([
            analyzeWord(word, state.selectedLanguage!, context, state.apiSettings),
            generateSpeech(word, state.selectedLanguage!, state.apiSettings).catch(e => {
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
            audioBase64: audioResult?.audioData,
            audioEncoding: audioResult?.encoding
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
        alert("Failed to analyze word. Please check your API settings or quota.");
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

  const handlePlayAudio = async (base64: string, encoding?: 'pcm' | 'mp3') => {
     try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass({ sampleRate: 24000 });
        const buffer = await decodeAudioData(base64, ctx, encoding);
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
        <div className="p-4 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-20">
            <div className="lg:hidden flex items-center">
                <button 
                    onClick={() => setLeftSidebarOpen(true)} 
                    className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
            </div>
            
            <span className="font-bold text-indigo-600 text-xl absolute left-1/2 -translate-x-1/2 lg:static lg:translate-x-0 lg:ml-4">
                LinguistDaily
            </span>

            <div className="flex items-center gap-2">
                 <button
                    onClick={() => setShowSettings(true)}
                    className="p-2 text-slate-400 hover:text-indigo-600 transition-colors rounded-lg hover:bg-slate-50"
                    title="API Settings"
                 >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                 </button>

                {stage === 'READ' && (
                    <button 
                        onClick={() => setRightSidebarOpen(true)} 
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg lg:hidden"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                    </button>
                )}
            </div>
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

      {/* Modals */}
      {selectedWord && (
          <WordDetailModal 
            item={selectedWord} 
            onClose={() => setSelectedWord(null)} 
            onReview={handleReviewWord}
          />
      )}

      {isFlashcardMode && (
          <FlashcardMode 
             items={flashcardItems}
             onClose={() => setIsFlashcardMode(false)}
             onResult={handleFlashcardResult}
             onPlayAudio={handlePlayAudio}
          />
      )}

      {showSettings && (
          <SettingsModal 
            settings={state.apiSettings}
            onSave={handleSettingsSave}
            onClose={() => setShowSettings(false)}
          />
      )}

    </div>
  );
};

export default App;
