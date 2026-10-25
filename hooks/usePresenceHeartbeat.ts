import { useEffect } from "react";
import { AppState } from "react-native";
import { supabase } from "@/constants/Supabase";
import { touchPresence } from "@/constants/Invites";

const BEAT_MS = 60 * 1000;

/** While the app is open and the player is signed in, tell the server "I am here" once a minute (friends see a green dot). */
export function usePresenceHeartbeat() {
	useEffect(() => {
		let timer: ReturnType<typeof setInterval> | null = null;

		const stop = () => {
			if (timer) clearInterval(timer);
			timer = null;
		};
		const start = () => {
			stop();
			void touchPresence();
			timer = setInterval(() => void touchPresence(), BEAT_MS);
		};

		if (AppState.currentState === "active") start();
		const appStateSub = AppState.addEventListener("change", (state) => {
			if (state === "active") start();
			else stop();
		});
		const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
			if (event === "SIGNED_IN" && AppState.currentState === "active") start();
		});

		return () => {
			stop();
			appStateSub.remove();
			authSub.subscription.unsubscribe();
		};
	}, []);
}
