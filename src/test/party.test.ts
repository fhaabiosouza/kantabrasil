import { describe, expect, it } from "vitest";
import { FREE_PLAY_LIMIT, guestSongSchema } from "@/lib/party";

describe("guest song form", () => {
  it("requires the singer name", () => {
    expect(guestSongSchema.safeParse({ singer_name: " ", youtube_url: "https://youtu.be/dQw4w9WgXcQ", instagram_handle: "" }).success).toBe(false);
  });
  it("requires a valid YouTube link", () => {
    expect(guestSongSchema.safeParse({ singer_name: "Ana", youtube_url: "https://example.com", instagram_handle: "" }).success).toBe(false);
  });
  it("instagram is optional and @ is stripped", () => {
    const a = guestSongSchema.parse({ singer_name: "Ana", youtube_url: "https://youtu.be/dQw4w9WgXcQ", instagram_handle: "" });
    expect(a.instagram_handle).toBeNull();
    const b = guestSongSchema.parse({ singer_name: "Ana", youtube_url: "https://youtu.be/dQw4w9WgXcQ", instagram_handle: "@ana.canta" });
    expect(b.instagram_handle).toBe("ana.canta");
  });
  it("free plan allows 3 songs", () => {
    expect(FREE_PLAY_LIMIT).toBe(3);
  });
});
