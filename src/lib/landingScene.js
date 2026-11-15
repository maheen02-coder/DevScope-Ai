import * as THREE from 'three'

const TAU = Math.PI * 2

const BLUE = new THREE.Color('#59b8ff')
const ELECTRIC = new THREE.Color('#2f8dff')
const VIOLET = new THREE.Color('#8a6cff')
const ICE = new THREE.Color('#c8ecff')
const TEAL = new THREE.Color('#7de3d1')

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* Ashima simplex noise, used for organic plasma and lattice distortion. */
const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`

/* Screen-space ripple: a slow ambient field plus a shockwave on click. */
const RIPPLE_GLSL = /* glsl */ `
vec2 rippleDelta(vec2 ndc, vec2 mouse, float aspect, float time, float pulse) {
  vec2 delta = (ndc - mouse) * vec2(aspect, 1.0);
  float dist = length(delta);
  vec2 dir = delta / max(dist, 1e-4);
  float ambient = sin(dist * 18.0 - time * 1.7) * exp(-dist * 1.9) * 0.0038;
  float radius = pulse * 1.35;
  float shock = sin((dist - radius) * 24.0) * exp(-abs(dist - radius) * 7.0)
    * exp(-pulse * 1.1) * 0.026;
  return dir * (ambient + shock);
}
`

const PARTICLE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
uniform float uAspect;
uniform float uSizeFactor;
uniform float uSizeMax;
uniform vec2 uMouse;
uniform float uPulse;

attribute float aSize;
attribute float aSeed;
attribute vec3 aColor;

varying vec3 vColor;
varying float vFade;
varying float vTwinkle;

${RIPPLE_GLSL}

void main() {
  vec3 pos = position;
  pos.x += sin(uTime * 0.24 + aSeed * 12.0) * 0.05;
  pos.y += cos(uTime * 0.2 + aSeed * 9.0) * 0.06;
  pos.z += sin(uTime * 0.16 + aSeed * 5.0) * 0.05;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / max(clip.w, 1e-4);
  clip.xy += rippleDelta(ndc, uMouse, uAspect, uTime, uPulse) * clip.w;

  gl_Position = clip;
  gl_PointSize = clamp(aSize * uPixelRatio * uSizeFactor / max(-mv.z, 0.1), 1.0, uSizeMax);

  vColor = aColor;
  vFade = smoothstep(-70.0, -8.0, mv.z);
  vTwinkle = 0.65 + 0.35 * sin(uTime * (0.6 + aSeed * 1.6) + aSeed * 40.0);
}
`

const PARTICLE_FRAGMENT = /* glsl */ `
uniform float uOpacity;

varying vec3 vColor;
varying float vFade;
varying float vTwinkle;

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  if (d > 0.5) discard;

  float core = smoothstep(0.24, 0.0, d);
  float halo = smoothstep(0.5, 0.05, d) * 0.8;
  float alpha = (core + halo) * vFade * vTwinkle * uOpacity;

  gl_FragColor = vec4(vColor * (0.9 + core * 1.6), alpha);
  #include <colorspace_fragment>
}
`

const DUST_FRAGMENT = /* glsl */ `
uniform float uOpacity;

varying vec3 vColor;
varying float vFade;
varying float vTwinkle;

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  if (d > 0.5) discard;

  float alpha = smoothstep(0.5, 0.0, d);
  alpha *= alpha * vFade * vTwinkle * uOpacity;

  gl_FragColor = vec4(vColor, alpha);
  #include <colorspace_fragment>
}
`

const LINE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uAspect;
uniform vec2 uMouse;
uniform float uPulse;

attribute float aSeed;
attribute vec3 aColor;

varying vec3 vColor;
varying float vFade;
varying float vPulseGlow;

${RIPPLE_GLSL}

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / max(clip.w, 1e-4);
  clip.xy += rippleDelta(ndc, uMouse, uAspect, uTime, uPulse) * clip.w;

  gl_Position = clip;

  vColor = aColor;
  vPulseGlow = 0.72 + 0.28 * sin(uTime * 0.7 + aSeed * 18.0);
  vFade = smoothstep(-52.0, -8.0, mv.z) * vPulseGlow;
}
`

const LINE_FRAGMENT = /* glsl */ `
uniform float uOpacity;

varying vec3 vColor;
varying float vFade;

void main() {
  gl_FragColor = vec4(vColor * 1.25, vFade * uOpacity);
  #include <colorspace_fragment>
}
`

function createParticleMaterial(
  shared,
  { opacity, sizeFactor, sizeMax, fragment = PARTICLE_FRAGMENT },
) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uMouse: shared.uMouse,
      uPulse: shared.uPulse,
      uAspect: shared.uAspect,
      uPixelRatio: shared.uPixelRatio,
      uOpacity: { value: opacity },
      uSizeFactor: { value: sizeFactor },
      uSizeMax: { value: sizeMax },
    },
    vertexShader: PARTICLE_VERTEX,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

function createLineMaterial(shared, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uMouse: shared.uMouse,
      uPulse: shared.uPulse,
      uAspect: shared.uAspect,
      uOpacity: { value: opacity },
    },
    vertexShader: LINE_VERTEX,
    fragmentShader: LINE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

function createGlowTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
  gradient.addColorStop(0.14, 'rgba(255, 255, 255, 0.65)')
  gradient.addColorStop(0.38, 'rgba(255, 255, 255, 0.18)')
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.04)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function randomDirection(rand) {
  const u = rand() * 2 - 1
  const theta = rand() * TAU
  const r = Math.sqrt(1 - u * u)
  return [Math.cos(theta) * r, u, Math.sin(theta) * r]
}

function buildNetwork(rand, mobile) {
  const count = mobile ? 170 : 280
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const seeds = new Float32Array(count)
  const nodes = []

  for (let i = 0; i < count; i += 1) {
    const band = rand()
    let radius
    if (band < 0.45) radius = 3.0 + rand() * 1.8
    else if (band < 0.8) radius = 5.0 + rand() * 2.2
    else radius = 7.5 + rand() * 3.0

    const [dx, dy, dz] = randomDirection(rand)
    const x = dx * radius
    const y = dy * radius * 0.72
    const z = dz * radius * 0.82
    nodes.push(new THREE.Vector3(x, y, z))

    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z

    const color = new THREE.Color()
    const roll = rand()
    if (roll < 0.68) {
      color.copy(BLUE).lerp(ICE, rand() * 0.55)
    } else if (roll < 0.9) {
      color.copy(BLUE).lerp(VIOLET, 0.35 + rand() * 0.5)
    } else {
      color.copy(TEAL).lerp(ICE, rand() * 0.35)
    }
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b

    const hub = i % 14 === 0
    sizes[i] = hub ? 0.075 + rand() * 0.035 : 0.022 + rand() * 0.032
    seeds[i] = rand()
  }

  const pointGeometry = new THREE.BufferGeometry()
  pointGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  pointGeometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  pointGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  pointGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))

  const edges = []
  const seen = new Set()
  const maxDistance = 3.1

  for (let i = 0; i < count; i += 1) {
    let best = -1
    let second = -1
    let bestDistance = Infinity
    let secondDistance = Infinity

    for (let j = 0; j < count; j += 1) {
      if (i === j) continue
      const distance = nodes[i].distanceTo(nodes[j])
      if (distance > maxDistance) continue
      if (distance < bestDistance) {
        second = best
        secondDistance = bestDistance
        best = j
        bestDistance = distance
      } else if (distance < secondDistance) {
        second = j
        secondDistance = distance
      }
    }

    for (const target of [best, second]) {
      if (target < 0) continue
      const key = i < target ? `${i}:${target}` : `${target}:${i}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push([i, target])
    }
  }

  const linePositions = new Float32Array(edges.length * 6)
  const lineColors = new Float32Array(edges.length * 6)
  const lineSeeds = new Float32Array(edges.length * 2)

  edges.forEach(([a, b], index) => {
    const pa = nodes[a]
    const pb = nodes[b]
    const offset = index * 6
    linePositions[offset] = pa.x
    linePositions[offset + 1] = pa.y
    linePositions[offset + 2] = pa.z
    linePositions[offset + 3] = pb.x
    linePositions[offset + 4] = pb.y
    linePositions[offset + 5] = pb.z

    const color = BLUE.clone()
      .lerp(VIOLET, rand() * 0.4)
      .lerp(ICE, rand() * 0.25)
      .multiplyScalar(0.72)
    lineColors[offset] = color.r
    lineColors[offset + 1] = color.g
    lineColors[offset + 2] = color.b
    lineColors[offset + 3] = color.r
    lineColors[offset + 4] = color.g
    lineColors[offset + 5] = color.b

    lineSeeds[index * 2] = rand()
    lineSeeds[index * 2 + 1] = rand()
  })

  const lineGeometry = new THREE.BufferGeometry()
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
  lineGeometry.setAttribute('aColor', new THREE.BufferAttribute(lineColors, 3))
  lineGeometry.setAttribute('aSeed', new THREE.BufferAttribute(lineSeeds, 1))

  return { nodes, edges, pointGeometry, lineGeometry }
}

function buildCurveLines(rand, nodes, edges) {
  const curves = []
  const positions = []
  const colors = []
  const seeds = []
  const curveCount = Math.min(18, edges.length)

  for (let i = 0; i < curveCount; i += 1) {
    const [a, b] = edges[Math.floor(rand() * edges.length)]
    const start = nodes[a]
    const end = nodes[b]
    const mid = start.clone().add(end).multiplyScalar(0.5)
    const bulge = 1.15 + rand() * 0.65
    mid.normalize().multiplyScalar(mid.length() * bulge)

    const curve = new THREE.CatmullRomCurve3([start, mid, end])
    curves.push(curve)

    const points = curve.getPoints(30)
    const color = BLUE.clone()
      .lerp(VIOLET, rand() * 0.65)
      .multiplyScalar(0.5)

    for (let p = 0; p < points.length - 1; p += 1) {
      const from = points[p]
      const to = points[p + 1]
      positions.push(from.x, from.y, from.z, to.x, to.y, to.z)
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
      seeds.push(rand(), rand())
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1))

  return { curves, geometry }
}

function buildStarField(rand, mobile) {
  const count = mobile ? 520 : 1100
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const seeds = new Float32Array(count)

  for (let i = 0; i < count; i += 1) {
    const [dx, dy, dz] = randomDirection(rand)
    const radius = 22 + rand() * 38
    positions[i * 3] = dx * radius * 1.35
    positions[i * 3 + 1] = dy * radius * 0.85
    positions[i * 3 + 2] = dz * radius - 12

    const color =
      rand() < 0.75 ? ICE.clone().lerp(BLUE, rand() * 0.7) : BLUE.clone().lerp(VIOLET, rand())
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b

    sizes[i] = 0.03 + rand() * 0.07
    seeds[i] = rand()
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))

  return geometry
}

function buildDust(rand, mobile) {
  const count = mobile ? 90 : 160
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const seeds = new Float32Array(count)

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (rand() - 0.5) * 30
    positions[i * 3 + 1] = (rand() - 0.5) * 18
    positions[i * 3 + 2] = 4 + rand() * 9

    const color = rand() < 0.6 ? ICE.clone().lerp(BLUE, rand()) : BLUE.clone().lerp(VIOLET, rand())
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b

    sizes[i] = 0.12 + rand() * 0.48
    seeds[i] = rand()
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))

  return geometry
}

function buildHudRing(rand) {
  const positions = []
  const colors = []
  const seeds = []

  const push = (from, to, color) => {
    positions.push(from.x, from.y, from.z, to.x, to.y, to.z)
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
    seeds.push(rand(), rand())
  }

  const circle = (radius, segments, color) => {
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * TAU
      const b = ((i + 1) / segments) * TAU
      push(
        new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius),
        new THREE.Vector3(Math.cos(b) * radius, 0, Math.sin(b) * radius),
        color,
      )
    }
  }

  circle(4.6, 144, ELECTRIC.clone().multiplyScalar(0.4))
  circle(5.05, 160, BLUE.clone().multiplyScalar(0.18))

  const tickColor = ELECTRIC.clone().multiplyScalar(0.55)
  const accentColor = ICE.clone().multiplyScalar(0.75)
  for (let i = 0; i < 72; i += 1) {
    const angle = (i / 72) * TAU
    const inner = i % 9 === 0 ? 4.72 : 4.9
    push(
      new THREE.Vector3(Math.cos(angle) * inner, 0, Math.sin(angle) * inner),
      new THREE.Vector3(Math.cos(angle) * 5.02, 0, Math.sin(angle) * 5.02),
      i % 9 === 0 ? accentColor : tickColor,
    )
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1))
  return geometry
}

function createCore(shared) {
  const group = new THREE.Group()

  const surfaceMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uMouse: shared.uMouse,
      uColorA: { value: ELECTRIC },
      uColorB: { value: VIOLET },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vLocal;
      varying float vWobble;

      ${NOISE_GLSL}

      void main() {
        vec3 pos = position;
        float wobble = snoise(position * 0.85 + vec3(0.0, uTime * 0.22, 0.0));
        pos += normal * wobble * 0.055;

        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        vLocal = position;
        vWobble = wobble;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uMouse;
      uniform vec3 uColorA;
      uniform vec3 uColorB;

      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vLocal;
      varying float vWobble;

      ${NOISE_GLSL}

      void main() {
        vec3 normal = normalize(vNormal);
        float fresnel = pow(1.0 - clamp(dot(normal, normalize(vViewDir)), 0.0, 1.0), 2.4);

        float veins = smoothstep(0.32, 0.95, snoise(vLocal * 2.35 + vec3(uTime * 0.07, uTime * -0.05, uTime * 0.03)));
        float hotspots = smoothstep(0.58, 1.0, snoise(vLocal * 4.6 + uTime * 0.12));

        vec3 lightDir = normalize(vec3(uMouse.x * 0.9, uMouse.y * 0.65, 1.25));
        float cursorLight = pow(max(dot(normal, lightDir), 0.0), 3.0);

        vec3 color = vec3(0.012, 0.028, 0.058);
        color += uColorA * fresnel * 1.4;
        color += uColorB * veins * 0.55;
        color += vec3(0.6, 0.86, 1.0) * hotspots * 0.2;
        color += uColorA * cursorLight * 0.75;
        color += uColorA * (0.5 + vWobble * 0.5) * 0.07;

        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })

  const surface = new THREE.Mesh(new THREE.SphereGeometry(1.3, 64, 48), surfaceMaterial)
  group.add(surface)

  const shellMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uColorA: { value: ELECTRIC },
      uColorB: { value: VIOLET },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying float vNoise;
      ${NOISE_GLSL}
      void main() {
        vec3 pos = position;
        float n = snoise(position * 1.35 + vec3(0.0, uTime * 0.18, 0.0));
        pos += normal * n * 0.1;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        vNoise = n;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying float vNoise;
      void main() {
        float fresnel = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0), 2.0);
        vec3 color = mix(uColorA, uColorB, smoothstep(-0.7, 0.7, vNoise));
        gl_FragColor = vec4(color * (0.35 + fresnel * 1.6), fresnel * 0.32);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const shell = new THREE.Mesh(new THREE.SphereGeometry(2.05, 48, 36), shellMaterial)
  group.add(shell)

  const latticeGeometry = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(2.55, 2))
  const latticePositions = latticeGeometry.getAttribute('position')
  const latticeColor = new Float32Array(latticePositions.count * 3)
  const latticeSeeds = new Float32Array(latticePositions.count)
  const latticeRandom = mulberry32(90210)
  for (let i = 0; i < latticePositions.count; i += 1) {
    const color = ELECTRIC.clone().lerp(BLUE, latticeRandom() * 0.6)
    latticeColor[i * 3] = color.r
    latticeColor[i * 3 + 1] = color.g
    latticeColor[i * 3 + 2] = color.b
    latticeSeeds[i] = latticeRandom()
  }
  latticeGeometry.setAttribute('aColor', new THREE.BufferAttribute(latticeColor, 3))
  latticeGeometry.setAttribute('aSeed', new THREE.BufferAttribute(latticeSeeds, 1))

  const lattice = new THREE.LineSegments(latticeGeometry, createLineMaterial(shared, 0.52))
  group.add(lattice)

  const nodeGeometry = new THREE.BufferGeometry()
  const nodePositions = latticePositions.array.slice()
  const nodeColors = new Float32Array(latticePositions.count * 3)
  const nodeSizes = new Float32Array(latticePositions.count)
  const nodeSeeds = new Float32Array(latticePositions.count)
  const nodeRandom = mulberry32(1337)
  for (let i = 0; i < latticePositions.count; i += 1) {
    const color =
      i % 5 === 0 ? VIOLET.clone().lerp(ICE, 0.3) : BLUE.clone().lerp(ICE, nodeRandom() * 0.7)
    nodeColors[i * 3] = color.r
    nodeColors[i * 3 + 1] = color.g
    nodeColors[i * 3 + 2] = color.b
    nodeSizes[i] = i % 5 === 0 ? 0.11 : 0.05
    nodeSeeds[i] = nodeRandom()
  }
  nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3))
  nodeGeometry.setAttribute('aColor', new THREE.BufferAttribute(nodeColors, 3))
  nodeGeometry.setAttribute('aSize', new THREE.BufferAttribute(nodeSizes, 1))
  nodeGeometry.setAttribute('aSeed', new THREE.BufferAttribute(nodeSeeds, 1))

  const nodePoints = new THREE.Points(
    nodeGeometry,
    createParticleMaterial(shared, { opacity: 1, sizeFactor: 820, sizeMax: 30 }),
  )
  group.add(nodePoints)

  const ringMaterialA = new THREE.MeshBasicMaterial({
    color: 0x6ab5ff,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.02, 8, 240), ringMaterialA)
  ringA.rotation.set(1.18, 0.22, 0.1)
  group.add(ringA)

  const ringB = new THREE.Mesh(
    new THREE.TorusGeometry(3.95, 0.014, 8, 240),
    new THREE.MeshBasicMaterial({
      color: 0x9a7dff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  ringB.rotation.set(0.92, -0.5, -0.16)
  group.add(ringB)

  const ringC = new THREE.Mesh(
    new THREE.TorusGeometry(5.35, 0.008, 8, 260),
    new THREE.MeshBasicMaterial({
      color: 0x6a9dff,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  ringC.rotation.set(1.32, 0.5, 0.24)
  group.add(ringC)

  const hud = new THREE.LineSegments(buildHudRing(mulberry32(707)), createLineMaterial(shared, 0.5))
  hud.position.y = -2.95
  hud.rotation.x = 0.16
  group.add(hud)

  return { group, surface, shell, lattice, nodePoints, ringA, ringB, ringC, hud }
}

export function createLandingScene(canvas, { reducedMotion = false, onUnavailable } = {}) {
  const isMobile = window.matchMedia('(max-width: 760px)').matches
  const random = mulberry32(20261106)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180)

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setClearColor(0x000000, 0)

  const shared = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uPulse: { value: 10 },
    uAspect: { value: 1 },
    uPixelRatio: { value: 1 },
  }

  const glowTexture = createGlowTexture()

  const world = new THREE.Group()
  scene.add(world)

  const networkGroup = new THREE.Group()
  world.add(networkGroup)

  const network = buildNetwork(random, isMobile)
  const networkPoints = new THREE.Points(
    network.pointGeometry,
    createParticleMaterial(shared, { opacity: 1, sizeFactor: 700, sizeMax: 34 }),
  )
  networkGroup.add(networkPoints)

  const networkLines = new THREE.LineSegments(
    network.lineGeometry,
    createLineMaterial(shared, 0.36),
  )
  networkGroup.add(networkLines)

  const curveLines = buildCurveLines(random, network.nodes, network.edges)
  const arcLines = new THREE.LineSegments(curveLines.geometry, createLineMaterial(shared, 0.26))
  networkGroup.add(arcLines)

  const packetCount = curveLines.curves.length * 3
  const packetPositions = new Float32Array(packetCount * 3)
  const packetColors = new Float32Array(packetCount * 3)
  const packetSizes = new Float32Array(packetCount)
  const packetSeeds = new Float32Array(packetCount)
  const packets = []

  for (let i = 0; i < packetCount; i += 1) {
    const curveIndex = i % curveLines.curves.length
    packets.push({
      curve: curveIndex,
      offset: random(),
      speed: 0.04 + random() * 0.09,
    })
    const color = BLUE.clone()
      .lerp(ICE, 0.55)
      .lerp(VIOLET, random() * 0.25)
    packetColors[i * 3] = color.r
    packetColors[i * 3 + 1] = color.g
    packetColors[i * 3 + 2] = color.b
    packetSizes[i] = 0.045 + random() * 0.035
    packetSeeds[i] = random()
  }

  const packetGeometry = new THREE.BufferGeometry()
  packetGeometry.setAttribute('position', new THREE.BufferAttribute(packetPositions, 3))
  packetGeometry.setAttribute('aColor', new THREE.BufferAttribute(packetColors, 3))
  packetGeometry.setAttribute('aSize', new THREE.BufferAttribute(packetSizes, 1))
  packetGeometry.setAttribute('aSeed', new THREE.BufferAttribute(packetSeeds, 1))
  const packetPoints = new THREE.Points(
    packetGeometry,
    createParticleMaterial(shared, { opacity: 1, sizeFactor: 460, sizeMax: 16 }),
  )
  networkGroup.add(packetPoints)
  const packetPoint = new THREE.Vector3()

  const core = createCore(shared)
  networkGroup.add(core.group)

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0x2f7dff,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  halo.scale.setScalar(13)
  halo.renderOrder = -3
  core.group.add(halo)

  const starGroup = new THREE.Group()
  world.add(starGroup)
  const stars = new THREE.Points(
    buildStarField(random, isMobile),
    createParticleMaterial(shared, { opacity: 0.75, sizeFactor: 680, sizeMax: 6 }),
  )
  starGroup.add(stars)

  const dust = new THREE.Points(
    buildDust(random, isMobile),
    createParticleMaterial(shared, {
      opacity: 0.22,
      sizeFactor: 900,
      sizeMax: 90,
      fragment: DUST_FRAGMENT,
    }),
  )
  dust.renderOrder = 20
  dust.material.depthTest = false
  scene.add(dust)

  const sprites = []
  const glowLayers = [
    { color: 0x2b6cff, x: 1, y: 3, z: -14, scale: 34, opacity: 0.24, speed: 0.11, phase: 0 },
    { color: 0x6a4dff, x: 9, y: -4, z: -11, scale: 26, opacity: 0.18, speed: 0.08, phase: 2.1 },
    { color: 0x1f9fbf, x: -7, y: -5, z: -10, scale: 22, opacity: 0.13, speed: 0.07, phase: 4.4 },
  ]
  for (const layer of glowLayers) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: layer.color,
        transparent: true,
        opacity: layer.opacity,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    sprite.position.set(layer.x, layer.y, layer.z)
    sprite.scale.setScalar(layer.scale)
    sprite.renderOrder = -20
    sprite.userData = layer
    scene.add(sprite)
    sprites.push(sprite)
  }

  const beamMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uColor: { value: new THREE.Color(0x2f6fff) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float edge = smoothstep(0.5, 0.0, abs(vUv.x - 0.5) * 2.0);
        float vertical = smoothstep(0.0, 0.28, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        float flicker = 0.8 + 0.2 * sin(uTime * 0.55);
        gl_FragColor = vec4(uColor, edge * edge * vertical * 0.085 * flicker);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  })
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(15, 52), beamMaterial)
  beam.position.set(4, 1, -17)
  beam.rotation.z = 0.3
  beam.renderOrder = -19
  scene.add(beam)

  const cursorAura = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0x7cc6ff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  cursorAura.scale.setScalar(4.6)
  cursorAura.renderOrder = 30
  scene.add(cursorAura)

  const pointer = { tx: 0, ty: 0, x: 0, y: 0 }
  const scrollState = { target: 0, value: 0 }
  const layoutState = { baseX: 3.4, baseY: 0.5, baseZ: 15, scale: 1 }

  const raycaster = new THREE.Raycaster()
  const pointerNdc = new THREE.Vector2()
  const cursorTarget = new THREE.Vector3()
  const cursorDirection = new THREE.Vector3()

  let raf = 0
  let disposed = false
  let lastFrame = 0
  let elapsed = 0

  function applyLayout() {
    const width = canvas.clientWidth || window.innerWidth
    const height = canvas.clientHeight || window.innerHeight
    const aspect = width / Math.max(height, 1)
    const mobile = width < 760
    const compact = width < 1120

    const ratio = Math.min(window.devicePixelRatio || 1, mobile ? 1.7 : 2)
    renderer.setPixelRatio(ratio)
    renderer.setSize(width, height, false)

    camera.aspect = aspect
    camera.updateProjectionMatrix()

    shared.uAspect.value = aspect
    shared.uPixelRatio.value = ratio

    layoutState.scale = mobile ? 0.72 : compact ? 0.88 : 1
    layoutState.baseX = mobile ? 0 : compact ? 2.6 : 3.4
    layoutState.baseY = mobile ? 2.6 : 0.5
    layoutState.baseZ = mobile ? 17.5 : 15

    networkGroup.scale.setScalar(layoutState.scale)
    networkGroup.position.set(layoutState.baseX, layoutState.baseY, mobile ? -2 : 0)
    core.group.position.set(mobile ? 0 : 4.9, mobile ? 0 : 0.9, mobile ? 0 : -0.6)
    core.group.scale.setScalar(mobile ? 0.9 : 1.12)
    starGroup.position.set(0, 0, mobile ? 0 : -4)

    if (reducedMotion) renderFrame(0, true)
  }

  function onResize() {
    applyLayout()
  }

  function onPointerMove(event) {
    pointer.tx = (event.clientX / Math.max(window.innerWidth, 1)) * 2 - 1
    pointer.ty = -((event.clientY / Math.max(window.innerHeight, 1)) * 2 - 1)
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    shared.uPulse.value = 0
  }

  function onScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight
    scrollState.target = max > 0 ? Math.min(window.scrollY / max, 1) : 0
    if (reducedMotion) renderFrame(0, true)
  }

  function onContextLost(event) {
    event.preventDefault()
    cancelAnimationFrame(raf)
    disposed = true
    onUnavailable?.()
  }

  function renderFrame(dt, staticFrame = false) {
    if (disposed) return

    const time = staticFrame ? 0 : elapsed
    shared.uTime.value = time
    if (!staticFrame) shared.uPulse.value = Math.min(shared.uPulse.value + dt, 10)

    const smoothing = staticFrame ? 1 : 1 - Math.exp(-dt * 3.1)
    pointer.x += (pointer.tx - pointer.x) * smoothing
    pointer.y += (pointer.ty - pointer.y) * smoothing
    scrollState.value +=
      (scrollState.target - scrollState.value) * (staticFrame ? 1 : 1 - Math.exp(-dt * 4))

    const scroll = scrollState.value

    shared.uMouse.value.set(pointer.x, pointer.y)

    world.rotation.y = time * 0.024 + pointer.x * 0.18 + scroll * 0.34
    world.rotation.x = pointer.y * 0.055 - scroll * 0.03
    world.position.y = -scroll * 0.45

    starGroup.rotation.y = pointer.x * 0.05 + time * 0.006
    starGroup.rotation.x = pointer.y * 0.03
    dust.rotation.y = pointer.x * 0.04 + time * 0.004
    dust.position.y = scroll * 0.9

    core.group.rotation.y = -time * 0.09 + pointer.x * 0.22
    core.group.rotation.x = pointer.y * 0.1
    core.ringA.rotation.z = 0.1 + time * 0.06
    core.ringB.rotation.z = -0.16 - time * 0.045
    core.ringC.rotation.z = 0.24 + time * 0.03
    core.hud.rotation.y = time * 0.12
    core.shell.rotation.y = time * 0.05

    networkGroup.rotation.y = time * 0.018 - pointer.x * 0.08
    networkGroup.rotation.x = pointer.y * 0.04

    camera.position.x = pointer.x * 0.6
    camera.position.y = -pointer.y * 0.35 + scroll * 1.55
    camera.position.z = layoutState.baseZ - scroll * 3.6
    camera.lookAt(0, 0.15 + scroll * 0.45, 0)
    camera.updateMatrixWorld()

    pointerNdc.set(pointer.x, pointer.y, 0.35)
    raycaster.setFromCamera(pointerNdc, camera)
    cursorDirection.copy(raycaster.ray.direction)
    if (Math.abs(cursorDirection.z) > 1e-5) {
      const distance = (0.2 - camera.position.z) / cursorDirection.z
      cursorTarget.copy(camera.position).addScaledVector(cursorDirection, distance)
      cursorAura.position.lerp(cursorTarget, staticFrame ? 1 : 0.18)
    }
    cursorAura.material.opacity = 0.16 + Math.sin(time * 0.9) * 0.035

    for (const sprite of sprites) {
      const layer = sprite.userData
      sprite.position.y = layer.y + Math.sin(time * layer.speed + layer.phase) * 0.8
      sprite.position.x = layer.x + Math.cos(time * layer.speed * 0.8 + layer.phase) * 0.5
    }
    beam.material.uniforms.uTime.value = time

    for (let i = 0; i < packets.length; i += 1) {
      const packet = packets[i]
      const curve = curveLines.curves[packet.curve]
      const progress = (packet.offset + time * packet.speed) % 1
      const point = curve.getPoint(progress, packetPoint)
      packetPositions[i * 3] = point.x
      packetPositions[i * 3 + 1] = point.y
      packetPositions[i * 3 + 2] = point.z
    }
    packetGeometry.getAttribute('position').needsUpdate = true

    if (!reducedMotion) {
      // Keep cursor light natural: tiny parallax offset against the mouse.
      cursorAura.scale.setScalar(4.4 + Math.sin(time * 0.8) * 0.25)
    }

    renderer.render(scene, camera)
  }

  function animate() {
    raf = requestAnimationFrame(animate)
    const now = performance.now()
    const dt = Math.min((now - lastFrame) / 1000, 0.05)
    lastFrame = now
    if (document.hidden) return
    elapsed += dt
    renderFrame(dt)
  }

  applyLayout()

  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerdown', onPointerDown, { passive: true })
  canvas.addEventListener('webglcontextlost', onContextLost, { passive: false })

  if (reducedMotion) {
    renderFrame(0, true)
  } else {
    lastFrame = performance.now()
    animate()
  }

  return function dispose() {
    disposed = true
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('webglcontextlost', onContextLost)

    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose()
      const materials = Array.isArray(object.material)
        ? object.material
        : object.material
          ? [object.material]
          : []
      for (const material of materials) {
        if (material.map) material.map.dispose()
        material.dispose()
      }
    })
    glowTexture.dispose()
    renderer.dispose()
  }
}
