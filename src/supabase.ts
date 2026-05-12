import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kbojrwzvwpgqpdtmgavk.supabase.co'; // paste yours
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtib2pyd3p2d3BncXBkdG1nYXZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1OTM2MTAsImV4cCI6MjA5NDE2OTYxMH0.jOAxoi9NqR3mUmjSP0rW8CJ7btRnF1vRNErmmvECQSs'; // paste yours

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);