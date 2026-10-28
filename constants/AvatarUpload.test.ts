jest.mock("@/constants/Supabase", () => ({ supabase: {}, updateProfileAvatar: jest.fn() }));
jest.mock("expo-image-manipulator", () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: "jpeg" } }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn() }));

import { AVATAR_SIZE, avatarFolder, centredSquare } from "./AvatarUpload";

describe("avatar upload helpers", () => {
	it("crops the largest centred square", () => {
		expect(centredSquare(400, 400)).toEqual({ originX: 0, originY: 0, width: 400, height: 400 });
		expect(centredSquare(1000, 600)).toEqual({ originX: 200, originY: 0, width: 600, height: 600 });
		expect(centredSquare(600, 1001)).toEqual({ originX: 0, originY: 200, width: 600, height: 600 });
	});

	it("never produces an empty crop", () => {
		expect(centredSquare(0, 0).width).toBe(1);
	});

	it("keeps files in the account's own folder and the picture small", () => {
		expect(avatarFolder("abc-123")).toBe("abc-123");
		expect(AVATAR_SIZE).toBeLessThanOrEqual(512);
	});
});
