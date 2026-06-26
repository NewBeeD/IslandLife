import type { RNG, RngState } from '@island/shared';

// Deterministic, serializable PRNG (mulberry32). Every stochastic draw in the
// engine goes through this so a (seed, decisions) pair reproduces a world exactly.
// The whole state is a single 32-bit integer, trivially persisted to save.rng_state.
class Mulberry32 implements RNG {
  private s: number;

  constructor(seedOrState: number) {
    this.s = seedOrState | 0;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Box–Muller. Stateless beyond the underlying stream (no cached spare), so the
  // serialized state stays a single integer.
  gaussian(mean: number, sd: number): number {
    let u1 = this.next();
    const u2 = this.next();
    if (u1 < 1e-12) u1 = 1e-12; // avoid log(0)
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + sd * z;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(minInclusive: number, maxInclusive: number): number {
    return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1));
  }

  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)] as T;
  }

  serialize(): RngState {
    return { state: this.s };
  }
}

export function createRng(seed: number, state?: RngState): RNG {
  return new Mulberry32(state ? state.state : seed | 0);
}

export const clamp = (x: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, x));
export const clamp01 = (x: number): number => clamp(x, 0, 1);
