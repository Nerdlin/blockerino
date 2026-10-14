import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ptcglecvavdvpxadqfqd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0Y2dsZWN2YXZkdnB4YWRxZnFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDExODAsImV4cCI6MjA5NTcxNzE4MH0.ZL-xsoBqBTbcgZ-ZETyKzFtrJad0QgiSftBuDV5s_fE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
});

async function runBenchmark(name, concurrency, fn) {
    console.log(`\n--- Running test: ${name} (${concurrency} concurrent requests) ---`);
    const start = performance.now();
    const latencies = [];
    let errors = 0;

    const promises = Array.from({ length: concurrency }, async (_, i) => {
        const reqStart = performance.now();
        try {
            await fn(i);
            latencies.push(performance.now() - reqStart);
        } catch (err) {
            errors++;
            latencies.push(performance.now() - reqStart);
        }
    });

    await Promise.all(promises);
    const totalDuration = performance.now() - start;

    latencies.sort((a, b) => a - b);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.50)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const rps = (concurrency / (totalDuration / 1000)).toFixed(1);

    console.log(`Completed in: ${totalDuration.toFixed(1)}ms`);
    console.log(`Throughput:   ${rps} req/sec`);
    console.log(`Errors:       ${errors} / ${concurrency}`);
    console.log(`Latency avg:  ${avg.toFixed(1)}ms | p50: ${p50.toFixed(1)}ms | p95: ${p95.toFixed(1)}ms | p99: ${p99.toFixed(1)}ms`);

    return { name, totalDuration, rps, errors, avg, p50, p95, p99 };
}

async function main() {
    console.log('====================================================');
    console.log(' SUPABASE FREE TIER STRESS & LOAD RESILIENCE AUDIT  ');
    console.log('====================================================');

    // 1. App config update check (simulate 50 players launching app simultaneously)
    await runBenchmark('App Version & Update Check (50 concurrent)', 50, async () => {
        const { data, error } = await supabase
            .from('app_config')
            .select('*')
            .eq('key', 'android_version')
            .single();
        if (error || !data) throw error || new Error('No config');
    });

    // 2. High Scores Classic Leaderboard (simulate 50 players opening Leaderboard simultaneously)
    await runBenchmark('Classic High Scores Leaderboard (50 concurrent)', 50, async () => {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, player_name, avatar_url, created_at, highscore_classic')
            .order('highscore_classic', { ascending: false })
            .limit(50);
        if (error) throw error;
    });

    // 3. Top ELO Leaderboard (simulate 50 players opening 1v1 Leaderboard simultaneously)
    await runBenchmark('Top ELO Leaderboard (50 concurrent)', 50, async () => {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, player_name, avatar_url, elo, updated_at')
            .order('elo', { ascending: false })
            .limit(50);
        if (error) throw error;
    });

    // 4. More Games Ratings Leaderboard (simulate 50 players opening More Games)
    await runBenchmark('More Games Ratings Leaderboard (50 concurrent)', 50, async () => {
        const { data, error } = await supabase
            .from('more_game_ratings')
            .select('*')
            .eq('game_id', 'chess')
            .order('elo', { ascending: false })
            .limit(50);
        if (error) throw error;
    });

    // 5. Heavy burst test: 100 concurrent requests across mixed tables
    await runBenchmark('Heavy Mixed Burst Test (100 concurrent requests)', 100, async (i) => {
        if (i % 3 === 0) {
            const { error } = await supabase.from('app_config').select('value').eq('key', 'android_version').single();
            if (error) throw error;
        } else if (i % 3 === 1) {
            const { error } = await supabase.from('profiles').select('player_name, highscore_classic').order('highscore_classic', { ascending: false }).limit(20);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('profiles').select('player_name, elo').order('elo', { ascending: false }).limit(20);
            if (error) throw error;
        }
    });

    console.log('\n====================================================');
    console.log(' AUDIT FINISHED: All endpoints tested under load');
    console.log('====================================================');
}

main().catch(console.error);
