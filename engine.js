/* The Wood Wide Web — 3D engine (three.js)
 *
 * Renders the meshes exported by build_wood_wide_web_blender.py (scene_3d_data.js) the way
 * Blender/EEVEE renders them, so the web matches renders/*.png:
 *   • Blender material colors are linear → used as linear MeshStandardMaterial colors
 *   • AgX view transform + "Medium High Contrast" look, calibrated against the Blender renders
 *   • Blender's own light rig (sun, area fills, point lights) converted with matching units
 *   • soft shadows from the key light
 * On top of that it drives the day ↔ night timeline: sky, sun, moon, stars, fireflies and
 * bioluminescence all follow one clock (nightMix 0 → 1).
 *
 * Exposes window.createForestEngine(opts) → Promise<engine API>. Loaded as a classic script;
 * three.js is pulled in with dynamic import() through the import map in index.html.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Blender parity
  // ---------------------------------------------------------------------------

  // AgX look fitted to Blender 5.1 "AgX - Medium High Contrast" (world day/night + sun disc pixels).
  const LOOK = { exposure: 0.6, contrast: 1.25, pivot: 0.475, saturation: 1.05 };

  // EEVEE occludes world light and shadows its point lights; three.js does neither, so those two
  // contributions are scaled down to land on the renders' values (see renders/overview_*_3d.png).
  const CALIBRATION = { ambient: 0.8, ambientGround: 0.4, points: 0.55 };

  // Mirrors section 10 of build_wood_wide_web_blender.py. Newer exports carry `lights` + `world`
  // in scene_3d_data.js and those win; this keeps older exports rendering identically.
  const FALLBACK_RIG = {
    world: { day: [0.048, 0.24, 0.46], night: [0.014, 0.022, 0.082], strength: 1.0 },
    day: [
      { type: 'SUN', name: 'SunKey', energy: 5.5, color: [1.0, 0.86, 0.5], location: [4.8, -5.5, 9.0], rotation: [0.66, 0.28, 0.46] },
      { type: 'AREA', name: 'FillDay', energy: 165, size: 9.0, color: [0.32, 0.72, 0.98], location: [-3.0, -8.5, 2.5], rotation: [1.25, 0.0, -0.35] },
      { type: 'AREA', name: 'UnderDay', energy: 145, size: 6.5, color: [1.0, 0.82, 0.54], location: [0.0, -6.5, -1.6], rotation: [1.52, 0.0, 0.0] },
      { type: 'POINT', name: 'DappleA', energy: 52, color: [1.0, 0.82, 0.3], location: [-1.35, -0.35, 0.62] },
      { type: 'POINT', name: 'DappleB', energy: 52, color: [1.0, 0.82, 0.3], location: [0.55, 0.25, 0.65] }
    ],
    night: [
      { type: 'SUN', name: 'MoonKey', energy: 1.55, color: [0.28, 0.48, 1.0], location: [-4.2, -5.0, 8.5], rotation: [0.64, -0.26, -0.4] },
      { type: 'AREA', name: 'FillNight', energy: 80, size: 9.5, color: [0.16, 0.28, 0.84], location: [0.0, -8.5, 1.2], rotation: [1.38, 0.0, 0.0] },
      { type: 'AREA', name: 'UnderNight', energy: 68, size: 6.5, color: [0.85, 0.56, 0.3], location: [0.0, -6.5, -1.6], rotation: [1.52, 0.0, 0.0] },
      { type: 'POINT', name: 'NightPineEmerald', energy: 56, color: [0.12, 1.0, 0.58], location: [-2.05, 0.35, 1.15] },
      { type: 'POINT', name: 'NightMushAmberL', energy: 50, color: [1.0, 0.58, 0.12], location: [-1.05, -0.78, 0.48] },
      { type: 'POINT', name: 'NightMushAmberR', energy: 50, color: [1.0, 0.62, 0.14], location: [0.95, 0.48, 0.52] },
      { type: 'POINT', name: 'NightGhostViolet', energy: 42, color: [0.82, 0.34, 1.0], location: [3.12, -0.65, 0.62] },
      { type: 'POINT', name: 'NightWebGlowL', energy: 48, color: [0.48, 1.0, 0.2], location: [-1.45, -0.35, -1.65] },
      { type: 'POINT', name: 'NightWebGlowR', energy: 48, color: [0.2, 0.96, 0.62], location: [1.45, -0.35, -1.65] }
    ]
  };

  // Principled roughness per material (older exports don't carry it in meta).
  const ROUGHNESS = {
    MossFloor: 0.82, LushGrass: 0.7, TopsoilRim: 0.88, CutawayEarthShell: 0.95, SoilCutaway: 0.95,
    DeepBedrock: 0.92, SurfaceBoulder: 0.74, BoulderMossCap: 0.78, AncientRuneStone: 0.78,
    AncientRuneGlow: 0.2, RockPocket: 0.8, MineralCrystal: 0.14, FirBark: 0.85, FirNeedlesDeep: 0.7,
    FirNeedlesMid: 0.68, FirNeedlesCrown: 0.66, SaplingNeedles: 0.66, BirchBark: 0.55,
    BirchLeavesDeep: 0.68, BirchLeavesJade: 0.66, BirchLeavesLime: 0.64, WoodyRootMain: 0.74,
    WoodyRootWire: 0.68, MyceliumGlow: 0.28, MyceliumAquaGlow: 0.28, HandshakeHalo: 0.22,
    MushroomStem: 0.6, MushroomGoldCap: 0.42, MushroomRedCap: 0.42, MushroomSpot: 0.55,
    SpiritFlowerCyan: 0.3, WildflowerCoral: 0.45, GhostPipe: 0.28
  };

  // Blender-only helpers; the sky shader draws the sun, moon and stars instead.
  const SKIP_ROLES = new Set(['celestial_sun', 'celestial_sun_halo', 'celestial_moon', 'night_stars', 'night_sky', 'preview_only']);

  const b2gl = (p) => [p[0], p[2], -p[1]];

  // Direction a Blender light shines toward (its local -Z) for an XYZ Euler, in web axes.
  function blenderLightDir(rot) {
    const [ax, ay, az] = rot;
    let x = 0;
    let y = Math.sin(ax);
    let z = -Math.cos(ax);
    const x1 = x * Math.cos(ay) + z * Math.sin(ay);
    z = -x * Math.sin(ay) + z * Math.cos(ay);
    x = x1;
    const x2 = x * Math.cos(az) - y * Math.sin(az);
    y = x * Math.sin(az) + y * Math.cos(az);
    return b2gl([x2, y, z]);
  }

  // Replaces three's no-op CustomToneMapping with AgX + Blender's log-space look.
  function installBlenderAgX(THREE) {
    const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
    const stub = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
    if (!chunk.includes(stub)) return false;
    const f = (v) => v.toFixed(4);
    const agx = `
      vec3 wwwAgxSigmoid( vec3 x ) {
        vec3 x2 = x * x;
        vec3 x4 = x2 * x2;
        return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
      }
      vec3 CustomToneMapping( vec3 color ) {
        const mat3 toRec2020 = mat3( vec3( 0.6274, 0.0691, 0.0164 ), vec3( 0.3293, 0.9195, 0.0880 ), vec3( 0.0433, 0.0113, 0.8956 ) );
        const mat3 toSrgb = mat3( vec3( 1.6605, -0.1246, -0.0182 ), vec3( -0.5876, 1.1329, -0.1006 ), vec3( -0.0728, -0.0083, 1.1187 ) );
        const mat3 inset = mat3(
          vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
          vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
          vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 ) );
        const mat3 outset = mat3(
          vec3( 1.1271005818144368, -0.1413297634984383, -0.14132976349843826 ),
          vec3( -0.11060664309660323, 1.157823702216272, -0.11060664309660294 ),
          vec3( -0.016493938717834573, -0.016493938717834257, 1.2519364065950405 ) );
        color = toRec2020 * color;
        color *= toneMappingExposure;
        color = inset * color;
        color = max( color, 1e-10 );
        color = ( log2( color ) + 12.47393 ) / 16.499999;
        color = clamp( color, 0.0, 1.0 );
        // Blender look: contrast around a pivot + saturation, in AgX log space
        color = ( color - ${f(LOOK.pivot)} ) * ${f(LOOK.contrast)} + ${f(LOOK.pivot)};
        float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
        color = clamp( l + ( color - l ) * ${f(LOOK.saturation)}, 0.0, 1.0 );
        color = wwwAgxSigmoid( color );
        color = outset * color;
        color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
        color = toSrgb * color;
        return clamp( color, 0.0, 1.0 );
      }`;
    THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(stub, agx);
    return true;
  }

  // ---------------------------------------------------------------------------
  // 2. Day ↔ night timeline. Every value is keyed on nightMix (0 = noon, 1 = midnight).
  //    ~0.30 golden hour · ~0.48 sunset · ~0.62 blue hour · ~0.8 moonrise
  // ---------------------------------------------------------------------------
  const TIMELINE = {
    // Sky dome (linear radiance). The day values sit around Blender's world color.
    zenith: [[0, [0.022, 0.14, 0.38]], [0.3, [0.03, 0.1, 0.27]], [0.48, [0.035, 0.05, 0.16]], [0.62, [0.012, 0.018, 0.07]], [0.8, [0.008, 0.013, 0.055]], [1, [0.007, 0.012, 0.05]]],
    horizon: [[0, [0.07, 0.29, 0.52]], [0.3, [0.22, 0.25, 0.34]], [0.48, [0.24, 0.12, 0.18]], [0.62, [0.05, 0.045, 0.12]], [0.8, [0.022, 0.036, 0.105]], [1, [0.02, 0.036, 0.11]]],
    warm: [[0, [0.16, 0.38, 0.55]], [0.3, [0.9, 0.5, 0.24]], [0.48, [1.1, 0.3, 0.08]], [0.58, [0.42, 0.1, 0.06]], [0.7, [0.06, 0.04, 0.1]], [1, [0.03, 0.05, 0.12]]],
    ground: [[0, [0.046, 0.23, 0.44]], [0.3, [0.06, 0.13, 0.23]], [0.48, [0.07, 0.045, 0.09]], [0.62, [0.018, 0.02, 0.06]], [1, [0.013, 0.021, 0.078]]],
    cloud: [[0, [0.5, 0.66, 0.82]], [0.3, [0.9, 0.58, 0.42]], [0.48, [0.85, 0.3, 0.2]], [0.62, [0.09, 0.07, 0.15]], [1, [0.03, 0.045, 0.11]]],
    warmth: [[0, 0.12], [0.3, 0.75], [0.48, 1.0], [0.6, 0.55], [0.75, 0.08], [1, 0.04]],

    // Sun & moon as seen in the sky (deg). Azimuth is measured from "behind the diorama" toward +x.
    sunVisAz: [[0, 10], [0.3, 11.5], [0.5, 13], [0.62, 14]],
    sunVisEl: [[0, 6.5], [0.3, 3.5], [0.5, -0.2], [0.62, -4]],
    sunSize: [[0, 1.5], [0.5, 2.0]],
    sunDisc: [[0, [5.2, 4.1, 1.6]], [0.3, [6.0, 3.5, 1.1]], [0.5, [6.5, 1.9, 0.4]]],
    sunGlow: [[0, 0.55], [0.3, 1.0], [0.48, 1.7], [0.6, 0.4], [0.7, 0]],
    moonVisAz: [[0.5, -16], [0.75, -8], [1, -4]],
    moonVisEl: [[0.5, -3], [0.75, 3.5], [1, 6.5]],

    // Key light: Blender sun → setting sun → rising moon → Blender moon (deg, from-direction).
    // Azimuth here is measured from +z (camera side) toward +x.
    sunEl: [[0, 49.4], [0.25, 30], [0.42, 10], [0.53, -1]],
    sunAz: [[0, 45.9], [0.25, 66], [0.42, 86], [0.53, 96]],
    sunI: [[0, 1], [0.25, 0.95], [0.4, 0.7], [0.5, 0.15], [0.54, 0]],
    sunCol: [[0, [1.0, 0.86, 0.5]], [0.25, [1.0, 0.64, 0.3]], [0.42, [1.0, 0.42, 0.15]], [0.52, [1.0, 0.3, 0.12]]],
    moonEl: [[0.56, -2], [0.76, 24], [1, 50.8]],
    moonAz: [[0.56, -100], [0.76, -68], [1, -41.9]],
    moonI: [[0.56, 0], [0.74, 0.45], [1, 1]],

    // World ambient (hemisphere) — Blender world at both ends
    world: [[0, [0.048, 0.24, 0.46]], [0.3, [0.085, 0.13, 0.22]], [0.48, [0.1, 0.075, 0.12]], [0.62, [0.035, 0.04, 0.11]], [1, [0.014, 0.022, 0.082]]],

    // Rig weights
    dayFill: [[0, 1], [0.3, 0.5], [0.5, 0.22], [0.66, 0]],
    fillTint: [[0, [0.32, 0.72, 0.98]], [0.32, [0.55, 0.55, 0.85]], [0.5, [0.78, 0.44, 0.66]]],
    nightFill: [[0.4, 0], [0.62, 0.55], [1, 1]],
    dapple: [[0, 1], [0.28, 0.6], [0.45, 0]],

    // Effects
    stars: [[0.55, 0], [0.75, 0.65], [1, 1]],
    fireflies: [[0.5, 0], [0.82, 1]],
    spores: [[0, 0.75], [0.3, 1], [0.48, 0]],
    beams: [[0, 0.5], [0.3, 1.0], [0.45, 0.22], [0.52, 0]],
    bio: [[0, 1], [0.45, 1.05], [0.72, 1.5], [1, 1.65]],
    mycelium: [[0, 1], [0.6, 1.08], [1, 1.25]]
  };

  // Uniform Catmull-Rom through keyframes. Arrays are interpolated per component.
  function sample(keys, m) {
    const n = keys.length;
    if (m <= keys[0][0]) return keys[0][1];
    if (m >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 1;
    while (m > keys[i][0]) i++;
    const t0 = keys[i - 1][0];
    const t1 = keys[i][0];
    const u = (m - t0) / (t1 - t0);
    const p0 = keys[Math.max(0, i - 2)][1];
    const p1 = keys[i - 1][1];
    const p2 = keys[i][1];
    const p3 = keys[Math.min(n - 1, i + 1)][1];
    const cr = (a, b, c, d) => {
      const u2 = u * u;
      const u3 = u2 * u;
      return 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
    };
    if (Array.isArray(p1)) return p1.map((_, k) => cr(p0[k], p1[k], p2[k], p3[k]));
    return cr(p0, p1, p2, p3);
  }

  const sampleN = (keys, m) => Math.max(0, sample(keys, m));
  const sampleC = (keys, m) => sample(keys, m).map((v) => Math.max(0, v));
  const smoothstep = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const NIGHT_WARP = [[0, 0], [0.18, 0.2], [0.5, 0.45], [0.82, 0.72], [1, 1]];
  const easeInOutQuint = (u) => (u < 0.5 ? 16 * u ** 5 : 1 - Math.pow(-2 * u + 2, 5) / 2);
  const DEG = Math.PI / 180;

  // ---------------------------------------------------------------------------
  // 3. Shaders
  // ---------------------------------------------------------------------------
  const SKY_VS = /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      gl_Position = p.xyww;
    }
  `;

  const SKY_FS = /* glsl */ `
    uniform vec3 uZenith, uHorizon, uWarm, uGround, uCloud;
    uniform vec3 uSunDir, uSunDisc, uMoonDir, uWarmDir;
    uniform float uSunSize, uSunGlow, uMoonAlpha, uStars, uWarmth, uTime;
    varying vec3 vDir;

    float hash12( vec2 p ) {
      vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
      p3 += dot( p3, p3.yzx + 33.33 );
      return fract( ( p3.x + p3.y ) * p3.z );
    }
    vec2 hash22( vec2 p ) {
      vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
      p3 += dot( p3, p3.yzx + 33.33 );
      return fract( ( p3.xx + p3.yz ) * p3.zy );
    }
    float vnoise( vec2 p ) {
      vec2 i = floor( p ), f = fract( p );
      vec2 u = f * f * ( 3.0 - 2.0 * f );
      return mix( mix( hash12( i ), hash12( i + vec2( 1, 0 ) ), u.x ), mix( hash12( i + vec2( 0, 1 ) ), hash12( i + vec2( 1, 1 ) ), u.x ), u.y );
    }
    float fbm( vec2 p ) {
      float a = 0.5, s = 0.0;
      for ( int i = 0; i < 4; i++ ) { s += a * vnoise( p ); p = p * 2.03 + 17.1; a *= 0.5; }
      return s;
    }
    // Distant conifer ridge: rolling hills + irregular, jittered tree crowns
    float ridge( float az, float scale, float seed, float h, float amp ) {
      float base = h + amp * 0.55 * fbm( vec2( az * 1.4 + seed, seed ) );
      float x = az * scale;
      float cell = floor( x );
      float r = hash12( vec2( cell, seed ) );
      float r2 = hash12( vec2( cell, seed + 3.7 ) );
      float c = fract( x ) - 0.5 - ( r2 - 0.5 ) * 0.45;
      float crown = max( 0.0, 0.5 - abs( c ) * ( 1.5 + 1.2 * r ) ) * amp * ( 0.5 + 1.5 * r );
      return base + crown * step( 0.18, r );
    }

    void main() {
      vec3 d = normalize( vDir );
      float el = d.y;
      float az = atan( d.x, -d.z );

      // 1. Gradient: ground haze → horizon → zenith
      vec3 col = mix( uHorizon, uZenith, pow( smoothstep( 0.0, 0.62, el ), 0.7 ) );
      vec2 dh = normalize( d.xz + vec2( 1e-5 ) );
      vec2 wh = normalize( uWarmDir.xz + vec2( 1e-5 ) );
      float side = 0.5 + 0.5 * dot( dh, wh );
      float band = exp( -max( el, 0.0 ) * 7.0 );
      col = mix( col, uWarm, band * pow( side, 2.4 ) * uWarmth );
      col = mix( col, uGround, smoothstep( 0.0, -0.22, el ) );

      // 2. Painterly cloud wisps along the horizon
      vec2 cuv = vec2( az * 2.6 + uTime * 0.004, el * 9.0 );
      float c = fbm( cuv + vec2( 0.0, fbm( cuv * 0.7 ) * 1.6 ) );
      float cloudMask = smoothstep( 0.52, 0.78, c ) * smoothstep( 0.02, 0.09, el ) * ( 1.0 - smoothstep( 0.2, 0.42, el ) );
      float sunLit = pow( max( dot( d, uSunDir ), 0.0 ), 6.0 );
      vec3 cloudCol = uCloud * ( 0.8 + 0.6 * sunLit );
      col = mix( col, cloudCol, cloudMask * 0.55 );

      // 3. Stars (behind clouds, above the ridge)
      float starVis = uStars * smoothstep( 0.015, 0.12, el ) * ( 1.0 - cloudMask );
      if ( starVis > 0.001 ) {
        vec2 suv = vec2( az, el ) * 70.0;
        vec2 cell = floor( suv );
        float h = hash12( cell );
        if ( h > 0.9 ) {
          vec2 pos = hash22( cell ) * 0.7 + 0.15;
          float dist = length( fract( suv ) - pos );
          float size = mix( 0.035, 0.11, pow( ( h - 0.9 ) / 0.1, 2.0 ) );
          float tw = 0.55 + 0.45 * sin( uTime * ( 1.2 + h * 4.0 ) + h * 40.0 );
          float s = smoothstep( size, 0.0, dist ) * tw;
          if ( h > 0.985 ) {
            vec2 q = abs( fract( suv ) - pos );
            s += ( max( 0.0, 1.0 - q.x * 9.0 ) * max( 0.0, 1.0 - q.y * 55.0 ) + max( 0.0, 1.0 - q.y * 9.0 ) * max( 0.0, 1.0 - q.x * 55.0 ) ) * 0.6 * tw;
          }
          vec3 sc = mix( vec3( 0.8, 0.88, 1.0 ), vec3( 1.0, 0.92, 0.78 ), hash12( cell + 7.0 ) );
          col += sc * s * 4.0 * starVis;
        }
      }

      // 4. Sun: disc sinks behind the ridge; glow lingers
      float sunAng = acos( clamp( dot( d, uSunDir ), -1.0, 1.0 ) );
      float disc = 1.0 - smoothstep( uSunSize * 0.82, uSunSize, sunAng );
      float glow = exp( -sunAng * 10.0 ) * 0.7 + exp( -sunAng * 3.0 ) * 0.22;
      col += uSunDisc * disc;
      col += uSunDisc * 0.16 * glow * uSunGlow;

      // 5. Crescent moon with halo
      if ( uMoonAlpha > 0.001 ) {
        vec3 mz = uMoonDir;
        vec3 mx = normalize( cross( vec3( 0.0, 1.0, 0.0 ), mz ) );
        vec3 my = cross( mz, mx );
        float facing = dot( d, mz );
        vec2 mp = vec2( dot( d, mx ), dot( d, my ) ) / 0.03;
        float disk = ( 1.0 - smoothstep( 0.9, 1.0, length( mp ) ) ) * step( 0.0, facing );
        float bite = 1.0 - smoothstep( 0.86, 0.98, length( mp - vec2( -0.46, 0.22 ) ) );
        float crescent = disk * ( 1.0 - bite );
        float mAng = acos( clamp( facing, -1.0, 1.0 ) );
        float halo = exp( -mAng * 14.0 ) * 0.5 + exp( -mAng * 4.0 ) * 0.12;
        col += vec3( 0.96, 0.94, 0.82 ) * crescent * 4.2 * uMoonAlpha;
        col += vec3( 0.32, 0.46, 0.9 ) * halo * uMoonAlpha;
      }

      // 6. Two misty treelines on the horizon (the sun sets behind them)
      float far = ridge( az, 52.0, 3.1, 0.004, 0.034 );
      float near = ridge( az, 31.0, 9.7, -0.016, 0.05 );
      vec3 farCol = mix( uHorizon, uGround, 0.25 ) * 0.9 + uWarm * 0.08 * uWarmth * pow( side, 3.0 );
      vec3 nearCol = mix( uGround, uHorizon, 0.15 ) * 0.74;
      col = mix( col, farCol, smoothstep( far + 0.003, far - 0.003, el ) * 0.85 );
      float inNear = smoothstep( near + 0.002, near - 0.002, el );
      col = mix( col, mix( nearCol, uGround, smoothstep( -0.03, -0.22, el ) ), inNear );

      gl_FragColor = vec4( col, 1.0 );
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;

  // Fireflies (night) and drifting spores/dust motes (day) — soft additive points
  const MOTE_VS = /* glsl */ `
    attribute vec4 aSeed; // phase, speed, tint, size
    uniform float uTime, uScale, uDrift;
    varying float vBlink, vTint;
    void main() {
      float t = uTime * aSeed.y + aSeed.x;
      vec3 p = position;
      if ( uDrift > 0.5 ) {
        p.y += mod( uTime * aSeed.y * 0.16 + aSeed.x, 2.6 );
        p.x += sin( t * 0.7 ) * 0.22;
        p.z += cos( t * 0.5 ) * 0.18;
        vBlink = smoothstep( 0.0, 0.5, mod( uTime * aSeed.y * 0.16 + aSeed.x, 2.6 ) ) * ( 1.0 - smoothstep( 2.0, 2.6, mod( uTime * aSeed.y * 0.16 + aSeed.x, 2.6 ) ) );
      } else {
        p += vec3( sin( t ) * 0.3, cos( t * 1.3 ) * 0.18, sin( t * 0.8 + 1.2 ) * 0.3 );
        vBlink = 0.3 + 0.7 * pow( 0.5 + 0.5 * sin( t * 2.4 ), 2.0 );
      }
      vTint = aSeed.z;
      vec4 mv = modelViewMatrix * vec4( p, 1.0 );
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSeed.w * uScale / -mv.z;
    }
  `;

  const MOTE_FS = /* glsl */ `
    uniform vec3 uColA, uColB;
    uniform float uAlpha, uGain;
    varying float vBlink, vTint;
    void main() {
      float r = length( gl_PointCoord - 0.5 ) * 2.0;
      float a = ( exp( -r * r * 9.0 ) + exp( -r * r * 2.5 ) * 0.35 ) * ( 1.0 - smoothstep( 0.75, 1.0, r ) );
      vec3 c = mix( uColA, uColB, vTint );
      gl_FragColor = vec4( c * a * vBlink * uAlpha * uGain, 1.0 );
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;

  // Volumetric-looking god rays: fade at the silhouette edges, the ground and the top
  const BEAM_VS = /* glsl */ `
    varying vec3 vN, vW;
    void main() {
      vec4 w = modelMatrix * vec4( position, 1.0 );
      vW = w.xyz;
      vN = normalize( mat3( modelMatrix ) * normal );
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `;

  const BEAM_FS = /* glsl */ `
    uniform vec3 uColor;
    uniform float uAlpha;
    varying vec3 vN, vW;
    void main() {
      vec3 V = normalize( cameraPosition - vW );
      float edge = pow( abs( dot( normalize( vN ), V ) ), 2.2 );
      float fade = smoothstep( 0.0, 1.1, vW.y ) * ( 1.0 - smoothstep( 2.8, 4.3, vW.y ) );
      gl_FragColor = vec4( uColor * edge * fade * uAlpha, 1.0 );
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;

  // ---------------------------------------------------------------------------
  // 4. Engine
  // ---------------------------------------------------------------------------
  window.createForestEngine = async function createForestEngine(opts) {
    const { canvas, sceneData } = opts;
    let reducedMotion = !!opts.reducedMotion;
    if (!sceneData || !sceneData.batches) throw new Error('scene_3d_data.js did not load');

    const THREE = await import('three');
    const { RectAreaLightUniformsLib } = await import('three/addons/lights/RectAreaLightUniformsLib.js');
    RectAreaLightUniformsLib.init();
    const customAgX = installBlenderAgX(THREE);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = customAgX ? THREE.CustomToneMapping : THREE.AgXToneMapping;
    renderer.toneMappingExposure = LOOK.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1.6, 0.1, 140);
    const lin = (rgb) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);
    const setLin = (color, rgb, k = 1) => color.setRGB(rgb[0] * k, rgb[1] * k, rgb[2] * k, THREE.LinearSRGBColorSpace);
    const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

    // --- Geometry & materials from the Blender export -------------------------
    const inv = 1 / (sceneData.posScale || 2000);
    const byRole = {};
    let soilGlass = null;
    let beamMat = null;

    for (const b of sceneData.batches) {
      const meta = b.meta;
      const role = meta.role;
      if (SKIP_ROLES.has(role)) continue;

      const pBin = atob(b.posB64);
      const pBytes = new Uint8Array(pBin.length);
      for (let i = 0; i < pBin.length; i++) pBytes[i] = pBin.charCodeAt(i);
      const nBin = atob(b.nrmB64);
      const nBytes = new Uint8Array(nBin.length);
      for (let i = 0; i < nBin.length; i++) nBytes[i] = nBin.charCodeAt(i);
      const i16 = new Int16Array(pBytes.buffer);
      const pos = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) pos[i] = i16[i] * inv;

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(nBytes.buffer), 3, true));
      geo.computeBoundingSphere();

      let mat;
      if (role === 'day_sunbeam') {
        beamMat = beamMat || new THREE.ShaderMaterial({
          vertexShader: BEAM_VS,
          fragmentShader: BEAM_FS,
          uniforms: { uColor: { value: lin([1.0, 0.84, 0.5]) }, uAlpha: { value: 0 } },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide
        });
        mat = beamMat;
      } else {
        mat = new THREE.MeshStandardMaterial({
          color: lin(meta.color),
          roughness: meta.roughness ?? ROUGHNESS[b.material] ?? 0.7,
          metalness: 0,
          emissive: lin(meta.emission || [0, 0, 0]),
          emissiveIntensity: meta.emissionStrength || 0,
          side: role === 'cutaway_shell' ? THREE.FrontSide : THREE.DoubleSide
        });
        if (role === 'soil_glass') {
          mat.transparent = true;
          mat.depthWrite = false;
          mat.opacity = 0.06;
          soilGlass = mat;
        }
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = b.material;
      const solid = !mat.transparent && role !== 'cutaway_shell';
      mesh.castShadow = solid;
      mesh.receiveShadow = role !== 'day_sunbeam';
      if (role === 'day_sunbeam') mesh.renderOrder = 5;
      scene.add(mesh);

      if (mat.isMeshStandardMaterial) {
        (byRole[role] = byRole[role] || []).push({
          mat,
          name: b.material,
          base: mat.emissive.clone(),
          strength: mat.emissiveIntensity
        });
      }
    }

    // --- Blender light rig -----------------------------------------------------
    const rig = sceneData.lights && sceneData.lights.day ? { ...sceneData.lights, world: sceneData.world || FALLBACK_RIG.world } : FALLBACK_RIG;
    const sunDef = rig.day.find((l) => l.type === 'SUN');
    const moonDef = rig.night.find((l) => l.type === 'SUN');
    const dirToAzEl = (dir) => ({ el: Math.asin(-dir[1]) / DEG, az: Math.atan2(-dir[0], -dir[2]) / DEG });
    const sunFrom = sunDef ? dirToAzEl(blenderLightDir(sunDef.rotation)) : { el: 49.4, az: 45.9 };
    const moonFrom = moonDef ? dirToAzEl(blenderLightDir(moonDef.rotation)) : { el: 50.8, az: -41.9 };
    TIMELINE.sunEl[0][1] = sunFrom.el;
    TIMELINE.sunAz[0][1] = sunFrom.az;
    TIMELINE.moonEl[TIMELINE.moonEl.length - 1][1] = moonFrom.el;
    TIMELINE.moonAz[TIMELINE.moonAz.length - 1][1] = moonFrom.az;
    const sunEnergy = sunDef ? sunDef.energy : 5.5;
    const moonEnergy = moonDef ? moonDef.energy : 1.55;
    const moonColor = moonDef ? moonDef.color : [0.28, 0.48, 1.0];

    // One shadow-casting key light that is the sun by day and the moon by night
    const key = new THREE.DirectionalLight(0xffffff, sunEnergy);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 6; sc.far = 32;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.025;
    key.target.position.set(0, 0.3, 0);
    scene.add(key, key.target);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, Math.PI * CALIBRATION.ambient);
    scene.add(hemi);

    // Area lights: day/night pairs that share a transform become one light that cross-fades.
    const sameXform = (a, b) => a.location.every((v, i) => Math.abs(v - b.location[i]) < 1e-3) && a.rotation.every((v, i) => Math.abs(v - b.rotation[i]) < 1e-3) && a.size === b.size;
    const areaDefs = [];
    const nightAreas = rig.night.filter((l) => l.type === 'AREA');
    for (const d of rig.day.filter((l) => l.type === 'AREA')) {
      const twin = nightAreas.find((n) => sameXform(d, n));
      if (twin) nightAreas.splice(nightAreas.indexOf(twin), 1);
      areaDefs.push({ day: d, night: twin || null, def: d });
    }
    for (const n of nightAreas) areaDefs.push({ day: null, night: n, def: n });
    const skyFill = areaDefs.find((a) => a.day && !a.night);
    if (skyFill) TIMELINE.fillTint[0][1] = skyFill.day.color; // noon tint = Blender's fill color

    const areas = areaDefs.map((a) => {
      const size = a.def.size || 1;
      const light = new THREE.RectAreaLight(0xffffff, 0, size, size);
      const p = b2gl(a.def.location);
      const dir = blenderLightDir(a.def.rotation);
      light.position.set(p[0], p[1], p[2]);
      light.lookAt(p[0] + dir[0], p[1] + dir[1], p[2] + dir[2]);
      scene.add(light);
      return { ...a, light, area: size * size };
    });

    const points = [];
    rig.day.filter((l) => l.type === 'POINT').forEach((d) => points.push({ def: d, night: false }));
    rig.night.filter((l) => l.type === 'POINT').forEach((d, i) => points.push({ def: d, night: true, order: i }));
    for (const p of points) {
      p.light = new THREE.PointLight(lin(p.def.color), 0, 0, 2);
      p.light.position.copy(v3(b2gl(p.def.location)));
      scene.add(p.light);
    }

    // --- Glow halos: fake bloom around bioluminescent spots ------------------
    const haloTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
      grd.addColorStop(0.6, 'rgba(255,255,255,0.1)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.NoColorSpace;
      return t;
    })();
    const halos = points.filter((p) => p.night).map((p) => {
      const mat = new THREE.SpriteMaterial({ map: haloTex, color: lin(p.def.color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
      const s = new THREE.Sprite(mat);
      s.position.copy(p.light.position);
      const under = p.light.position.y < -0.5;
      s.scale.setScalar(under ? 3.4 : 1.7);
      s.renderOrder = 6;
      scene.add(s);
      return { sprite: s, point: p, gain: under ? 0.16 : 0.24 };
    });

    // --- Sky dome -------------------------------------------------------------
    const skyU = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uWarm: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() }, uCloud: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunDisc: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uWarmDir: { value: new THREE.Vector3(1, 0, 0) },
      uSunSize: { value: 0.026 }, uSunGlow: { value: 1 }, uMoonAlpha: { value: 0 }, uStars: { value: 0 }, uWarmth: { value: 0 }, uTime: { value: 0 }
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(60, 48, 32),
      new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: skyU, side: THREE.BackSide, depthWrite: false, depthTest: false })
    );
    sky.renderOrder = -1000;
    sky.frustumCulled = false;
    scene.add(sky);

    // --- Motes: fireflies + day spores ----------------------------------------
    function makeMotes(count, spread, seedFn, colA, colB, drift) {
      const g = new THREE.BufferGeometry();
      const p = new Float32Array(count * 3);
      const s = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        const r = seedFn(i);
        p.set(r.pos, i * 3);
        s.set(r.seed, i * 4);
      }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(s, 4));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), spread);
      const m = new THREE.ShaderMaterial({
        vertexShader: MOTE_VS,
        fragmentShader: MOTE_FS,
        uniforms: {
          uTime: { value: 0 }, uScale: { value: 300 }, uDrift: { value: drift ? 1 : 0 },
          uColA: { value: lin(colA) }, uColB: { value: lin(colB) }, uAlpha: { value: 0 }, uGain: { value: drift ? 0.9 : 5.0 }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const pts = new THREE.Points(g, m);
      pts.renderOrder = 7;
      scene.add(pts);
      return m;
    }
    const fract = (x) => x - Math.floor(x);
    const fireflyMat = makeMotes(40, 6, (i) => ({
      pos: [-3.6 + fract(i * 0.618) * 7.2, 0.25 + fract(i * 0.4142) * 2.3, -2.0 + fract(i * 0.7071) * 3.9],
      seed: [i * 1.37, 0.45 + (i % 5) * 0.12, i % 3 === 0 ? 1 : 0, 0.07 + (i % 4) * 0.018]
    }), [0.6, 1.0, 0.25], [1.0, 0.72, 0.2], false);
    const sporeMat = makeMotes(46, 6, (i) => ({
      pos: [-3.2 + fract(i * 0.381) * 6.4, -0.1 + fract(i * 0.5772) * 1.2, -1.8 + fract(i * 0.8862) * 3.8],
      seed: [fract(i * 0.271) * 2.6, 0.5 + fract(i * 0.193) * 0.8, fract(i * 0.33), 0.028 + fract(i * 0.77) * 0.022]
    }), [1.0, 0.86, 0.55], [0.75, 0.95, 0.6], true);

    // --- Nutrient particles along exported routes -----------------------------
    const routes = sceneData.routes || {};
    const anchors = sceneData.anchors || {};
    const particleKinds = {
      sugar: { geo: new THREE.SphereGeometry(1, 14, 10), color: [1.0, 0.72, 0.1], emissive: [1.0, 0.6, 0.06], strength: 1.6, scale: 0.07 },
      mineral: { geo: new THREE.OctahedronGeometry(1, 0), color: [0.1, 0.72, 1.0], emissive: [0.06, 0.6, 1.0], strength: 1.6, scale: 0.08 },
      siphon: { geo: new THREE.SphereGeometry(1, 14, 10), color: [0.9, 0.42, 1.0], emissive: [0.78, 0.3, 1.0], strength: 1.6, scale: 0.075 },
      alarm: { geo: new THREE.OctahedronGeometry(1, 0), color: [1.0, 0.42, 0.1], emissive: [1.0, 0.36, 0.06], strength: 3.0, scale: 0.18 }
    };
    for (const k of Object.keys(particleKinds)) {
      const pk = particleKinds[k];
      const mat = new THREE.MeshStandardMaterial({ color: lin(pk.color), emissive: lin(pk.emissive), emissiveIntensity: pk.strength, roughness: 0.3 });
      pk.mesh = new THREE.InstancedMesh(pk.geo, mat, 24);
      pk.mesh.count = 0;
      pk.mesh.frustumCulled = false;
      scene.add(pk.mesh);
    }

    // --- State ----------------------------------------------------------------
    const state = {
      step: 0,
      sunlight: 0.85,
      xray: true,
      soilAlpha: 0.06,
      paused: false,
      active: true,
      attract: false,
      attractT: 0,
      time: 0,
      night: { goal: 0, raw: 0, mix: 0 },
      attack: { active: false, progress: 0, shield: 0 },
      soilDisrupted: false,
      soilHealth: 1,
      cam: { yaw: 0.11, pitch: 0.14, dist: 12, target: [0, -0.22, 0], fov: 35 },
      flight: null,
      drag: null,
      inset: { left: 0, right: 0, top: 0, bottom: 0 },
      insetGoal: { left: 0, right: 0, top: 0, bottom: 0 },
      particles: [],
      dirty: true,
      dpr: Math.min(window.devicePixelRatio || 1, 1.75),
      slowFrames: 0
    };
    const listeners = { frame: [], attackArrived: [] };
    const emit = (name, payload) => listeners[name].forEach((fn) => fn(payload));

    function reseedParticles() {
      state.particles = [];
      const add = (key, kind, count, speed) => {
        const pts = routes[key];
        if (!pts || pts.length < 2) return;
        for (let i = 0; i < count; i++) state.particles.push({ pts, kind, t: i / count, speed: speed * (0.9 + (i % 3) * 0.08) });
      };
      const s = state.step;
      add('firSugar1', 'sugar', 4, 0.16);
      add('firSugar2', 'sugar', 4, 0.15);
      add('birchSugar1', 'sugar', 4, 0.15);
      add('birchSugar2', 'sugar', 3, 0.14);
      add('saplingFeed1', 'sugar', s === 2 ? 7 : 3, 0.13);
      add('saplingFeed2', 'sugar', s === 2 ? 5 : 2, 0.12);
      add('mineralToFir', 'mineral', 5, 0.14);
      add('mineralToSap', 'mineral', 4, 0.13);
      add('mineralToBirch', 'mineral', 5, 0.14);
      add('ghostSiphon', 'siphon', s === 4 ? 7 : 3, 0.16);
    }

    function samplePolyline(pts, t) {
      const c = Math.max(0, Math.min(0.9999, t)) * (pts.length - 1);
      const i = Math.floor(c);
      const f = c - i;
      const a = pts[i];
      const b = pts[i + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }

    // --- Camera ---------------------------------------------------------------
    const clonePose = (p) => ({ yaw: p.yaw, pitch: p.pitch, dist: p.dist, target: [...p.target], fov: p.fov || 35 });
    const angleDelta = (a, b) => {
      let d = (b - a) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      return d;
    };

    function flyTo(pose, { duration = 1.6 } = {}) {
      const to = clonePose(pose);
      if (reducedMotion) {
        state.cam = to;
        state.flight = null;
        state.dirty = true;
        return;
      }
      const from = clonePose(state.cam);
      const travel = Math.hypot(to.target[0] - from.target[0], to.target[1] - from.target[1], to.target[2] - from.target[2]);
      state.flight = {
        from, to, elapsed: 0, duration,
        yawDelta: angleDelta(from.yaw, to.yaw),
        cranePull: Math.min(1.6, travel * 0.42 + Math.abs(to.dist - from.dist) * 0.1),
        craneLift: Math.min(0.09, travel * 0.026)
      };
    }

    const _eye = new THREE.Vector3();
    function applyCamera(W, H) {
      const ins = state.inset;
      const freeW = Math.max(160, W - ins.left - ins.right);
      const freeH = Math.max(160, H - ins.top - ins.bottom);
      const aspect = freeW / freeH;
      // Keep the diorama's width in frame when the free area is narrow (journal open / portrait)
      const fit = Math.pow(Math.max(1, 1.5 / aspect), 0.88);

      let { yaw, pitch } = state.cam;
      if (state.attract) {
        yaw += Math.sin(state.attractT * 0.11) * 0.42;
        pitch += Math.sin(state.attractT * 0.07) * 0.035;
      } else if (!state.paused && !state.drag && !state.flight && !reducedMotion) {
        yaw += Math.sin(state.time * 0.42) * 0.012;
        pitch += Math.cos(state.time * 0.31) * 0.006;
      }
      const dist = state.cam.dist * fit;
      const t = state.cam.target;
      const cp = Math.cos(pitch);
      _eye.set(t[0] + Math.sin(yaw) * cp * dist, t[1] + Math.sin(pitch) * dist, t[2] + Math.cos(yaw) * cp * dist);
      camera.position.copy(_eye);
      camera.lookAt(t[0], t[1], t[2]);
      camera.fov = state.cam.fov;
      camera.aspect = aspect;
      camera.setViewOffset(freeW, freeH, -ins.left, -ins.top, W, H);
      camera.updateProjectionMatrix();
    }

    // --- Pointer orbit / pinch / zoom ---------------------------------------------
    // Plain wheel scrolls the page; pinch (ctrlKey wheel) or ⌘/Ctrl + wheel zooms.
    const pointers = new Map();
    let pinch = null;
    const clampDist = (d) => Math.max(4.4, Math.min(18, d));
    canvas.addEventListener('pointerdown', (e) => {
      if (state.attract) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      state.flight = null;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, dist: state.cam.dist };
        state.drag = null;
      } else {
        state.drag = { x: e.clientX, y: e.clientY };
      }
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        state.cam.dist = clampDist(pinch.dist * (pinch.d / (Math.hypot(a.x - b.x, a.y - b.y) || 1)));
        state.dirty = true;
        return;
      }
      if (!state.drag) return;
      const dx = e.clientX - state.drag.x;
      const dy = e.clientY - state.drag.y;
      state.drag.x = e.clientX;
      state.drag.y = e.clientY;
      state.cam.yaw -= dx * 0.0068;
      state.cam.pitch = Math.max(-0.42, Math.min(1.1, state.cam.pitch + dy * 0.006));
      state.dirty = true;
    });
    const endPointer = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) state.drag = null;
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('wheel', (e) => {
      if (state.attract || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      state.flight = null;
      state.cam.dist = clampDist(state.cam.dist * Math.exp(e.deltaY * 0.006));
      state.dirty = true;
    }, { passive: false });

    // --- Per-frame lighting from the timeline -----------------------------------
    const tmpDir = new THREE.Vector3();
    const fromAzEl = (azDeg, elDeg, out) => {
      const a = azDeg * DEG;
      const e = elDeg * DEG;
      return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    };
    // Sky positions: azimuth measured from -z (behind the diorama)
    const skyDir = (azDeg, elDeg, out) => {
      const a = azDeg * DEG;
      const e = elDeg * DEG;
      return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
    };

    function applyTimeline(m) {
      const sunPower = state.sunlight <= 0.85 ? 0.12 + 0.88 * ((state.sunlight - 0.1) / 0.75) : 1 + (state.sunlight - 0.85) * 1.1;

      // Sky
      setLin(skyU.uZenith.value, sampleC(TIMELINE.zenith, m));
      setLin(skyU.uHorizon.value, sampleC(TIMELINE.horizon, m));
      setLin(skyU.uWarm.value, sampleC(TIMELINE.warm, m));
      setLin(skyU.uGround.value, sampleC(TIMELINE.ground, m));
      setLin(skyU.uCloud.value, sampleC(TIMELINE.cloud, m));
      skyU.uWarmth.value = sampleN(TIMELINE.warmth, m);
      skyDir(sample(TIMELINE.sunVisAz, m), sample(TIMELINE.sunVisEl, m), skyU.uSunDir.value);
      skyU.uWarmDir.value.copy(skyU.uSunDir.value);
      setLin(skyU.uSunDisc.value, sampleC(TIMELINE.sunDisc, m));
      skyU.uSunSize.value = sample(TIMELINE.sunSize, m) * DEG;
      skyU.uSunGlow.value = sampleN(TIMELINE.sunGlow, m);
      skyDir(sample(TIMELINE.moonVisAz, Math.max(m, 0.5)), sample(TIMELINE.moonVisEl, Math.max(m, 0.5)), skyU.uMoonDir.value);
      skyU.uMoonAlpha.value = smoothstep(0.5, 0.66, m);
      skyU.uStars.value = sampleN(TIMELINE.stars, m);

      // Key light: sun until it sets, then the moon
      if (m < 0.55) {
        fromAzEl(sample(TIMELINE.sunAz, m), sample(TIMELINE.sunEl, m), tmpDir);
        setLin(key.color, sampleC(TIMELINE.sunCol, m));
        key.intensity = sunEnergy * sampleN(TIMELINE.sunI, m) * sunPower;
      } else {
        fromAzEl(sample(TIMELINE.moonAz, m), sample(TIMELINE.moonEl, m), tmpDir);
        setLin(key.color, moonColor);
        key.intensity = moonEnergy * sampleN(TIMELINE.moonI, m);
      }
      tmpDir.y = Math.max(tmpDir.y, 0.03);
      key.position.copy(key.target.position).addScaledVector(tmpDir.normalize(), 19);
      key.visible = key.intensity > 0.002;

      // World ambient
      const world = sampleC(TIMELINE.world, m);
      const ws = (rig.world && rig.world.strength) || 1;
      setLin(hemi.color, world, ws);
      setLin(hemi.groundColor, world, ws * CALIBRATION.ambientGround);

      // Area fills
      const dayW = sampleN(TIMELINE.dayFill, m);
      const nightW = sampleN(TIMELINE.nightFill, m);
      const tint = sampleC(TIMELINE.fillTint, m);
      for (const a of areas) {
        const dW = a.day ? dayW : 0;
        const nW = a.night ? nightW : 0;
        const power = (a.day ? a.day.energy * dW : 0) + (a.night ? a.night.energy * nW : 0);
        const wsum = dW + nW || 1;
        // Day-only areas are the sky fill: they take on golden-hour / sunset tints
        const dc = a.day ? (a.night ? a.day.color : tint) : [0, 0, 0];
        const nc = a.night ? a.night.color : [0, 0, 0];
        a.light.color.setRGB(
          (dc[0] * dW + nc[0] * nW) / wsum,
          (dc[1] * dW + nc[1] * nW) / wsum,
          (dc[2] * dW + nc[2] * nW) / wsum,
          THREE.LinearSRGBColorSpace
        );
        a.light.intensity = power / (a.area * Math.PI) * (a.day && !a.night ? 0.6 + 0.4 * sunPower : 1);
        a.light.visible = a.light.intensity > 0.001;
      }

      // Point lights: sun dapples fade out, bioluminescent lanterns wake up one at a time
      const dapple = sampleN(TIMELINE.dapple, m) * Math.min(1.2, sunPower);
      for (const p of points) {
        const w = p.night ? smoothstep(0.5 + p.order * 0.045, 0.74 + p.order * 0.045, m) : dapple;
        p.weight = w;
        p.light.intensity = (p.def.energy / (4 * Math.PI)) * w * CALIBRATION.points;
        p.light.visible = p.light.intensity > 0.001;
      }
      for (const h of halos) h.sprite.material.opacity = h.point.weight * h.gain;

      // Effects
      if (beamMat) beamMat.uniforms.uAlpha.value = sampleN(TIMELINE.beams, m) * 0.065 * Math.min(1.3, sunPower);
      fireflyMat.uniforms.uAlpha.value = sampleN(TIMELINE.fireflies, m);
      sporeMat.uniforms.uAlpha.value = sampleN(TIMELINE.spores, m) * Math.min(1, sunPower);

      return { bio: sampleN(TIMELINE.bio, m), myc: sampleN(TIMELINE.mycelium, m) };
    }

    function applyEmissive(fx, pulse) {
      const m = state.night.mix;
      const sh = state.soilHealth;
      const each = (role, fn) => (byRole[role] || []).forEach(fn);
      // Each glowing material wakes up slightly after the previous one
      each('mushroom_glow', (e, i) => {
        const wake = smoothstep(0.45 + (i % 5) * 0.05, 0.7 + (i % 5) * 0.05, m);
        e.mat.emissiveIntensity = e.strength * (1 + 0.65 * wake) * (0.25 + 0.75 * sh);
      });
      each('mushroom_red', (e) => { e.mat.emissiveIntensity = e.strength * fx.bio * (0.35 + 0.65 * sh); });
      each('emissive_mycelium', (e) => { e.mat.emissiveIntensity = e.strength * fx.myc * sh; });
      each('emissive_mineral', (e) => { e.mat.emissiveIntensity = e.strength * fx.myc; });
      each('emissive_handshake', (e) => { e.mat.emissiveIntensity = e.strength * fx.myc * (state.step === 1 ? 1.2 + 0.5 * pulse : 1) * sh; });
      each('ghost_plant', (e) => {
        const boost = state.step === 4 ? 1.6 + 0.8 * pulse : 1;
        e.mat.emissiveIntensity = e.strength * Math.max(boost, fx.bio) * (0.3 + 0.7 * sh);
      });
      each('canopy_birch', (e) => {
        if (state.attack.shield > 0) {
          const s = Math.min(1, state.attack.shield / 1.5);
          e.mat.emissive.setRGB(0.25, 1.0, 0.45, THREE.LinearSRGBColorSpace);
          e.mat.emissiveIntensity = (0.35 + 0.35 * pulse) * s;
        } else {
          e.mat.emissive.copy(e.base);
          e.mat.emissiveIntensity = e.strength;
        }
      });
    }

    const _m4 = new THREE.Matrix4();
    const _q = new THREE.Quaternion();
    const _s = new THREE.Vector3();
    const _p = new THREE.Vector3();
    function updateParticles() {
      const counts = { sugar: 0, mineral: 0, siphon: 0, alarm: 0 };
      const sh = state.soilHealth;
      for (const p of state.particles) {
        if (sh < 0.16) continue;
        if (p.kind === 'sugar' && state.sunlight < 0.22 && p.t > 0.5) continue;
        if (p.kind === 'mineral' && state.sunlight < 0.18 && p.t > 0.55) continue;
        const pk = particleKinds[p.kind];
        const i = counts[p.kind]++;
        if (i >= 24) continue;
        const pt = samplePolyline(p.pts, p.t);
        _q.setFromAxisAngle(_p.set(0, 1, 0), state.time * 1.5 + i);
        _m4.compose(_p.set(pt[0], pt[1], pt[2]), _q, _s.setScalar(pk.scale * (0.25 + 0.75 * sh)));
        pk.mesh.setMatrixAt(i, _m4);
      }
      if (state.attack.active && routes.bugAlarm) {
        const pt = samplePolyline(routes.bugAlarm, state.attack.progress);
        const s = particleKinds.alarm.scale * (1 + 0.15 * Math.sin(state.time * 10));
        _q.setFromAxisAngle(_p.set(0, 1, 0), state.time * 3);
        _m4.compose(_p.set(pt[0], pt[1], pt[2]), _q, _s.setScalar(s));
        particleKinds.alarm.mesh.setMatrixAt(0, _m4);
        counts.alarm = 1;
      }
      for (const k of Object.keys(particleKinds)) {
        const mesh = particleKinds[k].mesh;
        mesh.count = Math.min(24, counts[k]);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // --- Resize ---------------------------------------------------------------
    let cssW = 0;
    let cssH = 0;
    function syncSize() {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      if (w !== cssW || h !== cssH || renderer.getPixelRatio() !== state.dpr) {
        cssW = w;
        cssH = h;
        renderer.setPixelRatio(state.dpr);
        renderer.setSize(w, h, false);
        fireflyMat.uniforms.uScale.value = sporeMat.uniforms.uScale.value = h * state.dpr * 0.9;
        state.dirty = true;
      }
    }
    new ResizeObserver(syncSize).observe(canvas);

    // --- Loop -----------------------------------------------------------------
    const NIGHT_DURATION = 4.8;
    const _proj = new THREE.Vector3();
    let last = performance.now();
    let pulse = 1;

    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!state.active) return;

      // Day ↔ night clock
      const n = state.night;
      let moving = false;
      if (n.raw !== n.goal) {
        const step = reducedMotion ? 1 : dt / NIGHT_DURATION;
        n.raw = n.goal > n.raw ? Math.min(n.goal, n.raw + step) : Math.max(n.goal, n.raw - step);
        n.mix = Math.min(1, Math.max(0, sample(NIGHT_WARP, n.raw)));
        moving = true;
      }

      // Camera flight (quintic S-curve + crane arc)
      if (state.flight) {
        const fl = state.flight;
        fl.elapsed += dt;
        const u = Math.min(1, fl.elapsed / fl.duration);
        const e = easeInOutQuint(u);
        const arc = Math.sin(u * Math.PI);
        const c = state.cam;
        c.yaw = fl.from.yaw + fl.yawDelta * e;
        c.pitch = fl.from.pitch + (fl.to.pitch - fl.from.pitch) * e + arc * fl.craneLift;
        c.dist = fl.from.dist + (fl.to.dist - fl.from.dist) * e + arc * fl.cranePull;
        c.fov = fl.from.fov + (fl.to.fov - fl.from.fov) * e;
        for (let i = 0; i < 3; i++) c.target[i] = fl.from.target[i] + (fl.to.target[i] - fl.from.target[i]) * e;
        if (u >= 1) {
          state.cam = clonePose(fl.to);
          state.flight = null;
        }
        moving = true;
      }

      // Smooth view-inset changes (journal open/close)
      const ins = state.inset;
      const goal = state.insetGoal;
      for (const k of ['left', 'right', 'top', 'bottom']) {
        if (Math.abs(goal[k] - ins[k]) > 0.5) {
          ins[k] += (goal[k] - ins[k]) * Math.min(1, dt * (reducedMotion ? 60 : 5));
          moving = true;
        } else ins[k] = goal[k];
      }

      // Soil x-ray fade & living-soil vitality transition
      const soilGoal = state.xray ? 0.06 : 0.55;
      if (soilGlass && Math.abs(soilGlass.opacity - soilGoal) > 0.002) {
        soilGlass.opacity += (soilGoal - soilGlass.opacity) * Math.min(1, dt * 6);
        moving = true;
      }
      const healthGoal = state.soilDisrupted ? 0.05 : 1;
      if (Math.abs(state.soilHealth - healthGoal) > 0.002) {
        state.soilHealth += (healthGoal - state.soilHealth) * Math.min(1, dt * (reducedMotion ? 60 : 3.2));
        moving = true;
      } else {
        state.soilHealth = healthGoal;
      }

      const animating = !state.paused || state.attract;
      if (animating) {
        state.time += dt;
        if (state.attract) state.attractT += dt;
        pulse = 0.5 + 0.5 * Math.sin(state.time * 4);
        const sunMult = (0.25 + state.sunlight * 0.95) * (0.12 + 0.88 * state.soilHealth);
        for (const p of state.particles) p.t = (p.t + p.speed * (p.kind === 'siphon' ? state.soilHealth : sunMult) * dt) % 1;
        const atk = state.attack;
        if (atk.active) {
          atk.progress += dt * 0.3;
          if (atk.progress >= 1) {
            atk.active = false;
            atk.shield = 7.5;
            emit('attackArrived');
          }
        } else if (atk.shield > 0) atk.shield = Math.max(0, atk.shield - dt);
      }

      if (!(animating || moving || state.dirty || state.drag)) return;
      state.dirty = false;

      syncSize();
      applyCamera(cssW, cssH);
      sky.position.copy(camera.position);
      const fx = applyTimeline(n.mix);
      applyEmissive(fx, pulse);
      updateParticles();
      skyU.uTime.value = state.time;
      fireflyMat.uniforms.uTime.value = sporeMat.uniforms.uTime.value = state.time;

      const t0 = performance.now();
      renderer.render(scene, camera);

      // Adaptive resolution: drop pixel ratio if frames stay slow
      const cost = performance.now() - t0;
      if (dt > 0.03 || cost > 22) state.slowFrames++;
      else state.slowFrames = Math.max(0, state.slowFrames - 1);
      if (state.slowFrames > 45 && state.dpr > 1) {
        state.dpr = Math.max(1, state.dpr - 0.25);
        state.slowFrames = 0;
      }

      // Project codex anchors for the HUD
      const out = {};
      for (const k of Object.keys(anchors)) {
        _proj.set(anchors[k][0], anchors[k][1], anchors[k][2]).project(camera);
        out[k] = { x: (_proj.x * 0.5 + 0.5) * cssW, y: (-_proj.y * 0.5 + 0.5) * cssH, visible: _proj.z < 1 && _proj.z > -1 };
      }
      emit('frame', {
        anchors: out,
        nightMix: n.mix,
        width: cssW,
        height: cssH,
        camTargetY: state.cam.target[1],
        camPitch: state.cam.pitch,
        attackActive: state.attack.active,
        attackProgress: state.attack.progress
      });
    }

    reseedParticles();
    syncSize();
    requestAnimationFrame(frame);

    // --- Public API -------------------------------------------------------------
    return {
      setNight(isNight, { instant = false } = {}) {
        state.night.goal = isNight ? 1 : 0;
        if (instant || reducedMotion) {
          state.night.raw = state.night.goal;
          state.night.mix = state.night.goal;
        }
        state.dirty = true;
      },
      isNight: () => state.night.goal === 1,
      getNightMix: () => state.night.mix,
      flyTo,
      setPose(pose) {
        state.cam = clonePose(pose);
        state.flight = null;
        state.dirty = true;
      },
      getPose: () => clonePose(state.cam),
      setXray(on) { state.xray = !!on; state.dirty = true; },
      setSunlight(v) { state.sunlight = v; state.dirty = true; },
      setStep(i) {
        state.step = i;
        state.attack.active = false;
        state.attack.shield = 0;
        state.soilDisrupted = false;
        reseedParticles();
        state.dirty = true;
      },
      setSoilDisrupted(disrupted) {
        state.soilDisrupted = !!disrupted;
        state.dirty = true;
      },
      isSoilDisrupted: () => state.soilDisrupted,
      triggerAttack() {
        state.attack.active = true;
        state.attack.progress = 0;
        state.attack.shield = 0;
        if (state.paused) {
          state.attack.progress = 0.58;
          state.attack.shield = 8;
        }
        state.dirty = true;
      },
      setPaused(p) { state.paused = !!p; state.dirty = true; },
      setReducedMotion(r) { reducedMotion = !!r; state.dirty = true; },
      setActive(a) {
        state.active = !!a;
        last = performance.now();
        state.dirty = true;
      },
      setAttract(on) {
        state.attract = !!on;
        state.dirty = true;
      },
      setViewInset(ins, { instant = false } = {}) {
        Object.assign(state.insetGoal, ins);
        if (instant) Object.assign(state.inset, state.insetGoal);
        state.dirty = true;
      },
      on(name, fn) { listeners[name].push(fn); },
      renderer,
      THREE
    };
  };
})();
