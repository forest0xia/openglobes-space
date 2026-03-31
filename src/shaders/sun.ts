import * as THREE from 'three';

// ═══ SHARED NOISE ═══
const NOISE = /* glsl */ `
  vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
  vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
  vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
    vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;
    vec3 i1=min(g,l.zxy);vec3 i2=max(g,l.zxy);
    vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(
      i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
    float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
    vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;
    vec4 h=1.-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;
    vec4 sh=-step(h,vec4(0.));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);
    vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
    m=m*m;
    return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  float fbm(vec3 p){
    float f=0.;f+=.5*snoise(p);p*=2.02;f+=.25*snoise(p);p*=2.03;
    f+=.125*snoise(p);p*=2.01;f+=.0625*snoise(p);return f/.9375;
  }
  vec3 rotY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);}
`;

// ═══ SURFACE (3 rotation layers, moderate speed) ═══
const surfaceVS = /* glsl */ `
  varying vec3 vNormal,vPos,vViewDir; varying vec2 vUv;
  void main(){
    vNormal=normalize(normalMatrix*normal); vPos=position; vUv=uv;
    vec4 mv=modelViewMatrix*vec4(position,1.);
    vViewDir=normalize(-mv.xyz);
    gl_Position=projectionMatrix*mv;
  }
`;
const surfaceFS = /* glsl */ `
  uniform float uTime; uniform sampler2D uTex;
  varying vec3 vNormal,vPos,vViewDir; varying vec2 vUv;
  ${NOISE}
  void main(){
    vec3 sp=normalize(vPos)*5.;float T=uTime;
    vec3 s1=rotY(sp, T*.025);
    vec3 s2=rotY(sp,-T*.04);
    vec3 s3=rotY(sp, T*.015+1.57);
    float n1=fbm(s1+vec3(0.,T*.005,0.));
    float n2=fbm(s2*2.+vec3(0.,-T*.008,0.));
    float n3=fbm(s3*1.5+vec3(n1*.4,0.,n2*.4));
    float raw=n1*.35+n2*.3+n3*.35;
    float plasma=pow(raw*.5+.5,1.3);
    float cells=abs(snoise(s1*4.+vec3(T*.01)))*.25;

    vec3 darkCore=vec3(.2,.015,0.),deepRed=vec3(.55,.06,.01);
    vec3 orange=vec3(1.,.4,.04),gold=vec3(1.,.75,.2),white=vec3(1.,.97,.85);
    vec3 color;
    if(plasma<.25) color=mix(darkCore,deepRed,plasma/.25);
    else if(plasma<.45) color=mix(deepRed,orange,(plasma-.25)/.2);
    else if(plasma<.7) color=mix(orange,gold,(plasma-.45)/.25);
    else color=mix(gold,white,(plasma-.7)/.3);
    color+=vec3(1.,.5,.1)*cells*plasma;

    // Blend base texture
    vec4 tex=texture2D(uTex,vUv);
    color=mix(color,tex.rgb*1.2,.35);

    // Sporadic bright flares
    float flare=smoothstep(.5,.9,n3+n2*.3)*.5;
    color+=white*flare;

    // Sparse radial bright rays
    float rayAngle=atan(sp.z,sp.x);
    float rayLat=sp.y;
    float rayNoise=snoise(vec3(rayAngle*3.,rayLat*2.,T*.02+7.));
    float rays=smoothstep(.65,1.,rayNoise)*pow(plasma,.5)*.6;
    color+=white*rays;

    // Bright patches at active regions
    float activeRegion=smoothstep(.4,.8,n1+n3*.5)*.3;
    color+=vec3(1.,.9,.6)*activeRegion;

    // Limb: golden edge, darker center
    float fresnel=1.-max(dot(vNormal,vViewDir),0.);
    color+=vec3(1.,.7,.2)*pow(fresnel,2.5)*.6;
    color+=vec3(1.,.65,.15)*pow(fresnel,1.2)*.3;
    color*=.5+.5*pow(1.-fresnel*.5,.6);
    color*=1.3;
    gl_FragColor=vec4(color,1.);
  }
`;

// ═══ CORONA (tight fresnel) ═══
const coronaVS = /* glsl */ `
  varying vec3 vNormal,vViewDir;
  void main(){
    vNormal=normalize(normalMatrix*normal);
    vec4 mv=modelViewMatrix*vec4(position,1.);
    vViewDir=normalize(-mv.xyz);
    gl_Position=projectionMatrix*mv;
  }
`;
const coronaFS = /* glsl */ `
  uniform float uTime; varying vec3 vNormal,vViewDir;
  void main(){
    float f=1.-max(dot(vNormal,vViewDir),0.);
    float g=pow(f,6.)*.9+pow(f,3.)*.1;
    g*=.96+.04*sin(uTime*.4);
    vec3 col=mix(vec3(1.,.35,.08),vec3(1.,.92,.7),pow(f,3.));
    gl_FragColor=vec4(col*g,g);
  }
`;

// ═══ PROMINENCE (arch billboard, 2 crossed planes for thickness) ═══
const promVS = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }
`;
const promFS = /* glsl */ `
  uniform float uTime,uSeed,uLife;
  varying vec2 vUv;
  ${NOISE}
  void main(){
    float x=vUv.x,y=vUv.y;
    float archH=sin(x*3.14159)*.85+.15;
    float strand=0.;
    for(int i=0;i<3;i++){
      float fi=float(i);
      float off=snoise(vec3(x*3.+uSeed+fi*1.7,uTime*.06+fi*.5,fi*2.3))*.1;
      float sy=archH*(.65+fi*.1)+off;
      float d=abs(y-sy);
      strand+=exp(-d*d*1200.)*(snoise(vec3(x*8.+fi*3.,y*5.,uTime*.08+uSeed))*.5+.5)*(0.7+fi*.15);
    }
    strand*=smoothstep(0.,.12,x)*smoothstep(1.,.88,x);
    strand*=smoothstep(0.,.04,y);
    strand*=uLife;
    vec3 col=mix(vec3(1.,.4,.08),vec3(1.,.85,.5),strand);
    if(strand<.01) discard;
    gl_FragColor=vec4(col*strand*1.5,strand*.8);
  }
`;

// ═══ OUTER GLOW ═══
const glowVS=/* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const glowFS = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vec2 c=vUv-.5;float d=length(c)*2.;
    float g=exp(-d*1.8)*.12+exp(-d*4.)*.04;
    g*=smoothstep(.14,.24,d);
    vec3 col=mix(vec3(1.,.85,.5),vec3(1.,.35,.08),d);
    gl_FragColor=vec4(col*g,g);
  }
`;

// ═══ PROMINENCE SYSTEM ═══
const PROM_COUNT = 8;

interface Prominence {
  meshA: THREE.Mesh;
  meshB: THREE.Mesh;
  seed: number; life: number; phase: number; speed: number;
  theta: number; phi: number; size: number;
}

function createPromPlane(radius: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(radius * 0.3, radius * 0.15);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSeed: { value: 0 }, uLife: { value: 0 } },
    vertexShader: promVS, fragmentShader: promFS,
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}

function createProminence(radius: number): Prominence {
  return {
    meshA: createPromPlane(radius),
    meshB: createPromPlane(radius),
    seed: Math.random() * 100,
    life: 0, phase: Math.random(),
    speed: 0.012 + Math.random() * 0.015,
    theta: Math.random() * Math.PI,
    phi: Math.random() * Math.PI * 2,
    size: 0.5 + Math.random() * 0.7,
  };
}

function updateProminence(p: Prominence, radius: number, time: number, parentPos: THREE.Vector3): void {
  p.phase += p.speed * 0.016;
  if (p.phase > 1) {
    p.phase = 0;
    p.theta = Math.random() * Math.PI;
    p.phi = Math.random() * Math.PI * 2;
    p.seed = Math.random() * 100;
    p.size = 0.5 + Math.random() * 0.7;
    p.speed = 0.012 + Math.random() * 0.015;
  }
  if (p.phase < 0.15) p.life = p.phase / 0.15;
  else if (p.phase < 0.7) p.life = 1;
  else p.life = 1 - (p.phase - 0.7) / 0.3;

  const st = Math.sin(p.theta), ct = Math.cos(p.theta);
  const sp = Math.sin(p.phi), cp = Math.cos(p.phi);
  const x = radius * st * cp, y = radius * ct, z = radius * st * sp;
  const pos = new THREE.Vector3(parentPos.x + x, parentPos.y + y, parentPos.z + z);
  const normal = new THREE.Vector3(x, y, z).normalize();
  const up = Math.abs(normal.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3().crossVectors(up, normal).normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent);

  p.meshA.position.copy(pos);
  p.meshA.lookAt(pos.x + tangent.x, pos.y + tangent.y, pos.z + tangent.z);
  p.meshA.scale.setScalar(p.size);
  p.meshB.position.copy(pos);
  p.meshB.lookAt(pos.x + bitangent.x, pos.y + bitangent.y, pos.z + bitangent.z);
  p.meshB.scale.setScalar(p.size);

  for (const m of [p.meshA, p.meshB]) {
    const mat = m.material as THREE.ShaderMaterial;
    mat.uniforms.uTime.value = time;
    mat.uniforms.uSeed.value = p.seed;
    mat.uniforms.uLife.value = p.life;
  }
}

// ═══ EXPORTS ═══
export interface SunMeshes {
  surface: THREE.Mesh;
  corona: THREE.Mesh;
  glow: THREE.Mesh;
  prominences: Prominence[];
}

export function createSun(radius: number, sunTexture: THREE.Texture): SunMeshes {
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uTex: { value: sunTexture } },
      vertexShader: surfaceVS, fragmentShader: surfaceFS,
    }),
  );
  const corona = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.008, 48, 48),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: coronaVS, fragmentShader: coronaFS,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.BackSide,
    }),
  );
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 8, radius * 8),
    new THREE.ShaderMaterial({
      vertexShader: glowVS, fragmentShader: glowFS,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }),
  );
  const prominences: Prominence[] = [];
  for (let i = 0; i < PROM_COUNT; i++) prominences.push(createProminence(radius));
  return { surface, corona, glow, prominences };
}

export function updateSun(sun: SunMeshes, time: number, camera: THREE.Camera): void {
  (sun.surface.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
  (sun.corona.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
  sun.corona.position.copy(sun.surface.position);
  sun.glow.position.copy(sun.surface.position);
  sun.glow.lookAt(camera.position);
  const r = (sun.surface.geometry as THREE.SphereGeometry).parameters.radius;
  for (const p of sun.prominences) updateProminence(p, r, time, sun.surface.position);
}
