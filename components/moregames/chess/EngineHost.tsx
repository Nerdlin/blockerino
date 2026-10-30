import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { UciEngine } from "@/constants/chess/engine/Uci";

// Runs Stockfish as a separate program and hands out a UCI client. On the web it is a Web Worker; on a phone it is an
// invisible WebView that runs the same worker, so the engine never shares code with the game, only text messages.
// The engine source (about 1 MB) is loaded the first time a chess screen mounts this host.

const EngineContext = createContext<UciEngine | null>(null);

/** The engine, or null while it starts (or where it cannot run): callers fall back to the built-in bot. */
export function useChessEngine(): UciEngine | null {
	return useContext(EngineContext);
}

function engineSource(): string {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return (require("@/constants/chess/engine/stockfishSource") as { STOCKFISH_SOURCE: string }).STOCKFISH_SOURCE;
}

function workerPage(source: string): string {
	// "</" would end the script tag early
	const code = JSON.stringify(source).replace(/<\//g, "<\\/");
	return `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
(function () {
	var post = function (line) { window.ReactNativeWebView.postMessage(String(line)); };
	try {
		var worker = new Worker(URL.createObjectURL(new Blob([${code}], { type: "text/javascript" })));
		worker.onmessage = function (event) { post(event.data); };
		worker.onerror = function (event) { post("error " + (event && event.message)); };
		window.sf = function (command) { worker.postMessage(command); };
		post("host ready");
	} catch (error) {
		post("error " + error);
	}
})();
</script></body></html>`;
}

export function EngineHost({ children }: { children: ReactNode }) {
	const [engine, setEngine] = useState<UciEngine | null>(null);
	const webRef = useRef<WebView>(null);
	const engineRef = useRef<UciEngine | null>(null);
	const html = useMemo(() => (Platform.OS === "web" ? "" : workerPage(engineSource())), []);

	// web: a plain worker
	useEffect(() => {
		if (Platform.OS !== "web" || typeof Worker === "undefined") return;
		let worker: Worker | null = null;
		try {
			worker = new Worker(URL.createObjectURL(new Blob([engineSource()], { type: "text/javascript" })));
			const instance = new UciEngine({ send: (command) => worker?.postMessage(command) });
			worker.onmessage = (event) => instance.onLine(String(event.data));
			instance.start();
			engineRef.current = instance;
			setEngine(instance);
		} catch {
			setEngine(null);
		}
		return () => worker?.terminate();
	}, []);

	const onMessage = (event: WebViewMessageEvent) => {
		const line = event.nativeEvent.data;
		if (line === "host ready") {
			const instance = new UciEngine({ send: (command) => webRef.current?.injectJavaScript(`window.sf(${JSON.stringify(command)});true;`) });
			engineRef.current = instance;
			instance.start();
			setEngine(instance);
			return;
		}
		if (line.startsWith("error ")) {
			engineRef.current = null;
			setEngine(null);
			return;
		}
		engineRef.current?.onLine(line);
	};

	return (
		<EngineContext.Provider value={engine}>
			{children}
			{Platform.OS !== "web" && (
				<View pointerEvents="none" style={{ position: "absolute", width: 1, height: 1, opacity: 0, left: -10, top: -10 }}>
					<WebView
						ref={webRef}
						originWhitelist={["*"]}
						source={{ html, baseUrl: "https://engine.blockerino.local/" }}
						onMessage={onMessage}
						javaScriptEnabled
						style={{ width: 1, height: 1, backgroundColor: "transparent" }}
					/>
				</View>
			)}
		</EngineContext.Provider>
	);
}
