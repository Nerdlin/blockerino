// Discord supplies these parameters to Activities on desktop and mobile.
export function isDiscordActivityLocation(hostname: string, search: string): boolean {
  return /(?:^|\.)discordsays\.com$/i.test(hostname) ||
    (new URLSearchParams(search).has('frame_id') && new URLSearchParams(search).has('instance_id'));
}

/** True when this very page runs inside a Discord Activity (web only; native and tests have no browser location). */
export function isDiscordActivityRuntime(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.location && isDiscordActivityLocation(window.location.hostname, window.location.search);
  } catch {
    return false;
  }
}

export async function withDiscordTimeout<T>(operation: Promise<T>, milliseconds = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Discord connection timed out. Please reopen the Activity.')), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
