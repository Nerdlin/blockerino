import { createPersistedSetting } from "./PersistedSetting";

// "full": every effect of the skins and backgrounds. "light": no trail behind a dragged piece, no idle sparkles, half the
// particles of a burst and still backgrounds, but the burst when a piece lands or a line clears stays.

export type EffectsProfile = "full" | "light";

export const effectsProfileSetting = createPersistedSetting<EffectsProfile>("EFFECTS_PROFILE", "full", (raw) => (raw === "full" || raw === "light" ? raw : null));

export function useEffectsProfile(): EffectsProfile {
	return effectsProfileSetting.use();
}
