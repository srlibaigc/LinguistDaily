
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Language, Article, ApiSettings, ApiProvider, WordDefinition } from "../types";

// --- Helper: Error Detection ---

export const isQuotaError = (error: any): boolean => {
  const msg = error?.message?.toLowerCase() || '';
  return msg.includes('quota') || msg.includes('429') || msg.includes('resource exhausted') || msg.includes('limit');
};

// --- Helper: Decode Audio ---

/**
 * Decodes audio data based on encoding type.
 * - 'pcm': Decodes Gemini's raw 24kHz mono Int16 PCM.
 * - 'mp3': Decodes standard audio file formats (MP3, WAV) used by OpenAI/others.
 */
export const decodeAudioData = async (
  base64Data: string,
  audioContext: AudioContext,
  encoding: 'pcm' | 'mp3' = 'pcm'
): Promise<AudioBuffer> => {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  if (encoding === 'mp3') {
    // Standard decode for MP3/WAV
    // Note: decodeAudioData detaches the buffer, so we copy it if needed, 
    // but here we just pass the array buffer.
    return await audioContext.decodeAudioData(bytes.buffer);
  } else {
    // Raw PCM to AudioBuffer (assuming 24kHz 1 channel from Gemini TTS)
    const dataInt16 = new Int16Array(bytes.buffer);
    const sampleRate = 24000; 
    const numChannels = 1;
    const frameCount = dataInt16.length / numChannels;
    
    const buffer = audioContext.createBuffer(numChannels, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);
    
    for (let i = 0; i < frameCount; i++) {
      // Convert Int16 to Float32
      channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
  }
};

// --- Providers ---

class GeminiHandler {
    private getKey(settings: ApiSettings) {
        return settings.keys.gemini || process.env.API_KEY;
    }

    async generateSpeech(text: string, language: Language, settings: ApiSettings) {
        const apiKey = this.getKey(settings);
        if (!apiKey) throw new Error("Gemini API Key missing");
        
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });
        const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!audioData) throw new Error("Gemini TTS failed");
        return { audioData, encoding: 'pcm' as const };
    }

    async analyzeWord(word: string, language: Language, context: string, settings: ApiSettings) {
        const apiKey = this.getKey(settings);
        if (!apiKey) throw new Error("Gemini API Key missing");

        const ai = new GoogleGenAI({ apiKey });
        const prompt = `Analyze the word "${word}" in the context of ${language}. 
        Context sentence: "${context || ''}".
        Provide the following details in JSON:
        - phonetic (IPA)
        - pronunciationGuide (Plain text tip)
        - dailyExample (A sentence used in daily life)
        - academicExample (A sentence used in formal/academic writing)
        - definitionCN (Chinese definition)
        - definitionEN (English definition)
        - definitionSource (Definition in ${language})
        `;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        word: { type: Type.STRING },
                        phonetic: { type: Type.STRING },
                        pronunciationGuide: { type: Type.STRING },
                        dailyExample: { type: Type.STRING },
                        academicExample: { type: Type.STRING },
                        definitionCN: { type: Type.STRING },
                        definitionEN: { type: Type.STRING },
                        definitionSource: { type: Type.STRING },
                    },
                    required: ["phonetic", "pronunciationGuide", "dailyExample", "academicExample", "definitionCN", "definitionEN", "definitionSource"]
                }
            }
        });
        if (!response.text) throw new Error("Gemini analysis failed");
        return JSON.parse(response.text);
    }

    async getNews(language: Language, settings: ApiSettings) {
        const apiKey = this.getKey(settings);
        if (!apiKey) throw new Error("Gemini API Key missing");

        const ai = new GoogleGenAI({ apiKey });
        const newsPrompt = `
        Act as a language learning content curator.
        Find the single most significant news story today in ${language} from a major official news outlet.
        Ideally, find a news story that includes an OFFICIAL AUDIO narration or video report.
        Summarize this news event into a high-quality B2-level article (approx 150-200 words).
        
        You MUST return a raw JSON string (do not use markdown code blocks) with this exact structure:
        {
            "title": "The headline in ${language}",
            "content": "The article text...",
            "sourceUrl": "The official URL of the news story found",
            "audioUrl": "The DIRECT link to the audio/video file found. If none, leave empty string."
        }
        `;

        const newsResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: newsPrompt,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });

        let jsonText = newsResponse.text || "{}";
        jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonText);
    }

    async getGeneralArticles(language: Language, settings: ApiSettings) {
        const apiKey = this.getKey(settings);
        if (!apiKey) throw new Error("Gemini API Key missing");
        
        const ai = new GoogleGenAI({ apiKey });
        const generalPrompt = `
        Write 2 distinct, engaging, and educational articles (approx 150 words each) for a student learning ${language}.
        Topics:
        1. A specific cultural tradition or history of a country where ${language} is spoken.
        2. A modern lifestyle trend or technology topic relevant to ${language} speakers.
        
        Return a JSON array of objects with "title" and "content".
        `;

        const generalResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: generalPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            content: { type: Type.STRING }
                        },
                        required: ["title", "content"]
                    }
                }
            }
        });
        return JSON.parse(generalResponse.text || "[]");
    }
}

class OpenAICompatibleHandler {
    private provider: ApiProvider;
    private baseUrl: string;
    private model: string;

    constructor(provider: ApiProvider) {
        this.provider = provider;
        if (provider === 'openai') {
            this.baseUrl = 'https://api.openai.com/v1';
            this.model = 'gpt-4o-mini'; // Efficient model
        } else { // deepseek
            this.baseUrl = 'https://api.deepseek.com';
            this.model = 'deepseek-chat';
        }
    }

    private getKey(settings: ApiSettings) {
        if (this.provider === 'openai') {
            return settings.keys.openai || process.env.OPENAI_API_KEY;
        } else {
            return settings.keys.deepseek || process.env.DEEPSEEK_API_KEY;
        }
    }

    private async fetchChat(prompt: string, settings: ApiSettings, jsonMode: boolean = true) {
        const apiKey = this.getKey(settings);
        if (!apiKey) throw new Error(`${this.provider} API Key missing`);

        const body: any = {
            model: this.model,
            messages: [
                { role: "system", content: "You are a helpful language learning assistant. Always respond in valid JSON when requested." },
                { role: "user", content: prompt }
            ]
        };

        if (jsonMode) {
            body.response_format = { type: "json_object" };
        }

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`${this.provider} API Error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async generateSpeech(text: string, language: Language, settings: ApiSettings) {
        // DeepSeek doesn't support TTS standardly. Fallback to OpenAI if available, else fail.
        if (this.provider === 'deepseek') {
            if (settings.keys.openai || process.env.OPENAI_API_KEY) {
                // Pivot to OpenAI for Audio even if DeepSeek is current text provider
                const oa = new OpenAICompatibleHandler('openai');
                return oa.generateSpeech(text, language, settings);
            }
            throw new Error("DeepSeek does not support TTS and no OpenAI key provided for audio fallback.");
        }

        const apiKey = this.getKey(settings);
        if (!apiKey) throw new Error("OpenAI API Key missing for TTS");

        const response = await fetch(`${this.baseUrl}/audio/speech`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "tts-1",
                voice: "alloy",
                input: text
            })
        });

        if (!response.ok) throw new Error("OpenAI TTS Failed");
        
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        // Convert to base64
        let binary = '';
        const bytes = new Uint8Array(arrayBuffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return { audioData: btoa(binary), encoding: 'mp3' as const };
    }

    async analyzeWord(word: string, language: Language, context: string, settings: ApiSettings) {
        const prompt = `Analyze the word "${word}" in the context of ${language}. 
        Context sentence: "${context || ''}".
        Return a JSON object with these exact keys:
        {
            "word": "${word}",
            "phonetic": "IPA",
            "pronunciationGuide": "pronunciation tip",
            "dailyExample": "daily life sentence",
            "academicExample": "formal sentence",
            "definitionCN": "Chinese definition",
            "definitionEN": "English definition",
            "definitionSource": "Definition in ${language}"
        }`;
        const json = await this.fetchChat(prompt, settings, true);
        return JSON.parse(json);
    }

    async getNews(language: Language, settings: ApiSettings) {
        // Fallback providers usually can't browse the web easily. We simulate "News".
        const prompt = `
        Act as a language learning content curator.
        Write a "Breaking News" style article (approx 150 words) about a recent significant event or a general cultural topic relevant to ${language} speakers.
        Since you may not have real-time internet access, choose a timeless or recently historically significant topic if needed, but present it as a news report.
        
        Return a JSON object:
        {
            "title": "The Headline in ${language}",
            "content": "The article text...",
            "sourceUrl": "", 
            "audioUrl": "" 
        }`;
        const json = await this.fetchChat(prompt, settings, true);
        return JSON.parse(json);
    }

    async getGeneralArticles(language: Language, settings: ApiSettings) {
        const prompt = `
        Write 2 distinct, engaging articles (150 words each) for learning ${language}.
        1. Cultural tradition.
        2. Modern lifestyle/tech.
        
        Return a JSON object with a key "articles" which is an array of objects { "title": "...", "content": "..." }.
        `;
        const json = await this.fetchChat(prompt, settings, true);
        const parsed = JSON.parse(json);
        return parsed.articles || [];
    }
}

// --- Main Service Logic (Fallback Manager) ---

const gemini = new GeminiHandler();
const openai = new OpenAICompatibleHandler('openai');
const deepseek = new OpenAICompatibleHandler('deepseek');

const getHandler = (provider: ApiProvider) => {
    switch (provider) {
        case 'gemini': return gemini;
        case 'openai': return openai;
        case 'deepseek': return deepseek;
        default: return gemini;
    }
};

async function executeWithFallback<T>(
    operation: (handler: any) => Promise<T>,
    settings: ApiSettings,
    description: string
): Promise<T> {
    // 1. Try Primary (Gemini)
    try {
        return await operation(getHandler('gemini'));
    } catch (error: any) {
        const isQuota = isQuotaError(error);
        const backupProvider = settings.backup;
        const hasBackup = backupProvider && backupProvider !== 'gemini';
        
        // Check if we actually have a key for the backup (or it exists in env)
        const backupKey = settings.keys[backupProvider] || 
            (backupProvider === 'openai' ? process.env.OPENAI_API_KEY : process.env.DEEPSEEK_API_KEY);
        
        if (isQuota && hasBackup && backupKey) {
            console.warn(`Gemini Quota Exceeded for ${description}. Switching to ${backupProvider}...`);
            try {
                return await operation(getHandler(backupProvider));
            } catch (backupError) {
                console.error(`Backup (${backupProvider}) failed for ${description}`, backupError);
                throw backupError;
            }
        }
        throw error;
    }
}

// --- Public Methods ---

interface NewsResponse {
    title: string;
    content: string;
    sourceUrl?: string;
    audioUrl?: string;
}

interface ArticleResponse {
    title: string;
    content: string;
}

interface SpeechResult {
    audioData: string;
    encoding: 'pcm' | 'mp3';
}

export const generateSpeech = async (text: string, language: Language, settings: ApiSettings): Promise<SpeechResult> => {
    return executeWithFallback<SpeechResult>(
        h => h.generateSpeech(text, language, settings),
        settings,
        "generateSpeech"
    );
};

export const analyzeWord = async (word: string, language: Language, context: string, settings: ApiSettings): Promise<WordDefinition> => {
    return executeWithFallback<WordDefinition>(
        h => h.analyzeWord(word, language, context, settings),
        settings,
        "analyzeWord"
    );
};

export const preloadLanguageContent = async (language: Language, settings: ApiSettings): Promise<Article[]> => {
    const articles: Article[] = [];

    // 1. Get News
    try {
        const newsData = await executeWithFallback<NewsResponse>(
            h => h.getNews(language, settings),
            settings,
            "getNews"
        );

        if (newsData && newsData.content) {
            let audioResult: SpeechResult | undefined = undefined;
            // Only generate TTS if no official audio URL
            if (!newsData.audioUrl) {
                try {
                    audioResult = await generateSpeech(newsData.content, language, settings);
                } catch (e) {
                    console.warn("TTS generation failed for news", e);
                }
            }

            articles.push({
                id: crypto.randomUUID(),
                date: new Date().toLocaleDateString(),
                title: newsData.title || "Daily News",
                content: newsData.content,
                language: language,
                audioBase64: audioResult?.audioData,
                audioEncoding: audioResult?.encoding,
                audioUrl: newsData.audioUrl,
                sourceUrl: newsData.sourceUrl
            });
        }
    } catch (e) {
        console.error(`Failed to load news for ${language}`, e);
        // IMPORTANT: If it's a quota error, re-throw it so App.tsx can handle it (fetch new keys, etc.)
        if (isQuotaError(e)) throw e;
    }

    // 2. Get General Articles
    try {
        const generalData = await executeWithFallback<ArticleResponse[]>(
            h => h.getGeneralArticles(language, settings),
            settings,
            "getGeneralArticles"
        );
        
        // Generate audio in parallel
        // Note: If using OpenAI fallback, this might be slow/expensive for 2 articles.
        // We process sequentially to be safe with concurrent limits on fallbacks
        for (const a of generalData) {
             let audioResult: SpeechResult | undefined = undefined;
             try {
                 audioResult = await generateSpeech(a.content, language, settings);
             } catch(e) { console.warn("TTS failed for article", e); }

             articles.push({
                id: crypto.randomUUID(),
                date: new Date().toLocaleDateString(),
                title: a.title,
                content: a.content,
                language: language,
                audioBase64: audioResult?.audioData,
                audioEncoding: audioResult?.encoding
            });
        }
    } catch (e) {
         console.error(`Failed to load general articles for ${language}`, e);
         // IMPORTANT: If it's a quota error, re-throw it so App.tsx can handle it
         if (isQuotaError(e)) throw e;
    }

    return articles;
};
