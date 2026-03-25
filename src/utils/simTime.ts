// Module-level mutable time — updated every frame in useFrame, never triggers React re-renders.
// Components read this directly inside useFrame callbacks.
export const sim = {
  time: 0,
};
