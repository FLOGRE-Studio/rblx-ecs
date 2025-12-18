# rblx-ecs

A compact, high-performance Entity Component System (ECS) implementation for Roblox-TS projects.

## Purpose

- Provide a small, data-oriented ECS core suitable for game logic and simulations
- Use dense arrays for cache-friendly iteration and sparse maps for fast O(1) random access
- Enable efficient entity management with generation-based handle validation
- Support type-safe component and tag operations with TypeScript

## Features

✨ **Type-Safe API** - Full TypeScript support with branded types for components and tags  
🚀 **High Performance** - Dense array storage for cache-friendly iteration  
⚡ **O(1) Operations** - Fast entity, component, and tag lookups via sparse indexing  
🔄 **Entity Recycling** - Automatic ID reuse with generation counters to prevent stale references  
🏷️ **Lightweight Tags** - Zero-overhead boolean markers for entity categorization  
🛡️ **Safe Handles** - Generation-based validation prevents use-after-free bugs

## Quick Start

### Installation

```bash
npm install @rbxts/rblx-ecs
# or
yarn add @rbxts/rblx-ecs
```

### Basic Example

```ts
import { RblxECS } from "@rbxts/rblx-ecs";

// Define your component types
interface Position {
    x: number;
    y: number;
    z: number;
}

interface Velocity {
    dx: number;
    dy: number;
    dz: number;
}

// Create component type identifiers
const PositionComponent = RblxECS.Component.createStrictComponent<Position>();
const VelocityComponent = RblxECS.Component.createStrictComponent<Velocity>();

// Create an entity
const player = RblxECS.Entity.createEntity();

// Attach components with data
RblxECS.Component.add(player, PositionComponent, { x: 0, y: 5, z: 0 });
RblxECS.Component.add(player, VelocityComponent, { dx: 1, dy: 0, dz: 0 });

// Query components
const position = RblxECS.Component.get(player, PositionComponent);
if (position) {
    print(`Player position: ${position.x}, ${position.y}, ${position.z}`);
}

// Remove components
RblxECS.Component.remove(player, VelocityComponent);

// Destroy the entity when done
RblxECS.Entity.destroyEntity(player);
```

---

## Core Concepts

### Entities

Entities are unique identifiers represented as `EntityHandle` tuples: `[entityId, generation]`.

- **entityId**: A numeric identifier that may be recycled after entity destruction
- **generation**: A counter incremented each time an ID is reused, invalidating old handles

This generation system prevents use-after-free bugs by detecting stale entity references.

```ts
const entity = RblxECS.Entity.createEntity();
// Returns: [0, 0] - first entity, generation 0

RblxECS.Entity.destroyEntity(entity);
// Entity destroyed, ID 0 returned to free pool

const newEntity = RblxECS.Entity.createEntity();
// Returns: [0, 1] - recycled ID 0, but generation 1

// Attempting to use the old handle will fail:
// RblxECS.Component.add(entity, SomeComponent, data); // Error: stale handle!
```

### Components

Components are typed data containers that attach to entities. Each component type holds specific information (position, health, velocity, etc.) and is identified by a unique type created via `createStrictComponent<T>()`.

**Storage Architecture:**
- Dense arrays for cache-friendly iteration of all components of a type
- Sparse arrays for O(1) entity-to-component lookups
- Bidirectional mapping enables efficient swap-and-pop removal

**Component Rules:**
- An entity can have at most one component of each type
- Components are strongly typed at compile-time
- Adding a duplicate component type throws an error

```ts
interface Health {
    [k: string]: unknown // Index signature to satisify Record<string, unknown>.
    current: number;
    maximum: number;
}

interface Armor {
    [k: string]: unknown // Index signature to satisify Record<string, unknown>.
    defense: number;
    durability: number;
}

// Create component type identifiers
const Health = RblxECS.Component.createStrictComponent<Health>();
const Armor = RblxECS.Component.createStrictComponent<Armor>();

const enemy = RblxECS.Entity.createEntity();

// Add components
RblxECS.Component.add(enemy, Health, { current: 100, maximum: 100 });
RblxECS.Component.add(enemy, Armor, { defense: 25, durability: 80 });

// Retrieve component (readonly reference)
const health = RblxECS.Component.get(enemy, Health);
if (health) {
    print(`Enemy health: ${health.current}/${health.maximum}`);
}

// Remove component
const removed = RblxECS.Component.remove(enemy, Armor);
print(`Armor removed: ${removed}`);
```

### Tags

Tags are lightweight, zero-data boolean markers for entity categorization. Unlike components which carry data payloads, tags are pure identifiers used for filtering and classification.

**Common Use Cases:**
- State flags: `IsAlive`, `IsDead`, `IsStunned`
- Entity types: `IsPlayer`, `IsEnemy`, `IsNPC`
- Rendering flags: `IsVisible`, `NeedsUpdate`, `IsOffscreen`
- System filters: `RequiresPhysics`, `HasAI`, `IsNetworked`

```ts
// Define tag identifiers
const IsPlayer = RblxECS.Tag.createStrictTag();
const IsAlive = RblxECS.Tag.createStrictTag();
const IsEnemy = RblxECS.Tag.createStrictTag();
const RequiresRendering = RblxECS.Tag.createStrictTag();

const player = RblxECS.Entity.createEntity();

// Add tags
RblxECS.Tag.add(player, IsPlayer);
RblxECS.Tag.add(player, IsAlive);
RblxECS.Tag.add(player, RequiresRendering);

// Check for tags
if (RblxECS.Tag.has(player, IsPlayer)) {
    print("This is a player entity");
}

// Remove tags
RblxECS.Tag.remove(player, IsAlive); // Player died
```

---

## API Reference

### Entity Operations

#### `RblxECS.Entity.createEntity()`

Creates a new entity and returns its unique handle.

**Returns:** `EntityHandle` - A tuple `[entityId, generation]`

```ts
const entity = RblxECS.Entity.createEntity();
// Returns: [0, 0] for the first entity
```


#### `RblxECS.Entity.destroyEntity(entityHandle)`

Destroys an entity and releases all associated resources. Removes all attached components and returns the entity ID to the free pool for recycling.

**Parameters:**
- `entityHandle: EntityHandle` - The entity to destroy

**Returns:** `boolean` - False if handle was already stale, true otherwise

```ts
const entity = RblxECS.Entity.createEntity();
RblxECS.Entity.destroyEntity(entity);
// Entity destroyed, components removed, ID available for reuse
```

### Component Operations

#### `RblxECS.Component.createStrictComponent<T>()`

Registers a new component type and returns a type-safe identifier.

**Type Parameters:**
- `T extends Record<string, unknown>` - The component data structure

**Returns:** `StrictComponent<T>` - A branded numeric type identifier

```ts
interface Transform {
    [k: string]: unknown // Index signature to satisify Record<string, unknown>.
    position: Vector3;
    rotation: CFrame;
    scale: Vector3;
}

const Transform = RblxECS.Component.createStrictComponent<Transform>();
```

#### `RblxECS.Component.add<T>(entityHandle, componentType, data)`

Attaches a component instance to an entity.

**Parameters:**
- `entityHandle: EntityHandle` - The entity to attach to
- `componentType: StrictComponent<T>` - The component type identifier
- `data: T` - The component data instance

**Throws:** Error if entity is stale or already has this component type

```ts
const entity = RblxECS.Entity.createEntity();
RblxECS.Component.add(entity, Transform, {
    position: new Vector3(0, 0, 0),
    rotation: CFrame.identity,
    scale: new Vector3(1, 1, 1)
});
```

#### `RblxECS.Component.get<T>(entityHandle, componentType)`

Retrieves a component instance from an entity.

**Parameters:**
- `entityHandle: EntityHandle` - The entity to query
- `componentType: StrictComponent<T>` - The component type to retrieve

**Returns:** `Readonly<T> | undefined` - The component data, or undefined if not present

**Throws:** Error if entity handle is stale

```ts
const transform = RblxECS.Component.get(entity, Transform);
if (transform) {
    print(`Position: ${transform.position}`);
}
```

#### `RblxECS.Component.remove(entityHandle, componentType)`

Removes a component from an entity using swap-and-pop.

**Parameters:**
- `entityHandle: EntityHandle` - The entity to remove from
- `componentType: number` - The component type to remove

**Returns:** `boolean` - True if removed, false if component wasn't present

**Throws:** Error if entity handle is stale

```ts
const removed = RblxECS.Component.remove(entity, Transform);
print(`Component removed: ${removed}`);
```

### Tag Operations

#### `RblxECS.Tag.createStrictTag()`

Registers a new tag type and returns a unique identifier.

**Returns:** `StrictTag` - A unique numeric tag identifier

```ts
const IsActive = RblxECS.Tag.createStrictTag();
const NeedsUpdate = RblxECS.Tag.createStrictTag();
```

#### `RblxECS.Tag.add(entityHandle, tag)`

Adds a tag to an entity.

**Parameters:**
- `entityHandle: EntityHandle` - The entity to tag
- `tag: StrictTag` - The tag to add

**Returns:** `boolean` - True on success

**Throws:** Error if entity is stale or already has this tag

```ts
RblxECS.Tag.add(entity, IsActive);
```

#### `RblxECS.Tag.has(entityHandle, tag)`

Checks if an entity has a specific tag.

**Parameters:**
- `entityHandle: EntityHandle` - The entity to check
- `tag: StrictTag` - The tag to search for

**Returns:** `boolean` - True if entity has the tag

```ts
if (RblxECS.Tag.has(entity, IsActive)) {
    // Process active entity
}
```

#### `RblxECS.Tag.remove(entityHandle, tag)`

Removes a tag from an entity.

**Parameters:**
- `entityHandle: EntityHandle` - The entity to untag
- `tag: StrictTag` - The tag to remove

**Returns:** `boolean` - True if removed, false if tag wasn't present

**Throws:** Error if entity handle is stale

```ts
RblxECS.Tag.remove(entity, IsActive);
```

### Debug Operations

#### `RblxECS.Debugger.setIsDebugMode(value)`

Enables or disables debug logging for ECS operations.

**Parameters:**
- `value: boolean` - True to enable debug output, false to disable

```ts
RblxECS.Debugger.setIsDebugMode(true);
// Now entity creation, component operations, etc. will log
```

---

## Advanced Examples

### Building an ECS Registry

Organize your components and tags in a centralized registry:

```ts
import { RblxECS } from "@rbxts/rblx-ecs";

// Component interfaces
interface Position { [k: string]: unknown; x: number; y: number; z: number }
interface Velocity { [k: string]: unknown; dx: number; dy: number; dz: number }
interface Health { [k: string]: unknown; current: number; maximum: number }
interface Damage { [k: string]: unknown; amount: number; type: string }

// Create the ECS registry
export const ECS = {
    Components: {
        Position: RblxECS.Component.createStrictComponent<Position>(),
        Velocity: RblxECS.Component.createStrictComponent<Velocity>(),
        Health: RblxECS.Component.createStrictComponent<Health>(),
        Damage: RblxECS.Component.createStrictComponent<Damage>()
    },
    Tags: {
        IsPlayer: RblxECS.Tag.createStrictTag(),
        IsEnemy: RblxECS.Tag.createStrictTag(),
        IsAlive: RblxECS.Tag.createStrictTag(),
        RequiresPhysics: RblxECS.Tag.createStrictTag(),
        RequiresRendering: RblxECS.Tag.createStrictTag()
    }
} as const;
```

### Creating Entity Archetypes

Build factory functions for common entity patterns:

```ts
import { ECS } from "./ecs-registry";

// Player entity factory
function createPlayer(spawnPosition: Vector3) {
    const entity = RblxECS.Entity.createEntity();
    
    RblxECS.Component.add(entity, ECS.Components.Position, {
        x: spawnPosition.X,
        y: spawnPosition.Y,
        z: spawnPosition.Z
    });
    
    RblxECS.Component.add(entity, ECS.Components.Velocity, {
        dx: 0,
        dy: 0,
        dz: 0
    });
    
    RblxECS.Component.add(entity, ECS.Components.Health, {
        current: 100,
        maximum: 100
    });
    
    RblxECS.Tag.add(entity, ECS.Tags.IsPlayer);
    RblxECS.Tag.add(entity, ECS.Tags.IsAlive);
    RblxECS.Tag.add(entity, ECS.Tags.RequiresPhysics);
    RblxECS.Tag.add(entity, ECS.Tags.RequiresRendering);
    
    return entity;
}

// Enemy entity factory
function createEnemy(spawnPosition: Vector3, health: number) {
    const entity = RblxECS.Entity.createEntity();
    
    RblxECS.Component.add(entity, ECS.Components.Position, {
        x: spawnPosition.X,
        y: spawnPosition.Y,
        z: spawnPosition.Z
    });
    
    RblxECS.Component.add(entity, ECS.Components.Health, {
        current: health,
        maximum: health
    });
    
    RblxECS.Tag.add(entity, ECS.Tags.IsEnemy);
    RblxECS.Tag.add(entity, ECS.Tags.IsAlive);
    RblxECS.Tag.add(entity, ECS.Tags.RequiresRendering);
    
    return entity;
}

// Usage
const player = createPlayer(new Vector3(0, 5, 0));
const enemy = createEnemy(new Vector3(10, 5, 10), 50);
```

### Implementing Systems

Systems are functions that iterate over entities with specific component combinations:

```ts
import { ECS } from "./ecs-registry";

// Movement system - updates positions based on velocity
function movementSystem(entities: EntityHandle[], deltaTime: number) {
    for (const entity of entities) {
        const position = RblxECS.Component.get(entity, ECS.Components.Position);
        const velocity = RblxECS.Component.get(entity, ECS.Components.Velocity);
        
        if (position && velocity) {
            // Use `mutablyChange` for in-place updates when possible
            RblxECS.Component.mutablyChange(entity, ECS.Components.Position, (pos) => {
                pos.x += velocity.dx * deltaTime;
                pos.y += velocity.dy * deltaTime;
                pos.z += velocity.dz * deltaTime;
                return true;
            });
        }
    }
}

// Health regeneration system
function healthRegenSystem(entities: EntityHandle[], regenRate: number) {
    for (const entity of entities) {
        if (!RblxECS.Tag.has(entity, ECS.Tags.IsAlive)) continue;
        
        const health = RblxECS.Component.get(entity, ECS.Components.Health);
        if (health && health.current < health.maximum) {
            RblxECS.Component.add(entity, ECS.Components.Health, {
                current: math.min(health.current + regenRate, health.maximum),
                maximum: health.maximum
            });
        }
    }
}

// Damage application system
function damageSystem(entities: EntityHandle[]) {
    for (const entity of entities) {
        const health = RblxECS.Component.get(entity, ECS.Components.Health);
        const damage = RblxECS.Component.get(entity, ECS.Components.Damage);
        
        if (health && damage) {
            const newHealth = health.current - damage.amount;
            
            if (newHealth <= 0) {
                // Entity died
                RblxECS.Tag.remove(entity, ECS.Tags.IsAlive);
                RblxECS.Component.add(entity, ECS.Components.Health, {
                    current: 0,
                    maximum: health.maximum
                });
            } else {
                RblxECS.Component.add(entity, ECS.Components.Health, {
                    current: newHealth,
                    maximum: health.maximum
                });
            }
            
            // Remove damage component after processing
            RblxECS.Component.remove(entity, ECS.Components.Damage);
        }
    }
}
```

### Entity Queries

Build utility functions to query entities by component and tag combinations:

```ts
import { ECS } from "./ecs-registry";

// Query all entities with Position and Velocity
function queryMovableEntities(allEntities: EntityHandle[]): EntityHandle[] {
    const results: EntityHandle[] = [];
    
    for (const entity of allEntities) {
        const hasPosition = RblxECS.Component.get(entity, ECS.Components.Position) !== undefined;
        const hasVelocity = RblxECS.Component.get(entity, ECS.Components.Velocity) !== undefined;
        
        if (hasPosition && hasVelocity) {
            results.push(entity);
        }
    }
    
    return results;
}

// Query all living player entities
function queryLivingPlayers(allEntities: EntityHandle[]): EntityHandle[] {
    const results: EntityHandle[] = [];
    
    for (const entity of allEntities) {
        const isPlayer = RblxECS.Tag.has(entity, ECS.Tags.IsPlayer);
        const isAlive = RblxECS.Tag.has(entity, ECS.Tags.IsAlive);
        
        if (isPlayer && isAlive) {
            results.push(entity);
        }
    }
    
    return results;
}

// Query all damageable entities
function queryDamageableEntities(allEntities: EntityHandle[]): EntityHandle[] {
    const results: EntityHandle[] = [];
    
    for (const entity of allEntities) {
        const hasHealth = RblxECS.Component.get(entity, ECS.Components.Health) !== undefined;
        
        if (hasHealth) {
            results.push(entity);
        }
    }
    
    return results;
}
```

### Complete Game Loop Example

```ts
import { RunService } from "@rbxts/services";
import { RblxECS } from "@rbxts/rblx-ecs";
import { ECS } from "./ecs-registry";

// Entity storage
const allEntities: EntityHandle[] = [];

// Create some entities
function initializeWorld() {
    // Spawn player
    const player = createPlayer(new Vector3(0, 5, 0));
    allEntities.push(player);
    
    // Spawn enemies
    for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * math.pi * 2;
        const x = math.cos(angle) * 20;
        const z = math.sin(angle) * 20;
        const enemy = createEnemy(new Vector3(x, 5, z), 50);
        allEntities.push(enemy);
    }
}

// Game loop
RunService.Heartbeat.Connect((deltaTime) => {
    // Query entities for each system
    const movableEntities = queryMovableEntities(allEntities);
    const livingEntities = allEntities.filter(e => 
        RblxECS.Tag.has(e, ECS.Tags.IsAlive)
    );
    const damageableEntities = queryDamageableEntities(allEntities);
    
    // Run systems
    movementSystem(movableEntities, deltaTime);
    healthRegenSystem(livingEntities, 1.0);
    damageSystem(damageableEntities);
    
    // Clean up dead entities (optional)
    for (let i = allEntities.size() - 1; i >= 0; i--) {
        const entity = allEntities[i];
        if (!RblxECS.Tag.has(entity, ECS.Tags.IsAlive)) {
            RblxECS.Entity.destroyEntity(entity);
            allEntities.remove(i);
        }
    }
});

// Initialize
initializeWorld();
```

---

## Performance Considerations

### Memory Layout

- **Components**: Stored in dense arrays grouped by type, providing excellent cache locality during iteration
- **Lookup**: Sparse arrays enable O(1) entity-to-component resolution without iterating
- **Removal**: Swap-and-pop maintains array density without leaving holes

### Best Practices

1. **Batch Operations**: Process entities in systems rather than one-by-one
2. **Component Reuse**: Prefer updating components over remove+add when possible
3. **Tag Filtering**: Use tags for quick entity categorization before component checks
4. **Entity Pooling**: Reuse destroyed entity IDs automatically via the free pool
5. **Type Safety**: Leverage TypeScript's type system to catch errors at compile-time

### When to Use Tags vs Components

**Use Tags when:**
- You need a boolean flag with no associated data
- Filtering entities for system processing
- Implementing simple state machines
- Marking entities for batch operations

**Use Components when:**
- You need to store data with the entity
- The data might change over time
- You need type-safe access to structured information

---

## Repository Layout

```
rblx-ecs/
├── src/
│   ├── index.ts              # Library entry (re-exports)
│   ├── rblx-ecs.ts           # Core ECS implementation
│   ├── types/
│   │   ├── component.d.ts    # StrictComponent and StrictTag types
│   │   └── entity.d.ts       # EntityHandle type definition
│   └── utils/
│       ├── logger.ts         # Debug logging utilities
│       └── isEntityValid.ts  # Entity validation helper
├── package.json
├── tsconfig.json
└── README.md
```

---

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Credits

Built with ❤️ for the Roblox-TS community.