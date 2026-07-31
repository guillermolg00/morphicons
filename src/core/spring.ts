/* Spring: damped harmonic oscillator over the progress x: 0 → 1,
   ẍ = k·(1−x) − c·ẋ, integrated with semi-implicit Euler at 1/240 s substeps
   (stable up to ω·h ≈ 2; with k=420, ω≈20.5 — ample margin). Interruptible:
   start() resets x to 0 while preserving velocity (clamped to ±14). */

export class Spring {
  x = 1;
  v = 0;
  k = 250;
  c = 24;

  config(k: number, c: number): void {
    this.k = k;
    this.c = c;
  }

  /** Starts (or restarts mid-flight) preserving velocity. */
  start(): void {
    this.x = 0;
    if (this.v > 14) this.v = 14;
    if (this.v < -14) this.v = -14;
  }

  /** Advances dt seconds. Returns true on settle (|1−x| < 0.001 ∧ |v| < 0.02). */
  step(dt: number): boolean {
    const h = 1 / 240;
    const steps = Math.max(1, Math.min(16, Math.ceil(dt / h)));
    const s = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = this.k * (1 - this.x) - this.c * this.v;
      this.v += a * s;
      this.x += this.v * s;
    }
    return Math.abs(1 - this.x) < 0.001 && Math.abs(this.v) < 0.02;
  }
}

/** Spring presets (ζ = c/(2√k)) with the API's public names. */
export const SPRING_PRESETS = {
  /** ζ = 1.00 — critically damped, no overshoot. */
  smooth: { k: 170, c: 26 },
  /** ζ = 0.73 — fast, subtle overshoot. */
  snappy: { k: 420, c: 30 },
  /** ζ = 0.40 — playful. */
  bouncy: { k: 300, c: 14 },
} as const;

export type SpringPreset = keyof typeof SPRING_PRESETS;
