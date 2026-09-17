export interface DemMeta {
  E0: number; N0: number   // LV95 area centre (local frame origin)
  step: number; rows: number; cols: number
  Z0: number               // absolute height at the area centre (local h = 0)
  west?: number; north?: number   // LV95 of sample (0,0) (row 0 = north edge); derived from `half` when missing
  half?: number            // legacy square grids centred on E0/N0
}

export function demOrigin(meta: DemMeta): { west: number; north: number } {
  const half = meta.half ?? 0
  return { west: meta.west ?? meta.E0 - half, north: meta.north ?? meta.N0 + half }
}

/** Bilinear height sampler over a north-up float32 grid. Local frame: x east, y north (metres from the area centre). */
export class HeightField {
  west: number; north: number
  meta: DemMeta; data: Float32Array; coverage?: Uint8Array
  constructor(meta: DemMeta, data: Float32Array, coverage?: Uint8Array) { this.meta=meta;this.data=data;this.coverage=coverage;const o = demOrigin(meta); this.west = o.west; this.north = o.north }

  static async load(base: string, name: string): Promise<HeightField> {
    const [meta, buf] = await Promise.all([
      fetch(`${base}/${name}.json`).then(r => r.json() as Promise<DemMeta>),
      fetch(`${base}/${name}.bin`).then(r => r.arrayBuffer()),
    ])
    return new HeightField(meta, new Float32Array(buf))
  }

  /** extent in local metres: [minX, minY, maxX, maxY] */
  extent(): [number, number, number, number] {
    const { E0, N0, step, rows, cols } = this.meta
    return [this.west - E0, this.north - (rows - 1) * step - N0, this.west + (cols - 1) * step - E0, this.north - N0]
  }

  contains(x: number, y: number, margin = 1): boolean {
    const [x0, y0, x1, y1] = this.extent()
    return x > x0 + margin && x < x1 - margin && y > y0 + margin && y < y1 - margin
  }

  hasCoverage(x:number,y:number):boolean {
    if(!this.coverage)return true
    const c=Math.floor((this.meta.E0+x-this.west)/this.meta.step),r=Math.floor((this.north-this.meta.N0-y)/this.meta.step),i=r*this.meta.cols+c
    return c>=0&&r>=0&&c<this.meta.cols-1&&r<this.meta.rows-1&&[i,i+1,i+this.meta.cols,i+this.meta.cols+1].every(j=>this.coverage![j]===1)
  }
  /** absolute height (m a.s.l.), clamped at the grid edge */
  sampleAbs(x: number, y: number): number {
    const { E0, N0, step, rows, cols } = this.meta
    let c = (E0 + x - this.west) / step
    let r = (this.north - (N0 + y)) / step
    c = Math.min(Math.max(c, 0), cols - 1.001)
    r = Math.min(Math.max(r, 0), rows - 1.001)
    const c0 = Math.floor(c), r0 = Math.floor(r)
    const fc = c - c0, fr = r - r0
    const d = this.data
    const i = r0 * cols + c0
    return d[i] * (1 - fc) * (1 - fr) + d[i + 1] * fc * (1 - fr) + d[i + cols] * (1 - fc) * fr + d[i + cols + 1] * fc * fr
  }
}

/** Ground height relative to Z0, using the core grid inside and the outer ring outside (1 m lower, as in the films). */
export class Terrain {
  core: HeightField; outer: HeightField|null
  constructor(core: HeightField, outer: HeightField | null) {this.core=core;this.outer=outer}
  get Z0() { return this.core.meta.Z0 }
  ground(x: number, y: number): number {
    if (this.core.contains(x, y)) return this.core.sampleAbs(x, y) - this.Z0
    if (this.outer) return this.outer.sampleAbs(x, y) - this.Z0 - 1.0
    return this.core.sampleAbs(x, y) - this.Z0
  }
  /** absolute height (m a.s.l.) */
  groundAbs(x: number, y: number): number { return this.ground(x, y) + this.Z0 }
}
