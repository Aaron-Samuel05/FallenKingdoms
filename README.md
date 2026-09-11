# Fallen Kingdoms

Fallen Kingdoms is an ambitious browser-first 3D action adventure built around WebGPU and Three.js.

## Current build

The first vertical slice is now in the repository. It includes:

- WebGPU renderer with Three.js
- WebGL2 fallback through Three.js WebGPU renderer
- Procedural open-world terrain
- Third-person player controller
- Sprinting and camera look
- Melee combat
- Enemy AI and elite enemies
- Dynamic health and combat feedback
- Procedural forest and rocks
- Ruined altar encounter
- Quest progression
- Day and night cycle
- Dynamic sky and fog
- Water surface
- Cinematic title screen and HUD
- Browser-native responsive rendering

Three.js WebGPURenderer is used as the rendering foundation because it can target WebGPU and fall back to WebGL2 when required. The current three.js documentation also exposes a modern node-based material and post-processing pipeline that will be used as Fallen Kingdoms expands.

## Run locally

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

## Controls

- WASD: move
- Shift: sprint
- Mouse: camera
- Left click: attack
- E: interact
- Space: reserved for jump in the next traversal pass

## Roadmap

1. Traversal and animation system
2. Streaming world regions and LOD
3. Wildlife and NPC schedules
4. Full quest and dialogue framework
5. Inventory and progression
6. Boss encounters
7. Cinematic mission system
8. Audio and adaptive music
9. Save/load persistence
10. WebGPU rendering and post-processing optimization
11. Additional world regions
12. Final story campaign

The project deliberately starts with a playable vertical slice rather than a static concept page.
