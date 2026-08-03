import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { LOGO_PATH_D, LOGO_VIEWBOX } from "@/lib/brand";

export const alt = "morphicons — morph any SVG icon into any other";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* Committed TTFs (OFL) so the build never depends on the network. */
async function font(file: string) {
  return readFile(path.join(process.cwd(), "assets/fonts", file));
}

export default async function OpengraphImage() {
  const [semiBold, regular] = await Promise.all([
    font("Geist-SemiBold.ttf"),
    font("Geist-Regular.ttf"),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0a0a0a",
        // Echo of the site's mesh gradient, kept faint so the mark leads.
        backgroundImage:
          "radial-gradient(42% 52% at 18% 20%, rgba(0, 124, 240, 0.28), transparent 70%), " +
          "radial-gradient(38% 48% at 84% 18%, rgba(0, 223, 216, 0.20), transparent 70%), " +
          "radial-gradient(44% 54% at 24% 86%, rgba(121, 40, 202, 0.22), transparent 70%), " +
          "radial-gradient(40% 50% at 82% 82%, rgba(255, 0, 128, 0.16), transparent 70%)",
        fontFamily: "Geist",
      }}
    >
      <svg
        viewBox={LOGO_VIEWBOX}
        width={168}
        height={168}
        fill="#ffffff"
      >
        <path d={LOGO_PATH_D} />
      </svg>
      <div
        style={{
          marginTop: 40,
          fontSize: 76,
          fontWeight: 600,
          letterSpacing: "-0.04em",
          color: "#ffffff",
          lineHeight: 1,
        }}
      >
        morphicons
      </div>
      <div
        style={{
          marginTop: 24,
          fontSize: 32,
          fontWeight: 400,
          color: "#a1a1a1",
          lineHeight: 1.3,
        }}
      >
        Morph any SVG icon into any other.
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 44,
          fontSize: 24,
          fontWeight: 400,
          color: "#7d7d7d",
        }}
      >
        morphicons.com
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Geist", data: semiBold, weight: 600, style: "normal" },
        { name: "Geist", data: regular, weight: 400, style: "normal" },
      ],
    },
  );
}
