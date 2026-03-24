import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../stores/store';
import { PLANETS } from '../data/planets';

export function CameraController() {
  const { camera } = useThree();
  const focusTarget = useStore((s) => s.focusTarget);
  const simulationTime = useStore((s) => s.simulationTime);

  // Orbit controls state
  const orbitRef = useRef({
    theta: 0.3,
    phi: 0.8,
    distance: 100,
    targetTheta: 0.3,
    targetPhi: 0.8,
    targetDistance: 100,
    center: new THREE.Vector3(0, 0, 0),
    targetCenter: new THREE.Vector3(0, 0, 0),
    isDragging: false,
    prevMouse: { x: 0, y: 0 },
    isAutoFocusing: false,
  });

  // Handle focus changes
  useEffect(() => {
    const orbit = orbitRef.current;
    if (focusTarget) {
      orbit.isAutoFocusing = true;
      if (focusTarget.type === 'planet') {
        const dist = Math.max(focusTarget.data.radius * 6, 15);
        orbit.targetDistance = dist;
      } else {
        orbit.targetDistance = 15;
      }
    } else {
      orbit.isAutoFocusing = false;
      orbit.targetCenter.set(0, 0, 0);
      orbit.targetDistance = 100;
    }
  }, [focusTarget]);

  // Mouse/touch event handling
  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const orbit = orbitRef.current;

    const onMouseDown = (e: MouseEvent) => {
      orbit.isDragging = true;
      orbit.prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!orbit.isDragging) return;
      orbit.targetTheta -= (e.clientX - orbit.prevMouse.x) * 0.005;
      orbit.targetPhi = Math.max(
        0.1,
        Math.min(Math.PI - 0.1, orbit.targetPhi - (e.clientY - orbit.prevMouse.y) * 0.005)
      );
      orbit.prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { orbit.isDragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbit.targetDistance = Math.max(5, Math.min(300, orbit.targetDistance + e.deltaY * 0.05));
    };

    // Touch
    let touchDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        orbit.isDragging = true;
        orbit.prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        touchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && orbit.isDragging) {
        orbit.targetTheta -= (e.touches[0].clientX - orbit.prevMouse.x) * 0.005;
        orbit.targetPhi = Math.max(
          0.1,
          Math.min(Math.PI - 0.1, orbit.targetPhi - (e.touches[0].clientY - orbit.prevMouse.y) * 0.005)
        );
        orbit.prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        orbit.targetDistance = Math.max(5, Math.min(300, orbit.targetDistance - (d - touchDist) * 0.1));
        touchDist = d;
      }
    };
    const onTouchEnd = () => { orbit.isDragging = false; };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  useFrame((_, delta) => {
    const orbit = orbitRef.current;

    // Track focused object
    if (focusTarget) {
      if (focusTarget.type === 'planet') {
        const p = focusTarget.data;
        if (p.isSun) {
          orbit.targetCenter.set(0, 0, 0);
        } else {
          const angle = simulationTime * p.speed;
          orbit.targetCenter.set(
            Math.cos(angle) * p.distance,
            0,
            Math.sin(angle) * p.distance
          );
        }
      } else if (focusTarget.type === 'probe') {
        const probe = focusTarget.data;
        const pos = probe.fallbackPosition;
        if ('orbitPlanetId' in pos) {
          const parentIdx = PLANETS.findIndex((p) => p.id === pos.orbitPlanetId);
          if (parentIdx >= 0) {
            const parent = PLANETS[parentIdx];
            const parentAngle = simulationTime * parent.speed;
            orbit.targetCenter.set(
              Math.cos(parentAngle) * parent.distance,
              0,
              Math.sin(parentAngle) * parent.distance
            );
          }
        } else if ('distance' in pos) {
          const driftAngle = pos.angle + simulationTime * 0.002;
          orbit.targetCenter.set(
            Math.cos(driftAngle) * pos.distance,
            0,
            Math.sin(driftAngle) * pos.distance
          );
        }
      }
    }

    // Smooth interpolation
    const lf = 1 - Math.pow(0.01, delta);
    orbit.theta += (orbit.targetTheta - orbit.theta) * lf;
    orbit.phi += (orbit.targetPhi - orbit.phi) * lf;
    orbit.distance += (orbit.targetDistance - orbit.distance) * lf;
    orbit.center.lerp(orbit.targetCenter, lf);

    // Calculate camera position from spherical coordinates
    camera.position.x =
      orbit.center.x + orbit.distance * Math.sin(orbit.phi) * Math.cos(orbit.theta);
    camera.position.y =
      orbit.center.y + orbit.distance * Math.cos(orbit.phi);
    camera.position.z =
      orbit.center.z + orbit.distance * Math.sin(orbit.phi) * Math.sin(orbit.theta);

    camera.lookAt(orbit.center);
  });

  return null;
}
