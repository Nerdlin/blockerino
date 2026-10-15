// Orders friend-search results: exact name, then names starting with the query, then the rest.
export function rankFriendSuggestions<T extends { player_name: string }>(profiles: T[], query: string): T[] {
    const needle = query.trim().toLowerCase();
    const score = (name: string) => {
        const lower = name.toLowerCase();
        if (lower === needle) return 0;
        if (lower.startsWith(needle)) return 1;
        return 2;
    };
    return [...profiles].sort((a, b) => score(a.player_name) - score(b.player_name) || a.player_name.length - b.player_name.length);
}
