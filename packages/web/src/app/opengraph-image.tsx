import { ImageResponse } from "next/og";
import { LOGO_PATH, LOGO_VIEW_BOX } from "@/components/logo";

export const alt = "HomeSplit: keep the house even.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The light theme's foreground, muted foreground, and primary.
const INK = "#0a0a0a";
const MUTED = "#737373";
const GREEN = "#007b54";

/**
 * The picture link previews show for every page: the landing page's
 * headline, over the logo's line between two dots.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "72px 80px",
        background: "#ffffff",
        color: INK,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg
          aria-label="HomeSplit"
          height={56}
          role="img"
          viewBox={LOGO_VIEW_BOX}
          width={57}
        >
          <path d={LOGO_PATH} fill={INK} fillRule="evenodd" />
        </svg>
        <span style={{ fontSize: 40 }}>HomeSplit</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <span
          style={{
            fontSize: 112,
            letterSpacing: "-0.045em",
            lineHeight: 1,
          }}
        >
          Keep the house even.
        </span>
        <span style={{ fontSize: 36, color: MUTED }}>
          Shared expenses, chores, and shopping for your household.
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div
          style={{ width: 24, height: 24, borderRadius: 12, background: GREEN }}
        />
        <div style={{ flex: 1, height: 5, background: GREEN }} />
        <div
          style={{ width: 24, height: 24, borderRadius: 12, background: GREEN }}
        />
      </div>
    </div>,
    size
  );
}
