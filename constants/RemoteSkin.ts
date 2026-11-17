import { getShopItem } from "./Shop";

/**
 * A piece skin another player sent in Versus. Only a real piece skin of the catalog is drawn; anything else (an old
 * version that sends nothing, a made-up id) falls back to the classic blocks.
 */
export function remotePieceSkin(value: unknown): string {
	if (typeof value !== "string") return "piece_classic";
	const item = getShopItem(value);
	return item?.category === "piece_skin" ? item.id : "piece_classic";
}
