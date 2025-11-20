
import { createClient } from '@supabase/supabase-js';
import { ApiSettings } from '../types';

// Use environment variables for connection
// These should be configured in your deployment environment
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;


// Initialize client if credentials exist
const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

export const fetchSupabaseConfig = async (): Promise<Partial<ApiSettings> | null> => {
    if (!supabase) {
        console.debug("Supabase credentials not found, skipping remote config.");
        return null;
    }
    
    try {
        // Query the 'AIProviders' table based on the provided schema
        // Filtering by appname 'LinguistDaily' and enabled status
        const { data, error } = await supabase
            .from('AIProviders')
            .select('provider, apikey')
            .eq('appname', 'LinguistDaily')
            .eq('enable', true);
            
        if (error) {
            console.warn("Could not fetch API config from Supabase:", error.message);
            return null;
        }

        if (!data || data.length === 0) {
            console.debug("No active API keys found in Supabase for this app.");
            return null;
        }

        const keys: { gemini?: string; openai?: string; deepseek?: string } = {};

        data.forEach((row: { provider: string; apikey: string }) => {
            const provider = row.provider.toLowerCase().trim();
            
            // Map table provider names to app setting keys
            if (provider === 'gemini' || provider === 'google') {
                keys.gemini = row.apikey;
            } else if (provider === 'openai') {
                keys.openai = row.apikey;
            } else if (provider === 'deepseek') {
                keys.deepseek = row.apikey;
            }
        });

        return { keys };
    } catch (e) {
        console.warn("Unexpected error fetching Supabase config", e);
        return null;
    }
};
