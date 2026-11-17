import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { useSetAtom } from "jotai";
import { gameInviteAtom } from "@/constants/GameInvite";
import { parseJoinLink, versusJoinAtom, type JoinTarget } from "@/constants/JoinLink";
import { AppState, MenuStateType, useSetAppState } from "@/hooks/useAppState";

/**
 * Opens the room a shared link points to: the Versus menu for a duel, More Games for a room game. The screen joins the
 * room by itself, as when a friend's invitation is accepted. The app gets the link from the system; the web game
 * reads it from its own address once and removes it.
 */
export default function JoinLinkHost() {
	const url = Linking.useURL();
	const [setAppState] = useSetAppState();
	const setVersusJoin = useSetAtom(versusJoinAtom);
	const setGameInvite = useSetAtom(gameInviteAtom);
	const handled = useRef<string | null>(null);

	useEffect(() => {
		const open = (target: JoinTarget) => {
			if (target.game === "versus") {
				setVersusJoin(target.code);
				setAppState(new AppState(MenuStateType.MULTIPLAYER, new AppState(MenuStateType.MENU)));
			} else {
				setGameInvite({ game: target.game, code: target.code, hostName: "" });
				setAppState(new AppState(MenuStateType.MORE_GAMES, new AppState(MenuStateType.MENU)));
			}
		};

		if (Platform.OS === "web") {
			if (typeof window === "undefined" || handled.current) return;
			handled.current = "web";
			const target = parseJoinLink(window.location.search);
			if (!target) return;
			// the link is used once: a reload must not join again
			const clean = new URL(window.location.href);
			clean.searchParams.delete("join");
			window.history.replaceState(null, "", clean.toString());
			open(target);
			return;
		}

		const target = parseJoinLink(url);
		if (!target || handled.current === url) return;
		handled.current = url;
		open(target);
	}, [url, setAppState, setVersusJoin, setGameInvite]);

	return null;
}
