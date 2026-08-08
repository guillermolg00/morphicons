"use client";

import type { Feature, FeatureCollection, Point } from "geojson";
import { Bookmark, CircleCheck, Flag, MapPin } from "lucide";
import mapboxgl, { type GeoJSONSource, type Map as MBMap } from "mapbox-gl";
import type { IconInput } from "morphicons";
import { useEffect, useRef, useState } from "react";
import { type IconSprite, iconSprite } from "@/lib/icon-sprite";
import { createRipple } from "@/lib/ripple";
import "mapbox-gl/dist/mapbox-gl.css";

/* canvasTarget in Mapbox: the icon as the STATE of an interaction.

   A map marker is not an illustration, it is an object with states: you
   place it, it tells you where it is, you point at it, you save it. Each
   step usually swaps the pin's image cold. Here the pin is the SAME object
   changing shape, so the transition tells the story:

     click on the map    → map-pin       placed, looking up the address
     the address arrives → flag          the spot is marked, with its name
     hover               → bookmark      "this can be saved"
     click the pin       → circle-check  saved (and a wave rolls the map)
     click again         → flag          undone

   Everything happens INSIDE the map: the icons are StyleImages Mapbox
   uploads to the GPU, the label is the symbol layer's text-field. Not one
   HTML node floats above. The fit is the StyleImageInterface contract
   (width, height, RGBA data, a per-frame render() that returns true on
   commit). Each pin owns a sprite: a small dedicated 2D canvas the morph
   writes into. The map never receives the morph's context, only its pixels,
   which is what lets the driver's clock and the map's coexist.

   Two things pixels give for free:
   - TINT. canvasTarget fixes color at creation; here render() writes the
     state's RGB over white strokes, leaving the alpha (where the shape
     lives). The color rides along without the morph knowing.
   - REPAINT ON DEMAND. triggerRepaint() is called from onWrite, so the map
     renders only while some morph is in flight. At rest it goes still. */

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

type RGB = [number, number, number];

const SIZE = 64;
const LAYER = "pins";
const SOURCE = "pins";

/* Where a lucide map-pin has its tip, as a fraction of its padded box. The
   same fraction anchors the cursor pin and the map pin, which is what makes
   one appear exactly where the other was. */
const PAD = 3;
const GRID = 24 + PAD * 2;
const TIP_FX = (12 + PAD) / GRID;
const TIP_FY = (21.8 + PAD) / GRID;
const ICON_PX = SIZE / 2; // pixelRatio 2 → 32 CSS px on screen
const TIP_DY = ICON_PX * (1 - TIP_FY);

const CURSOR_SIZE = 30;
const HIT_R = ICON_PX / 2 + 12; // half an icon plus slack: strokes have holes
const HIT_PAD = Math.ceil(HIT_R);

interface StateSpec {
  icon: IconInput;
  rgb: RGB;
}

interface Palette {
  style: string;
  text: string;
  halo: string;
  states: { locating: StateSpec; placed: StateSpec; hover: StateSpec; saved: StateSpec };
}

/* `locating` matches the cursor pin's color on purpose: the map pin is born
   the same frame the cursor pin disappears, and starting from the same color
   is what reads as ONE object being dropped. */
const DARK_PALETTE: Palette = {
  style: "mapbox://styles/mapbox/dark-v11",
  text: "#e8eaed",
  halo: "#0b0d10",
  states: {
    locating: { icon: MapPin, rgb: [255, 255, 255] },
    placed: { icon: Flag, rgb: [88, 166, 255] },
    hover: { icon: Bookmark, rgb: [255, 209, 102] },
    saved: { icon: CircleCheck, rgb: [126, 231, 135] },
  },
};
const LIGHT_PALETTE: Palette = {
  style: "mapbox://styles/mapbox/light-v11",
  text: "#1f2937",
  halo: "#ffffff",
  states: {
    locating: { icon: MapPin, rgb: [23, 23, 23] },
    placed: { icon: Flag, rgb: [0, 112, 243] },
    hover: { icon: Bookmark, rgb: [217, 119, 6] },
    saved: { icon: CircleCheck, rgb: [22, 163, 74] },
  },
};

/* A StyleImage whose source is a morphicons sprite. `data` must be a FULL
   view of its buffer (offset 0, exactly width*height*4): the runtime copies
   `data.buffer` whole, ignoring offset and length. */
class SpriteImage {
  readonly width = SIZE;
  readonly height = SIZE;
  data: Uint8ClampedArray = new Uint8ClampedArray(SIZE * SIZE * 4);

  private map: MBMap | null = null;
  rgb: RGB = [255, 255, 255];
  readonly sprite: IconSprite;

  constructor(icon: IconInput) {
    this.sprite = iconSprite({
      size: SIZE,
      icon,
      color: "#ffffff", // shape in the alpha; render() writes the color
      strokeWidth: 2.2,
      pad: PAD,
      onWrite: () => this.map?.triggerRepaint(),
    });
  }

  onAdd(map: MBMap): void {
    this.map = map;
  }

  onRemove(): void {
    this.map = null;
  }

  setTint(rgb: RGB): void {
    this.rgb = rgb;
    this.sprite.touch();
    this.map?.triggerRepaint();
  }

  render(): boolean {
    if (!this.sprite.consume()) return false; // nothing new: no commit
    const img = this.sprite.ctx.getImageData(0, 0, SIZE, SIZE);
    const [r, g, b] = this.rgb;
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    this.data = d;
    return true;
  }
}

interface Pin {
  id: number;
  imageId: string;
  lngLat: [number, number];
  label: string;
  saved: boolean;
  image: SpriteImage;
}

export default function CanvasMap() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState("Loading the map…");
  const [counts, setCounts] = useState({ saved: 0, total: 0 });

  useEffect(() => {
    const box = boxRef.current;
    if (!box || !TOKEN) return;
    mapboxgl.accessToken = TOKEN;

    const palette = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? DARK_PALETTE
      : LIGHT_PALETTE;
    const STATE = palette.states;

    const pins: Pin[] = [];
    let nextId = 1;
    let hoveredId: number | null = null;
    let dragging = false;

    const collection = (): FeatureCollection<Point> => ({
      type: "FeatureCollection",
      features: pins.map(
        (p): Feature<Point> => ({
          type: "Feature",
          id: p.id,
          properties: { id: p.id, img: p.imageId, label: p.label },
          geometry: { type: "Point", coordinates: p.lngLat },
        }),
      ),
    });

    const sync = () => {
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(collection());
      setCounts({ saved: pins.filter((p) => p.saved).length, total: pins.length });
    };

    /* smooth, not snappy: the morph is not a click acknowledgement, it is
       the story of a state change, and it reads better landing whole. */
    const toState = (pin: Pin, s: StateSpec) => {
      pin.image.setTint(s.rgb);
      pin.image.sprite.morph.morphTo(s.icon, "smooth");
    };

    const map = new mapboxgl.Map({
      container: box,
      style: palette.style,
      center: [-3.7038, 40.4168], // Madrid
      zoom: 13.2,
      // A marketing page must keep scrolling: zoom asks for the modifier key.
      cooperativeGestures: true,
      // Without this the map's canvas reads as blank from the ripple's GL
      // context, and the wave would have nothing to bend.
      preserveDrawingBuffer: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    /* The save wave: the ripple's source is the map's OWN canvas, so streets,
       labels and the other pins bend together, as one surface. The overlay
       only shows while a wave is alive; at rest the real map shows through. */
    const rippleCanvas = document.createElement("canvas");
    Object.assign(rippleCanvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "2",
      opacity: "0",
    } satisfies Partial<CSSStyleDeclaration>);
    map.getContainer().appendChild(rippleCanvas);

    const ripple = createRipple(
      { source: map.getCanvas(), output: rippleCanvas, onIdle: () => (rippleCanvas.style.opacity = "0") },
      // Calibrated by eye, on the soft side: the wave should suggest the map
      // is a surface, not steal the scene from the pin just saved.
      { amplitude: 0.36, speed: 0.8, wavelength: 100, rings: 2, decay: 1.25, refraction: 55, dispersion: 0.2, shine: 0.28, interval: 0 },
    );

    const splashAt = (lngLat: [number, number]) => {
      if (!ripple) return;
      const at = map.project(lngLat);
      rippleCanvas.style.opacity = "1";
      ripple.splash(at.x, at.y, 1);
    };

    /* The cursor IS a pin: over free ground the native cursor hides and this
       sprite's tip marks the exact point. Over an existing pin the roles
       flip: the cursor pin fades, the system pointer says "clickable". */
    const cursorSprite = iconSprite({
      size: CURSOR_SIZE,
      icon: MapPin,
      color: `rgb(${STATE.locating.rgb.join(",")})`,
      strokeWidth: 2.2,
      pad: PAD,
    });
    Object.assign(cursorSprite.canvas.style, {
      position: "absolute",
      top: "0",
      left: "0",
      pointerEvents: "none",
      zIndex: "3",
      opacity: "0",
      filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.7))",
      transition: "opacity 0.15s",
    } satisfies Partial<CSSStyleDeclaration>);
    map.getContainer().appendChild(cursorSprite.canvas);

    const TIP_X = TIP_FX * CURSOR_SIZE;
    const TIP_Y = TIP_FY * CURSOR_SIZE;
    const moveCursorPin = (x: number, y: number) => {
      cursorSprite.canvas.style.transform = `translate(${x - TIP_X}px, ${y - TIP_Y}px)`;
    };
    const showCursorPin = (show: boolean) => {
      cursorSprite.canvas.style.transition = "";
      cursorSprite.canvas.style.opacity = show ? "1" : "0";
    };
    /* On placement it goes out WITHOUT a fade: the map pin is born on that
       exact spot with that exact shape, and a fade would show both at once. */
    const dropCursorPin = () => {
      cursorSprite.canvas.style.transition = "none";
      cursorSprite.canvas.style.opacity = "0";
    };

    /* Two-step hit test: queryRenderedFeatures over a box is only a cheap
       pre-filter (the symbol includes its LABEL, so a long address answers
       from 60 px away); the second step measures the real distance to the
       icon's center. */
    const pinAt = (point: mapboxgl.Point): Pin | null => {
      const hits = map.queryRenderedFeatures(
        [
          [point.x - HIT_PAD, point.y - HIT_PAD],
          [point.x + HIT_PAD, point.y + HIT_PAD],
        ],
        { layers: [LAYER] },
      );
      let best: Pin | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const f of hits) {
        const id = f.properties?.id as number | undefined;
        const pin = pins.find((p) => p.id === id);
        if (!pin) continue;
        const at = map.project(pin.lngLat);
        const cy = at.y + TIP_DY - ICON_PX / 2;
        const d = Math.hypot(at.x - point.x, cy - point.y);
        if (d <= HIT_R && d < bestD) {
          bestD = d;
          best = pin;
        }
      }
      return best;
    };

    map.on("load", () => {
      map.addSource(SOURCE, { type: "geojson", data: collection() });
      map.addLayer({
        id: LAYER,
        type: "symbol",
        source: SOURCE,
        layout: {
          "icon-image": ["get", "img"], // one image per pin: each morphs alone
          "icon-size": 1,
          "icon-anchor": "bottom",
          "icon-offset": [0, TIP_DY], // the TIP marks the spot, not the box
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-field": ["get", "label"],
          "text-size": 12,
          "text-offset": [0, 0.6],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-optional": true,
          "text-max-width": 14,
        },
        paint: {
          "text-color": palette.text,
          "text-halo-color": palette.halo,
          "text-halo-width": 1.4,
        },
      });
      setHint("Click anywhere on the map to drop a pin.");
    });

    /* Reverse geocoding: the address arrives late, and it IS the trigger for
       the map-pin → flag morph. The pin tells you it knows where it is. */
    const locate = async (pin: Pin) => {
      const [lng, lat] = pin.lngLat;
      let label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const url = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&limit=1&language=en&access_token=${TOKEN}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = (await res.json()) as {
            features?: { properties?: { name?: string; full_address?: string } }[];
          };
          const props = json.features?.[0]?.properties;
          label = props?.name || props?.full_address || label;
        }
      } catch {
        // Offline is fine: the pin stays, with its coordinates as the label.
      }
      pin.label = label;
      // If the pointer stayed on it while we looked the address up, go
      // straight to hover: no mouse jiggle required.
      toState(pin, hoveredId === pin.id ? STATE.hover : STATE.placed);
      sync();
    };

    map.on("click", (e) => {
      // One handler for both actions: near a pin it saves, elsewhere it
      // plants. Going through the layer would only hit the exact strokes.
      const hit = pinAt(e.point);
      if (hit) {
        if (!hit.label) return; // still locating
        hit.saved = !hit.saved;
        toState(hit, hit.saved ? STATE.saved : STATE.hover);
        if (hit.saved) splashAt(hit.lngLat); // saving shakes the whole map
        sync();
        return;
      }

      const pin: Pin = {
        id: nextId++,
        imageId: `pin-${nextId}`,
        lngLat: [e.lngLat.lng, e.lngLat.lat],
        label: "",
        saved: false,
        image: new SpriteImage(STATE.locating.icon),
      };
      pin.image.rgb = STATE.locating.rgb;
      pins.push(pin);
      map.addImage(pin.imageId, pin.image, { pixelRatio: 2 });
      sync();
      setHint("Hover the pin, then click it to save.");

      // The handover: the cursor pin goes dark the same frame the map pin is
      // born, in its place, with its shape. The pointer is now on the new
      // pin, so hover belongs to it from here on.
      dropCursorPin();
      hoveredId = pin.id;
      map.getCanvas().style.cursor = "pointer";

      void locate(pin);
    });

    const leave = (id: number) => {
      const pin = pins.find((p) => p.id === id);
      if (pin && !pin.saved && pin.label) toState(pin, STATE.placed);
    };

    map.on("dragstart", () => {
      dragging = true; // while panning, Mapbox's grabbing cursor rules
      showCursorPin(false);
    });
    map.on("dragend", () => {
      dragging = false;
    });

    map.on("mousemove", (e) => {
      if (dragging) return;
      moveCursorPin(e.point.x, e.point.y);
      const hit = pinAt(e.point);

      showCursorPin(!hit);
      map.getCanvas().style.cursor = hit ? "pointer" : "none";

      if (hit?.id === hoveredId) return;
      if (hoveredId !== null) leave(hoveredId);
      hoveredId = hit?.id ?? null;
      if (hit && !hit.saved && hit.label) toState(hit, STATE.hover);
    });

    map.on("mouseout", () => {
      showCursorPin(false);
      map.getCanvas().style.cursor = "";
      if (hoveredId !== null) leave(hoveredId);
      hoveredId = null;
    });

    return () => {
      ripple?.destroy();
      cursorSprite.morph.destroy();
      for (const p of pins) p.image.sprite.morph.destroy();
      map.remove();
      rippleCanvas.remove();
      cursorSprite.canvas.remove();
    };
  }, []);

  if (!TOKEN) {
    return (
      <div className="flex h-[420px] items-center justify-center px-6 text-center sm:h-[520px]">
        <p className="max-w-[46ch] text-sm leading-6 text-mute">
          Set <code className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</code> to
          light this demo up: it drives a Mapbox map whose pins are morphing
          StyleImages.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div ref={boxRef} className="h-[420px] w-full sm:h-[520px]" />
      <p className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-hairline px-5 py-3 text-[13px] text-mute">
        <span>{hint}</span>
        <span className="tabular-nums">
          {counts.saved} saved of {counts.total}
        </span>
      </p>
    </div>
  );
}
