import { expect, test } from "bun:test";

test("manifest.webmanifest declares the required PWA contract", async () => {
  const manifest = JSON.parse(
    await Bun.file(new URL("../public/manifest.webmanifest", import.meta.url)).text(),
  ) as {
    background_color?: string;
    display?: string;
    icons?: Array<{ purpose?: string }>;
    name?: string;
    short_name?: string;
    start_url?: string;
    theme_color?: string;
  };

  expect(manifest.name).toBe("BattleShipArena");
  expect(manifest.short_name).toBe("Arena");
  expect(manifest.start_url).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.background_color).toBeTruthy();
  expect(manifest.theme_color).toBeTruthy();
  expect(Array.isArray(manifest.icons)).toBe(true);
  expect(manifest.icons?.length ?? 0).toBeGreaterThanOrEqual(3);
  expect(manifest.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
});
