import * as THREE from 'three';

export function makeProceduralTexture(
  hexColor: string,
  type: 'sun' | 'gas' | 'rock'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Parse hex color
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  if (type === 'sun') {
    const gradient = ctx.createRadialGradient(256, 128, 20, 256, 128, 256);
    gradient.addColorStop(0, `rgb(${Math.min(255, r + 60)},${Math.min(255, g + 40)},${b})`);
    gradient.addColorStop(0.5, `rgb(${r},${g},${b})`);
    gradient.addColorStop(1, `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 30)},${b})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 256);
    // Solar granulation
    for (let i = 0; i < 60; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 256, Math.random() * 24 + 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${Math.min(255, r + 80)},${Math.min(255, g + 50)},0,${Math.random() * 0.25})`;
      ctx.fill();
    }
  } else if (type === 'gas') {
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 512, 256);
    // Horizontal bands
    for (let y = 0; y < 256; y += 2) {
      const variation = Math.sin(y * 0.12) * 25 + Math.sin(y * 0.05) * 10;
      ctx.fillStyle = `rgba(${Math.max(0, Math.min(255, r + variation))},${Math.max(0, Math.min(255, g + variation * 0.5))},${Math.max(0, Math.min(255, b + variation * 0.3))},0.5)`;
      ctx.fillRect(0, y, 512, 2);
    }
    // Storm spots
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(Math.random() * 512, Math.random() * 256, Math.random() * 20 + 8, Math.random() * 10 + 4, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${Math.max(0, r - 30)},${Math.max(0, g - 20)},${Math.max(0, b - 10)},0.3)`;
      ctx.fill();
    }
  } else {
    // Rocky planet
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 512, 256);
    // Craters / terrain variation
    for (let i = 0; i < 120; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 256, Math.random() * 10 + 2, 0, Math.PI * 2);
      const dark = Math.random() > 0.5;
      const shift = dark ? -30 : 20;
      ctx.fillStyle = `rgba(${Math.max(0, Math.min(255, r + shift))},${Math.max(0, Math.min(255, g + shift))},${Math.max(0, Math.min(255, b + shift))},${Math.random() * 0.3})`;
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
