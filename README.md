# rblx-ecs

rblx-ecs is a compact, high-performance Entity Component System (ECS) core intended for Roblox-TS projects.

Purpose
- Provide a small, data-oriented ECS core suitable for game logic and simulations.
- Use dense arrays for cache-friendly iteration and sparse maps for fast random access.
- Provide lightweight, bitmask-based change events for batched updates.

Quick start

1. Copy or install this module into your Roblox-TS project.
2. Import the public namespace and create entities/components:

```ts
import { RblxECS } from "rblx-ecs";

// An interface to be used in component data.
interface Health {
    hp: number;
}

const ECS = {
    /* At runtime, this is just pure numeric ID.
     * At compile time, you get good typing information about components.
    */
    Health: RblxECS.Component.createStrictComponent<Health>()
}

// Create an entity.
const entity = RblxECS.Entity.createEntity();

// Use RblxECS.Component APIs to register components and attach data
const component = RblxECS.Component.get(Component)
```

Repository layout
- `src/` — TypeScript source implementation
- `src/types/` — Type declarations used by the API
- `src/utils/` — Small helpers (logger, validation)