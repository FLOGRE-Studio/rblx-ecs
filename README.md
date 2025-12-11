# rblx-ecs

rblx-ecs is a compact, high-performance Entity Component System (ECS) core intended for Roblox-TS projects.

Purpose
- Provide a small, data-oriented ECS core suitable for game logic and simulations.
- Use dense arrays for cache-friendly iteration and sparse maps for fast random access.
- Provide lightweight, bitmask-based change events for batched updates.

Quick start

1. Copy or install this module into your Roblox-TS project.
2. Import the public namespace and create entities/components:

# Components
Components are typed data containers that attach to entities. Each component holds a specific piece of information (position, health, velocity, etc.) and is associated with a type identifier created via `RblxECS.Component.createStrictComponent<T>()`. The system stores all component instances in dense arrays for efficient iteration, while sparse maps allow fast O(1) lookups by entity. A single entity can have at most one component of each type attached to it.

```ts
import { RblxECS } from "rblx-ecs";

// An interface to be used in component data.
interface Health {
    hp: number;
}

const ECS = {
    Tags: { . . . },

    Components: {
        /* At runtime, this is just pure numeric ID.
        * At compile time, you get good typing information about components.
        */
        Health: RblxECS.Component.createStrictComponent<Health>()
    }
}

// Create an entity.
const entity = RblxECS.Entity.createEntity();

// Use RblxECS.Component APIs to register components and attach data
const component = RblxECS.Component.get(Component)
```



# Tags

Tags are lightweight, zero-data boolean markers that you can attach to entities to classify or categorize them via ``RblxECS.Tag.createStrictTag()``. Unlike components which carry data, tags are pure identifiers, they signal that an entity belongs to a certain group or has a certain property (e.g., isPlayer, isDead, isVisible). Tags are commonly used for filtering entities in systems, subscribing to specific entity groups, or implementing simple state flags without the overhead of storing component data.

```ts
import { RblxECS } from "rblx-ecs";

// Define tag identifiers using the same API as components with absolutely no data.
const ECS = {
    Tags: {
        IsPlayer: RblxECS.Tag.createStrictTag(), 
        IsEnemy: RblxECS.Tag.createStrictTag(),
        IsAlive: RblxECS.Tag.createStrictTag()
    },

    Components: { . . . }
};

const entity = RblxECS.Entity.createEntity();

// Attach a tag by adding a component with empty data.
RblxECS.Tag.add(entity, ECS.Tags.IsPlayer);

// Check if an entity has a tag.
const hasTag = RblxECS.Tag.has(entity, ECS.Tags.IsPlayer);

// Remove a tag.
RblxECS.Tag.remove(entity, ECS.Tags.IsPlayer);
```

Repository layout
- `src/` — TypeScript source implementation
- `src/types/` — Type declarations used by the API
- `src/utils/` — Small helpers (logger, validation)