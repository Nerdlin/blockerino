import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { supabase, updateProfileAvatar } from "@/constants/Supabase";

const BUCKET = "avatars";
/** Side of the stored picture. Small on purpose: it is only ever shown as a round avatar, and the bucket caps files at 300 KB. */
export const AVATAR_SIZE = 256;

export type AvatarUploadResult = { status: "ok"; url: string } | { status: "cancelled" } | { status: "failed" };

/** Largest centred square of a width x height picture, as a crop rectangle. */
export function centredSquare(width: number, height: number): { originX: number; originY: number; width: number; height: number } {
	const side = Math.max(1, Math.min(width, height));
	return { originX: Math.floor((width - side) / 2), originY: Math.floor((height - side) / 2), width: side, height: side };
}

/** Where a player's files live: one folder per account, which the storage policies enforce. */
export function avatarFolder(userId: string): string {
	return userId;
}

/** Removes every avatar file of the player except `keep` (best effort: a leftover file is harmless, a failure is not worth reporting). */
export async function removeAvatarFiles(userId: string, keep?: string): Promise<void> {
	try {
		const folder = avatarFolder(userId);
		const { data } = await supabase.storage.from(BUCKET).list(folder, { limit: 100 });
		const stale = (data ?? []).map((file) => `${folder}/${file.name}`).filter((path) => path !== keep);
		if (stale.length > 0) await supabase.storage.from(BUCKET).remove(stale);
	} catch {
		// ignored on purpose
	}
}

/**
 * Lets the player choose a picture (the system photo picker, no storage permission is needed), crops it to a centred
 * square, shrinks it to 256x256 JPEG, stores it in the player's own folder and makes it the avatar. The previous
 * picture file is removed afterwards.
 */
export async function pickAndUploadAvatar(userId: string): Promise<AvatarUploadResult> {
	try {
		const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 });
		if (picked.canceled || !picked.assets?.[0]) return { status: "cancelled" };
		const asset = picked.assets[0];

		const actions: ImageManipulator.Action[] = [];
		if (asset.width > 0 && asset.height > 0 && asset.width !== asset.height) actions.push({ crop: centredSquare(asset.width, asset.height) });
		actions.push({ resize: { width: AVATAR_SIZE, height: AVATAR_SIZE } });
		const shrunk = await ImageManipulator.manipulateAsync(asset.uri, actions, { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });

		const body = await (await fetch(shrunk.uri)).arrayBuffer();
		const path = `${avatarFolder(userId)}/avatar-${Date.now()}.jpg`;
		const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: "image/jpeg", upsert: false });
		if (error) return { status: "failed" };

		const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
		if (!(await updateProfileAvatar(userId, url))) return { status: "failed" };
		void removeAvatarFiles(userId, path);
		return { status: "ok", url };
	} catch {
		return { status: "failed" };
	}
}

export type AvatarReportReason = "inappropriate" | "personal" | "other";

/** Complaint about another player's picture. true when the server accepted it. */
export async function reportAvatar(targetUserId: string, reason: AvatarReportReason): Promise<boolean> {
	try {
		const { data, error } = await supabase.rpc("report_avatar", { p_target: targetUserId, p_reason: reason });
		return !error && (data as { status?: string } | null)?.status === "ok";
	} catch {
		return false;
	}
}
