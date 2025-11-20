import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Language, WordDefinition, Article } from "../types";

// Helper to decode base64 to AudioBuffer (for the frontend to play)
export const decodeAudioData = async (
  base64Data: string,
  audioContext: AudioContext
): Promise<AudioBuffer> => {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
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
};

const getClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API_KEY is missing");
    return new GoogleGenAI({ apiKey });
};

export const generateSpeech = async (text: string, language: Language): Promise<string> => {
    const ai = getClient();
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
    if (!audioData) throw new Error("No audio generated");
    return audioData;
};

export const analyzeWord = async (word: string, language: Language, contextSentence?: string): Promise<WordDefinition> => {
    const ai = getClient();
    const prompt = `Analyze the word "${word}" in the context of ${language}. 
    Context sentence: "${contextSentence || ''}".
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

    if (!response.text) throw new Error("Failed to analyze word");
    const data = JSON.parse(response.text);
    return { ...data, word }; // Ensure word is set
};

export const preloadLanguageContent = async (language: Language): Promise<Article[]> => {
    const ai = getClient();
    const articles: Article[] = [];

    // 1. Fetch Top News (Search Grounding)
    // We cannot use responseSchema with googleSearch easily in all contexts, so we parse text.
    try {
        const newsPrompt = `
        Act as a language learning content curator.
        Find the single most significant/viewed news story from today in ${language} from a major official news outlet.
        Summarize this news event into a high-quality B2-level article (approx 150-200 words).
        
        You MUST return a raw JSON string (do not use markdown code blocks) with this exact structure:
        {
            "title": "The headline in ${language}",
            "content": "The article text...",
            "sourceUrl": "The official URL of the news story found"
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
        // Cleanup potential markdown wrapping
        jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const newsData = JSON.parse(jsonText);
        
        if (newsData.content) {
             const newsAudio = await generateSpeech(newsData.content, language);
             articles.push({
                id: crypto.randomUUID(),
                date: new Date().toLocaleDateString(),
                title: newsData.title || "Daily News",
                content: newsData.content,
                language: language,
                audioBase64: newsAudio,
                sourceUrl: newsData.sourceUrl
            });
        }
    } catch (e) {
        console.warn(`Failed to load news for ${language}`, e);
    }

    // 2. Generate 2 General Articles
    try {
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

        const generalData = JSON.parse(generalResponse.text || "[]");
        
        // Generate audio in parallel
        const audioPromises = generalData.map((a: any) => generateSpeech(a.content, language));
        const audioResults = await Promise.all(audioPromises);

        generalData.forEach((a: any, index: number) => {
            articles.push({
                id: crypto.randomUUID(),
                date: new Date().toLocaleDateString(),
                title: a.title,
                content: a.content,
                language: language,
                audioBase64: audioResults[index]
            });
        });

    } catch (e) {
         console.warn(`Failed to load general articles for ${language}`, e);
    }

    return articles;
};