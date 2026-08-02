import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://wddkaxdspxgaafuajpms.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkZGtheGRzcHhnYWFmdWFqcG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2Mzk1MTEsImV4cCI6MjEwMTIxNTUxMX0.tQFnpuFetO2EPNKexL57TC-LV642_7xXPkDvIv1rAqk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
