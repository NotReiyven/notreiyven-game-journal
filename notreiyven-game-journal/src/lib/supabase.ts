
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const apiUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

export const missingConfig = [
  !apiUrl && "VITE_API_BASE_URL",
  !url && "VITE_SUPABASE_URL",
  !key && "VITE_SUPABASE_PUBLISHABLE_KEY",
].filter(Boolean) as string[];

export const supabase = url && key ? createClient(url, key) : null;

export const configReady = missingConfig.length === 0;
