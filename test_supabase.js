const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ptcglecvavdvpxadqfqd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0Y2dsZWN2YXZkdnB4YWRxZnFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDExODAsImV4cCI6MjA5NTcxNzE4MH0.ZL-xsoBqBTbcgZ-ZETyKzFtrJad0QgiSftBuDV5s_fE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

(async () => {
    console.log("Fetching scores...");
    let { data, error } = await supabase.from('high_scores').select('*');
    console.log("Current scores:", data);
    if (error) console.error("Fetch error:", error);
    
    console.log("Inserting test score...");
    const { error: insertError } = await supabase.from('high_scores').insert([
        { player_name: 'Test', score: 100, game_mode: 'classic' }
    ]);
    
    if (insertError) {
        console.error("Insert error:", insertError);
    } else {
        console.log("Insert successful!");
    }
})();
