import { describe, it, expect } from "vitest";
import { extractYouTubeId } from "@/lib/youtube";

describe("extractYouTubeId", () => {
  it("full link", () => expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1")).toBe("dQw4w9WgXcQ"));
  it("short link", () => expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ?si=x")).toBe("dQw4w9WgXcQ"));
  it("invalid", () => expect(extractYouTubeId("https://example.com")).toBeNull());
});
