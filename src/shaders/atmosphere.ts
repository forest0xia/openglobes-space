import * as THREE from 'three';

// Atmosphere glow — based on Three.js official Earth example (webgpu_tsl_earth)
// Ported from TSL to GLSL: BackSide sphere, fresnel remap, sun-aware color blend
export const ATMO_VERT = `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vNormalW = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const ATMO_FRAG = `
  uniform vec3 dayColor;
  uniform vec3 twilightColor;
  uniform vec3 sunPos;
  uniform vec3 camPos;
  uniform float fresnelLow;   // remap lower edge (default 0.73)
  uniform float fresnelPow;   // pow exponent (default 3.0)
  uniform float sunFadeMin;   // smoothstep min (default -0.5)
  uniform float sunFadeMax;   // smoothstep max (default 1.0)
  uniform float isSun;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 viewDir = normalize(vPosW - camPos);
    vec3 n = normalize(vNormalW);
    float fresnel = 1.0 - abs(dot(viewDir, n));

    if (isSun > 0.5) {
      // Sun: simple radial glow, no sun-awareness
      float alpha = pow(max(1.0 - (fresnel - fresnelLow) / (1.0 - fresnelLow), 0.0), fresnelPow);
      gl_FragColor = vec4(dayColor, alpha);
      return;
    }

    vec3 sunDir = normalize(sunPos - vPosW);
    float sunOrientation = dot(n, sunDir);

    // Color: blend twilight → day based on sun angle
    vec3 atmosphereColor = mix(twilightColor, dayColor, smoothstep(-0.25, 0.75, sunOrientation));

    // Alpha: remap fresnel — visible at rim, transparent at very edge
    float remapped = 1.0 - (fresnel - fresnelLow) / (1.0 - fresnelLow);
    float alpha = pow(max(remapped, 0.0), fresnelPow);

    // Sun modulation: fade out on shadow side
    alpha *= smoothstep(sunFadeMin, sunFadeMax, sunOrientation);

    gl_FragColor = vec4(atmosphereColor, alpha);
  }
`;

// Surface atmosphere haze — FrontSide, covers sunlit hemisphere
// Matches Three.js example: atmosphereMix = fresnel^2 * smoothstep(-0.5, 1, sunOrientation)
export const SURFACE_ATMO_FRAG = `
  uniform vec3 dayColor;
  uniform vec3 twilightColor;
  uniform vec3 sunPos;
  uniform vec3 camPos;
  uniform float strength;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 viewDir = normalize(vPosW - camPos);
    vec3 n = normalize(vNormalW);
    vec3 sunDir = normalize(sunPos - vPosW);
    float fresnel = 1.0 - abs(dot(viewDir, n));
    float sunOrientation = dot(n, sunDir);
    vec3 atmoColor = mix(twilightColor, dayColor, smoothstep(-0.25, 0.75, sunOrientation));
    float atmosphereMix = fresnel * fresnel * smoothstep(-0.5, 1.0, sunOrientation) * strength;
    gl_FragColor = vec4(atmoColor, atmosphereMix);
  }
`;

export interface AtmoCfg {
  scale: number;
  dayColor: [number, number, number];
  twilightColor: [number, number, number];
  fresnelLow: number;
  fresnelPow: number;
  sunFadeMin: number;
  sunFadeMax: number;
  isSun?: boolean;
}

/**
 * Adds a BackSide glow atmosphere mesh as a child of the given parent mesh.
 * Returns the created glow mesh. The caller is responsible for tracking it.
 */
export function addAtmosphere(parent: THREE.Mesh, cfg: AtmoCfg, planetRadius: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      dayColor: { value: new THREE.Vector3(...cfg.dayColor) },
      twilightColor: { value: new THREE.Vector3(...cfg.twilightColor) },
      sunPos: { value: new THREE.Vector3() },
      camPos: { value: new THREE.Vector3() },
      fresnelLow: { value: cfg.fresnelLow },
      fresnelPow: { value: cfg.fresnelPow },
      sunFadeMin: { value: cfg.sunFadeMin },
      sunFadeMax: { value: cfg.sunFadeMax },
      isSun: { value: cfg.isSun ? 1.0 : 0.0 },
    },
    vertexShader: ATMO_VERT,
    fragmentShader: ATMO_FRAG,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
  const gm = new THREE.Mesh(new THREE.SphereGeometry(planetRadius * cfg.scale, 32, 32), mat);
  gm.userData.isGlow = true;
  gm.userData.glowMat = mat;
  parent.add(gm);
  return gm;
}

/**
 * Adds a FrontSide surface atmosphere haze mesh as a child of the given parent mesh.
 * Returns the created glow mesh. The caller is responsible for tracking it.
 */
export function addSurfaceAtmo(parent: THREE.Mesh, dayCol: [number, number, number], twiCol: [number, number, number], strength: number, planetRadius: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      dayColor: { value: new THREE.Vector3(...dayCol) },
      twilightColor: { value: new THREE.Vector3(...twiCol) },
      sunPos: { value: new THREE.Vector3() },
      camPos: { value: new THREE.Vector3() },
      strength: { value: strength },
    },
    vertexShader: ATMO_VERT,
    fragmentShader: SURFACE_ATMO_FRAG,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
  });
  const gm = new THREE.Mesh(new THREE.SphereGeometry(planetRadius * 1.01, 32, 32), mat);
  gm.renderOrder = 999;
  gm.userData.isGlow = true;
  gm.userData.glowMat = mat;
  parent.add(gm);
  return gm;
}

// Parameters from Three.js official example + tuned per planet
interface PlanetAtmoConfig {
  atmosphere: AtmoCfg;
  surfaceAtmo?: {
    dayColor: [number, number, number];
    twilightColor: [number, number, number];
    strength: number;
  };
}

export const PLANET_ATMO_CONFIGS: Record<string, PlanetAtmoConfig> = {
  sun: {
    atmosphere: {
      scale: 1.074, dayColor: [1, .85, .3], twilightColor: [1, .4, .1],
      fresnelLow: 0.5, fresnelPow: 2.0, sunFadeMin: -1, sunFadeMax: 1, isSun: true,
    },
  },
  earth: {
    atmosphere: {
      scale: 1.04, dayColor: [.3, .7, 1], twilightColor: [.74, .29, .04],
      fresnelLow: 0.73, fresnelPow: 3.0, sunFadeMin: -0.5, sunFadeMax: 1.0,
    },
    surfaceAtmo: {
      dayColor: [.3, .7, 1], twilightColor: [.74, .29, .04], strength: 0.7,
    },
  },
  venus: {
    atmosphere: {
      scale: 1.06, dayColor: [.9, .75, .4], twilightColor: [.8, .4, .1],
      fresnelLow: 0.65, fresnelPow: 2.5, sunFadeMin: -0.5, sunFadeMax: 1.0,
    },
    surfaceAtmo: {
      dayColor: [.9, .75, .4], twilightColor: [.8, .4, .1], strength: 0.6,
    },
  },
  mars: {
    atmosphere: {
      scale: 1.03, dayColor: [.8, .5, .3], twilightColor: [.6, .2, .05],
      fresnelLow: 0.75, fresnelPow: 3.5, sunFadeMin: -0.5, sunFadeMax: 1.0,
    },
    surfaceAtmo: {
      dayColor: [.8, .5, .3], twilightColor: [.6, .2, .05], strength: 0.3,
    },
  },
  jupiter: {
    atmosphere: {
      scale: 1.05, dayColor: [.8, .65, .35], twilightColor: [.6, .3, .1],
      fresnelLow: 0.7, fresnelPow: 3.0, sunFadeMin: -0.5, sunFadeMax: 1.0,
    },
    surfaceAtmo: {
      dayColor: [.8, .65, .35], twilightColor: [.6, .3, .1], strength: 0.5,
    },
  },
  saturn: {
    atmosphere: {
      scale: 1.05, dayColor: [.9, .8, .5], twilightColor: [.7, .4, .1],
      fresnelLow: 0.7, fresnelPow: 3.0, sunFadeMin: -0.5, sunFadeMax: 1.0,
    },
    surfaceAtmo: {
      dayColor: [.9, .8, .5], twilightColor: [.7, .4, .1], strength: 0.5,
    },
  },
  uranus: {
    atmosphere: {
      scale: 1.04, dayColor: [.4, .75, .85], twilightColor: [.2, .4, .5],
      fresnelLow: 0.72, fresnelPow: 3.0, sunFadeMin: -0.5, sunFadeMax: 1.0,
    },
    surfaceAtmo: {
      dayColor: [.4, .75, .85], twilightColor: [.2, .4, .5], strength: 0.5,
    },
  },
  neptune: {
    atmosphere: {
      scale: 1.04, dayColor: [.25, .4, .9], twilightColor: [.15, .1, .5],
      fresnelLow: 0.72, fresnelPow: 3.0, sunFadeMin: -0.5, sunFadeMax: 1.0,
    },
    surfaceAtmo: {
      dayColor: [.25, .4, .9], twilightColor: [.15, .1, .5], strength: 0.5,
    },
  },
};
