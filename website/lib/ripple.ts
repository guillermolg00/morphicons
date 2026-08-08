/* Ripple shader adapted from Canvas UI's RippleVanilla.ts (canvasui.dev).
   Upstream license: MIT with Commons Clause; copyright the Canvas UI authors.
   The GLSL shaders are verbatim upstream. This file is NOT part of the
   morphicons library (MIT): it is demo chrome for the showcase map, and the
   upstream notice travels with it.

   What changed from upstream, all on the capture side:
   - `source` is the live WebGL canvas of a Mapbox map instead of a
     `layoutsubtree` canvas; the html-in-canvas branch is removed and
     `uHasContent`/`uMaxX` are pinned to 1 (there is always content).
   - `uploadContent()` re-uploads the source EVERY frame: the map is alive
     underneath, so the texture goes stale the moment it is taken. That is the
     one place this costs more than upstream, and the reason the effect only
     runs while a wave is alive.
   - With no waves left the output clears and `onIdle` fires, so the caller
     can hide the overlay and let the real map show through.
   - Pointer listeners are gone: the overlay must not eat the map's events,
     so `splash()` is the only way in.

   The point of feeding it the map's own canvas: whatever Mapbox drew is what
   gets bent. Streets, labels and the morphing pins all live in that texture,
   so a wave rolling past deforms them together, as one surface. */

export interface RippleOptions {
  /** Height of the waves (0 to 3). */
  amplitude?: number;
  /** How fast the rings travel outward. 1 is normal speed. */
  speed?: number;
  /** Distance between wave crests in CSS pixels. */
  wavelength?: number;
  /** Number of crests in each wave train (1 to 8). */
  rings?: number;
  /** How quickly the waves lose energy (higher dies faster). */
  decay?: number;
  /** How strongly the waves bend the page content, in CSS pixels. */
  refraction?: number;
  /** Chromatic dispersion splitting colors along the wave slopes (0 to 1). */
  dispersion?: number;
  /** Intensity of the light glints on the wave crests (0 to 2). */
  shine?: number;
  /** Seconds between ambient ripples at random positions. 0 disables them. */
  interval?: number;
}

export interface RippleElements {
  /** The canvas whose pixels get bent. Here: the map's own WebGL canvas,
   *  which must be created with `preserveDrawingBuffer: true` or it reads as
   *  blank from another GL context. */
  source: HTMLCanvasElement;
  /** Canvas the WebGL effect renders to. */
  output: HTMLCanvasElement;
  /** Called when the last wave dies and the output has been cleared. */
  onIdle?: () => void;
}

export interface RippleInstance {
  /** Update effect options live. */
  setOptions: (options: RippleOptions) => void;
  /** Spawn a ripple at a position in CSS pixels relative to the element. */
  splash: (x: number, y: number, strength?: number) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<RippleOptions> = {
  amplitude: 0.5,
  speed: 0.65,
  wavelength: 80,
  rings: 2,
  decay: 1,
  refraction: 100,
  dispersion: 0.5,
  shine: 0.5,
  interval: 0,
};

const MAX_RIPPLES = 12;
const BASE_SPEED = 340;

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform vec4 uRipples[12];
uniform int uCount;
uniform float uSpeed;
uniform float uWavelength;
uniform float uWidth;
uniform float uDecay;
uniform float uRefraction;
uniform float uDispersion;
uniform float uShine;
uniform float uHasContent;
uniform float uMaxX;

vec4 page (vec2 p) {
  p.x = clamp(p.x, 0.0005, uMaxX - 0.0005);
  p.y = clamp(p.y, 0.0005, 0.9995);
  return texture(uContent, p);
}

void main () {
  vec2 pUv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 frag = pUv * uResolution;

  vec2 grad = vec2(0.0);
  float k = 6.28318530718 / uWavelength;
  float w2 = uWidth * uWidth;

  for (int i = 0; i < 12; i++) {
    if (i >= uCount) break;
    vec4 rp = uRipples[i];
    vec2 dv = frag - rp.xy;
    float r = length(dv);
    float front = uSpeed * rp.z;
    float s = r - front;
    float env = exp(-s * s / w2) * exp(-uDecay * rp.z) * rp.w;
    env *= smoothstep(0.0, 0.08, rp.z);
    env *= inversesqrt(1.0 + front / max(uWavelength, 1.0) * 0.2);
    if (env < 0.0015) continue;
    float dh = (k * cos(s * k) - 2.0 * s / w2 * sin(s * k)) * env;
    grad += dv / max(r, 1.0) * dh * uWavelength * 0.16;
  }

  float g = dot(grad, vec2(-0.55, -0.8));
  float glint = pow(clamp(g * 2.2, 0.0, 1.0), 2.0) * uShine;
  float shade = pow(clamp(-g * 1.6, 0.0, 1.0), 2.0) * uShine * 0.3;

  if (uHasContent < 0.5) {
    float a = clamp(glint * 0.9 + shade * 0.5, 0.0, 0.85);
    outColor = vec4(vec3(glint * 0.9), a);
    return;
  }

  vec2 offs = grad * uRefraction / uResolution;
  vec3 col;
  if (uDispersion > 0.001) {
    float d = uDispersion * 0.35;
    col = vec3(
      page(pUv + offs * (1.0 + d)).r,
      page(pUv + offs).g,
      page(pUv + offs * (1.0 - d)).b
    );
  } else {
    col = page(pUv + offs).rgb;
  }
  col += glint;
  col *= 1.0 - shade;
  outColor = vec4(col, 1.0);
}`;

export function createRipple(
  elements: RippleElements,
  options: RippleOptions = {},
): RippleInstance | null {
  const config = { ...DEFAULTS, ...options };
  const { source, output, onIdle } = elements;

  const gl = output.getContext("webgl2", {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: true,
  });
  if (!gl || gl.isContextLost()) return null;

  function compile(type: number, text: string): WebGLShader {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, text);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      console.error("Ripple shader error:", gl!.getShaderInfoLog(shader));
    }
    return shader;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, VERT);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  const uniforms: Record<string, WebGLUniformLocation> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i)!;
    uniforms[info.name.replace("[0]", "")] = gl.getUniformLocation(
      program,
      info.name,
    )!;
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const contentTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, contentTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0]),
  );

  function syncCanvasSize() {
    // The output's backing store mirrors the map's, so sampling is 1:1 with
    // no rescale in between.
    const width = Math.max(1, source.width);
    const height = Math.max(1, source.height);
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }
  }

  syncCanvasSize();

  function uploadContent() {
    // Every frame: the map is alive underneath and the texture ages fast.
    syncCanvasSize();
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      source,
    );
  }

  type Wave = { x: number; y: number; age: number; amp: number };
  const ripples: Wave[] = [];
  const rippleData = new Float32Array(MAX_RIPPLES * 4);

  function splash(x: number, y: number, strength = 1) {
    if (reducedMotion) return;
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({ x, y, age: 0, amp: strength });
    start();
  }

  function pruneRipples(delta: number) {
    const diag = Math.hypot(output.clientWidth, output.clientHeight);
    const speedPx = BASE_SPEED * Math.max(config.speed, 0.05);
    const width = config.wavelength * Math.max(config.rings, 1) * 0.5;
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.age += delta;
      const gone =
        rp.age * speedPx > diag + width * 3 ||
        Math.exp(-Math.max(config.decay, 0.05) * rp.age) * rp.amp < 0.012;
      if (gone) ripples.splice(i, 1);
    }
  }

  function render() {
    uploadContent();
    const dpr = output.width / Math.max(output.clientWidth, 1);
    gl!.useProgram(program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.uniform1i(uniforms.uContent, 0);
    gl!.uniform2f(uniforms.uResolution, output.width, output.height);
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const rp = ripples[i];
      rippleData[i * 4] = rp ? rp.x * dpr : 0;
      rippleData[i * 4 + 1] = rp ? rp.y * dpr : 0;
      rippleData[i * 4 + 2] = rp ? rp.age : 0;
      rippleData[i * 4 + 3] = rp ? rp.amp * Math.max(config.amplitude, 0) : 0;
    }
    gl!.uniform4fv(uniforms.uRipples, rippleData);
    gl!.uniform1i(uniforms.uCount, ripples.length);
    gl!.uniform1f(uniforms.uSpeed, BASE_SPEED * Math.max(config.speed, 0.05) * dpr);
    gl!.uniform1f(uniforms.uWavelength, Math.max(config.wavelength, 4) * dpr);
    gl!.uniform1f(
      uniforms.uWidth,
      Math.max(config.wavelength, 4) * Math.max(config.rings, 1) * 0.5 * dpr,
    );
    gl!.uniform1f(uniforms.uDecay, Math.max(config.decay, 0.05));
    gl!.uniform1f(uniforms.uRefraction, Math.max(config.refraction, 0) * dpr);
    gl!.uniform1f(uniforms.uDispersion, Math.max(config.dispersion, 0));
    gl!.uniform1f(uniforms.uShine, Math.max(config.shine, 0));
    gl!.uniform1f(uniforms.uHasContent, 1); // there is always content: the map
    gl!.uniform1f(uniforms.uMaxX, 1);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, output.width, output.height);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }

  /** No waves means nothing to bend: clear the output and tell the caller,
   *  so it can hide the layer and let the real map show through. */
  function renderIdle() {
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, output.width, output.height);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    onIdle?.();
  }

  let raf = 0;
  let lastTime = performance.now();
  let destroyed = false;
  let running = false;
  let visible = true;
  let ambientTimer = 0;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function spawnAmbient() {
    const w = output.clientWidth;
    const h = output.clientHeight;
    if (w < 10 || h < 10) return;
    splash(
      w * (0.15 + Math.random() * 0.7),
      h * (0.15 + Math.random() * 0.7),
      0.6 + Math.random() * 0.5,
    );
  }

  function frame(now: number) {
    if (destroyed) return;
    if (!visible) {
      running = false;
      return;
    }
    const delta = Math.min(Math.max((now - lastTime) / 1000, 0), 1 / 30);
    lastTime = now;
    if (!reducedMotion) {
      pruneRipples(delta);
      if (config.interval > 0) {
        ambientTimer += delta;
        if (ambientTimer >= config.interval) {
          ambientTimer = 0;
          spawnAmbient();
        }
      }
    }
    if (ripples.length > 0) {
      render();
    } else {
      renderIdle();
      if (config.interval <= 0 || reducedMotion) {
        running = false;
        return;
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (destroyed || running || !visible) return;
    running = true;
    lastTime = performance.now();
    raf = requestAnimationFrame(frame);
  }

  start();

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) ripples.length = 0;
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  const observer = new ResizeObserver(() => {
    syncCanvasSize();
    start();
  });
  observer.observe(output);
  observer.observe(source);

  const intersection = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1]?.isIntersecting ?? true;
    if (visible) start();
  });
  intersection.observe(output);

  return {
    setOptions(next) {
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof RippleOptions] !== value,
        )
      )
        return;
      Object.assign(config, next);
      start();
    },
    splash,
    resize() {
      syncCanvasSize();
      start();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      gl!.deleteTexture(contentTexture);
      gl!.deleteProgram(program);
      gl!.deleteShader(vertexShader);
      gl!.deleteShader(fragmentShader);
      gl!.deleteBuffer(quad);
    },
  };
}
