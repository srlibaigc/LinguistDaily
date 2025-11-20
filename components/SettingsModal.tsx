
import React, { useState } from 'react';
import { ApiSettings, ApiProvider } from '../types';

interface Props {
  settings: ApiSettings;
  onSave: (newSettings: ApiSettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({ settings, onSave, onClose }) => {
  const [keys, setKeys] = useState(settings.keys);
  const [backup, setBackup] = useState<ApiProvider>(settings.backup);

  const handleSave = () => {
    onSave({
        primary: 'gemini',
        backup,
        keys
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full animate-scale-in overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            API Configuration
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <div className="p-6 space-y-6">
            <p className="text-sm text-slate-500">
                Configure your AI providers. Gemini is used by default. If Gemini quota is exceeded, the system will fall back to your selected backup.
            </p>

            {/* API Keys */}
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Gemini API Key (Primary)</label>
                    <input 
                        type="password" 
                        value={keys.gemini || ''}
                        onChange={e => setKeys({...keys, gemini: e.target.value})}
                        placeholder="Fetched from env if empty"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">OpenAI API Key</label>
                    <input 
                        type="password" 
                        value={keys.openai || ''}
                        onChange={e => setKeys({...keys, openai: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">DeepSeek API Key</label>
                    <input 
                        type="password" 
                        value={keys.deepseek || ''}
                        onChange={e => setKeys({...keys, deepseek: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                </div>
            </div>

            <hr className="border-slate-100" />

            {/* Fallback Selection */}
            <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Backup Provider</label>
                <div className="grid grid-cols-3 gap-3">
                    {(['openai', 'deepseek'] as ApiProvider[]).map(p => (
                        <button
                            key={p}
                            onClick={() => setBackup(p)}
                            className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all
                                ${backup === p 
                                    ? 'bg-indigo-600 text-white border-indigo-600' 
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                }
                            `}
                        >
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            <button 
                onClick={handleSave}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-sm"
            >
                Save Configuration
            </button>
        </div>
      </div>
    </div>
  );
};
