import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Language, WordDefinition } from "../types";

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
  // Note: Gemini TTS usually returns raw PCM. We need to wrap it manually if it's raw,
  // but the guidelines imply raw PCM handling. 
  // However, standard decoding usually requires a WAV header or raw data ingestion.
  // The guide example manually converts Int16 PCM to Float32 for buffer.
  
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

export const generateTopics = async (language: Language): Promise<string[]> => {
    const ai = getClient();
    const prompt = `Generate 3 distinct, engaging, and educational news topics or article themes suitable for a language learner studying ${language}. 
    The topics should be culturally relevant to the language. 
    Return strictly a JSON array of strings.`;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            }
        }
    });

    if (!response.text) return ["Culture and Traditions", "Modern Technology", "Travel Guide"];
    return JSON.parse(response.text);
};

export const generateArticle = async (topic: string, language: Language): Promise<{ title: string; content: string }> => {
    const ai = getClient();
    const prompt = `Write a high-quality, B2/C1 level news article or report about "${topic}" in ${language}. 
    The content should be educational, approximately 300 words.
    Return a JSON object with "title" and "content". The content should be plain text with paragraphs.`;

    const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview", // Using a smarter model for better writing
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    content: { type: Type.STRING }
                },
                required: ["title", "content"]
            }
        }
    });

    if (!response.text) throw new Error("Failed to generate article");
    return JSON.parse(response.text);
};

export const generateSpeech = async (text: string, language: Language): Promise<string> => {
    const ai = getClient();
    // Map languages to suitable voices if possible, otherwise default to standard
    // Current preview TTS voices: 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
    // We will use 'Kore' as a standard high-quality voice.
    
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
