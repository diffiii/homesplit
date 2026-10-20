import { ImageResponse } from "next/og";
import { LOGO_PATH, LOGO_VIEW_BOX } from "@/components/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The home screen icon on iOS, which needs a PNG with its own background. */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: "#ffffff",
      }}
    >
      <svg
        aria-label="HomeSplit"
        height={112}
        role="img"
        viewBox={LOGO_VIEW_BOX}
        width={114}
      >
        <path d={LOGO_PATH} fill="#17181B" fillRule="evenodd" />
      </svg>
    </div>,
    size
  );
}
