import { StrictComponent, StrictTag } from "./types/component";
import { EntityHandle } from "./types/entity";
import { RblxLogger } from "./utils/logger";
import { isEntityValid } from "./utils/isEntityValid";

/**
 * RblxECS
 *
 * A high-performance Entity Component System (ECS) implementation for Roblox-TS projects.
 *
 * ## Core Concepts
 * 
 * **Entities**: Unique identifiers represented as `[entityId, generation]` tuples.
 * - entityId: Numeric identifier that may be recycled after entity destruction
 * - generation: Counter incremented on each reuse to invalidate stale references
 * 
 * **Components**: Data containers stored in archetype-based storage:
 * - Dense array: Contiguous memory layout for fast iteration
 * - Sparse array: O(1) entity-to-component lookup
 * - Bidirectional mapping: O(1) component-to-entity resolution for swap-and-pop
 * 
 * **Tags**: Lightweight boolean markers for entity categorization without data overhead.
 * 
 * ## Performance Characteristics
 * - Entity creation: O(1) with ID recycling
 * - Component add/remove: O(1) using swap-and-pop
 * - Component lookup: O(1) via sparse array indexing
 * - Iteration: Cache-friendly via dense array storage
 */
export namespace RblxECS {
    /**
     * Monotonically increasing counter for entity ID allocation.
     * Only incremented when the free pool is empty.
     */
    let nextEntityId: number = 0;

    /**
     * Monotonically increasing counter for component type IDs.
     * Each call to createStrictComponent() increments this.
     */
    let nextComponentId: number = 0;

    /**
     * Monotonically increasing counter for tag type IDs.
     * Each call to createStrictTag() increments this.
     */
    let nextTagId: number = 0;

    /**
     * Active entity IDs in the system.
     * Contains only entity IDs that have been created and not yet destroyed.
     * Note: This array is only appended to during new entity creation, not when recycling.
     */
    const entities: number[] = [];

    /**
     * Generation counters indexed by entity ID.
     * Incremented each time an entity ID is destroyed and recycled.
     * Used to validate EntityHandle tuples and detect use-after-free.
     * 
     * Example: If entity ID 5 has been destroyed and recreated twice,
     * generationsArray[5] will be 2.
     */
    const generationsArray: number[] = [];

    /**
     * Pool of destroyed entity IDs available for reuse.
     * When an entity is destroyed, its ID is pushed here.
     * During entity creation, IDs are popped from this pool before allocating new ones.
     * This reduces memory fragmentation and keeps entity IDs compact.
     */
    const freeEntityIdsArray: number[] = [];

    /**
     * Component storage registry organized by component type ID.
     * 
     * Structure: Array<[DenseComponents, SparseEntityToIndex, DenseIndexToEntity]>
     * 
     * For each component type (indexed by StrictComponent<T> ID):
     * - [0] DenseComponents: Array<Record<string, unknown>> - Tightly packed component instances
     * - [1] SparseEntityToIndex: Map<number, number> - Maps entityId → index in dense array
     * - [2] SparseIndexToEntity: Map<number, number> - Maps dense array index → entityId
     * 
     * The third array enables O(1) swap-and-pop by quickly finding which entity
     * owns the component being swapped from the end of the dense array.
     */
    const components: Map<number, [Array<Record<string, unknown>>, Map<number, number>, Map<number, number>]> = new Map();

    /**
     * Tag storage registry organized by tag type ID.
     * 
     * Structure: Array<[DenseEntityIds, SparseEntityToIndex, DenseIndexToEntity]>
     * 
     * For each tag type (indexed by StrictTag ID):
     * - [0] DenseEntityIds: Array<number> - Tightly packed entity IDs with this tag
     * - [1] SparseEntityToIndex: Map<number, number> - Maps entityId → index in dense array
     * - [2] SparseIndexToEntity: Map<number, number> - Maps dense array index → entityId
     * 
     * Uses the same archetype pattern as components but stores only entity IDs
     * since tags carry no data payload.
     */
    const tags: Map<number, [Array<number>, Map<number, number>, Map<number, number>]> = new Map();

    /**
     * Event registry for component addition callbacks.
     * 
     * Maps entity handles [entityId, generation] to callback functions invoked
     * when a component is added to that entity.
     * 
     * @type Map<EntityHandle, (addedComponent: StrictComponent<unknown>) => void>
     * 
     * Callbacks are invoked via RblxECS.Component.add() after successful component attachment.
     */
    const onComponentAddedEventForEntities: Map<[number, number], (addedComponent: StrictComponent<unknown>) => void> = new Map(); 
    
    /**
     * Event registry for component removal callbacks.
     * 
     * Maps entity handles [entityId, generation] to callback functions invoked
     * when a component is removed from that entity.
     * 
     * @type Map<EntityHandle, (removedComponent: StrictComponent<unknown>) => void>
     * 
     * Callbacks are invoked via RblxECS.Component.remove() after successful component removal.
     */
    const onComponentRemovedEventForEntities: Map<[number, number], (removedComponent: StrictComponent<unknown>) => void> = new Map(); 
    
    /**
     * Event registry for component mutation callbacks.
     * 
     * Maps entity handles [entityId, generation] to callback functions invoked
     * when a component's data is mutably changed on that entity.
     * 
     * @type Map<EntityHandle, (changedComponent: StrictComponent<unknown>, changedData: unknown) => void>
     * 
     * Callbacks are invoked via RblxECS.Component.mutablyChange() after the mutation callback returns true.
     */
    const onComponentChangedEventForEntities: Map<[number, number], (changedComponent: StrictComponent<unknown>, changedData: unknown) => void> = new Map();

    /**
     * Event registry for tag addition callbacks.
     * 
     * Maps entity handles [entityId, generation] to callback functions invoked
     * when a tag is added to that entity.
     * 
     * @type Map<EntityHandle, (addedTag: StrictTag) => void>
     * 
     * Callbacks are invoked via RblxECS.Tag.add() after successful tag attachment.
     */
    const onTagAddedEventForEntities: Map<[number, number], (addedTag: StrictTag) => void> = new Map(); 
    
    /**
     * Event registry for tag removal callbacks.
     * 
     * Maps entity handles [entityId, generation] to callback functions invoked
     * when a tag is removed from that entity.
     * 
     * @type Map<EntityHandle, (removedTag: StrictTag) => void>
     * 
     * Callbacks are invoked via RblxECS.Tag.remove() after successful tag removal.
     */
    const onTagRemovedEventForEntities: Map<[number, number], (removedTag: StrictTag) => void> = new Map(); 

    /**
     * Debugging utilities for monitoring ECS operations.
     * Provides runtime logging and diagnostics during development.
     */
    export namespace Debugger {
        /**
         * Toggles debug logging for all ECS operations.
         * 
         * When enabled, operations like entity creation, component addition,
         * and entity destruction will output diagnostic information via RblxLogger.
         * 
         * @param value - True to enable debug output, false to disable
         * 
         * @example
         * ```typescript
         * RblxECS.Debugger.setIsDebugMode(true);
         * const entity = RblxECS.Entity.createEntity(); // Will log creation
         * ```
         */
        export function setIsDebugMode(value: boolean) {
            RblxLogger.Configuration.inDebugMode = value;
        }
    }

    /**
     * Entity lifecycle operations.
     * 
     * Handles creation, destruction, and validation of entity handles.
     * Implements generation-based validation to prevent use-after-free bugs.
     */
    export namespace Entity {
        /**
         * Creates a new entity and returns a handle for component attachment.
         * 
         * ## Generation Semantics
         * The generation counter prevents stale handle bugs. When entity ID 5
         * is destroyed and later reused:
         * - First creation: [5, 0]
         * - After destruction and recreation: [5, 1]
         * - Attempting to use [5, 0] will fail validation
         * 
         * @returns EntityHandle tuple [entityId, generation]
         * 
         * @example
         * ```typescript
         * const player = RblxECS.Entity.createEntity();
         * const enemy = RblxECS.Entity.createEntity();
         * // Each entity gets a unique handle
         * ```
         */
        export function createEntity(): EntityHandle {
            // Prioritize recycled IDs to keep the ID space compact
            if (freeEntityIdsArray.size() > 0) {
                const entityId = freeEntityIdsArray.shift()!;

                // Increment generation to invalidate old handles with this ID
                const generationIncremented = (generationsArray[entityId] ?? -1) + 1;
                generationsArray[entityId] = generationIncremented;

                return [entityId, generationIncremented];
            } else {
                // No recycled IDs available, allocate a fresh one
                const entityId = nextEntityId++;

                // Initialize generation counter for this new ID
                const generationIncremented = (generationsArray[entityId] ?? -1) + 1;
                generationsArray[entityId] = generationIncremented;

                // Track this ID in the global entities list
                entities.push(entityId);

                return [entityId, generationIncremented];
            }
        }

        /**
         * Destroys an entity and releases all associated resources.
         * 
         * ## Important Notes
         * - Does NOT remove the entity ID from the internal entities array
         * - After destruction, the entity ID may be immediately reused
         * - The old handle becomes permanently invalid due to generation mismatch
         * 
         * @param entityHandle - The entity to destroy
         * @returns False if handle was already stale, true otherwise
         * 
         * @example
         * ```typescript
         * const entity = RblxECS.Entity.createEntity();
         * RblxECS.Component.add(entity, Position, { x: 0, y: 0 });
         * RblxECS.Entity.destroyEntity(entity);
         * // entity handle is now invalid, Position component is removed
         * ```
         */
        export function destroyEntity(entityHandle: EntityHandle): boolean {
            const [entityId, generation] = entityHandle;

            // Verify this handle hasn't already been invalidated
            if (!isEntityValid(entityHandle, generationsArray)) {
                RblxLogger.logOutput(
                    "RblxECS.destroyEntity",
                    `Entity ID ${entityId} has already been destroyed. Ignoring duplicate destroy.`
                );
                return false;
            }

            for (const [componentType, _] of components) {
                // Remove component if present (no-op if entity doesn't have it)
                RblxECS.Component.remove(entityHandle, componentType as StrictComponent<unknown>);
            }

            for (const [tagType, _] of tags) {
                // Remove tag if present (no-op if entity doesn't have it)
                RblxECS.Tag.remove(entityHandle, tagType as StrictTag);
            }

            onComponentAddedEventForEntities.delete(entityHandle);
            onComponentRemovedEventForEntities.delete(entityHandle);
            onComponentChangedEventForEntities.delete(entityHandle);
            onTagAddedEventForEntities.delete(entityHandle);
            onTagRemovedEventForEntities.delete(entityHandle);

            // Increment generation to invalidate this handle
            const generationIncremented = generation + 1;

            // Return ID to free pool for recycling
            freeEntityIdsArray.push(entityId);
            generationsArray[entityId] = generationIncremented;

            return true;
        }
    }

    /**
     * Component management operations.
     * 
     * Provides type-safe component registration, attachment, retrieval, and removal.
     * Uses archetype-based storage with dense arrays for iteration and sparse arrays
     * for O(1) random access.
     */
    export namespace Component {
        /**
         * Registers a new component type and returns a type-safe identifier.
         * 
         * The returned StrictComponent<T> is a branded type that carries TypeScript
         * generic information about the component's data structure. This enables
         * compile-time type checking for all component operations.
         * 
         * @template T - The component data structure (must extend Record<string, unknown>)
         * @returns Unique numeric identifier branded with type T
         * 
         * @example
         * ```typescript
         * interface Position { x: number; y: number; z: number }
         * const Position = RblxECS.Component.createStrictComponent<Position>();
         * 
         * interface Velocity { dx: number; dy: number; dz: number }
         * const Velocity = RblxECS.Component.createStrictComponent<Velocity>();
         * 
         * // These are now type-safe - TypeScript knows their shapes
         * ```
         */
        export function createStrictComponent<T extends Record<string, unknown>>(): StrictComponent<T> {
            // Pre-increment to start IDs at 1 (0 might be reserved or falsy)
            return (nextComponentId += 1) as StrictComponent<T>;
        }

        /**
         * Retrieves a component instance from an entity.
         * 
         * Returns undefined if:
         * - Component type has never been registered
         * - Entity doesn't have this component attached
         * 
         * @returns Component data as readonly (readonly reference), or undefined
         * @throws Error if entity handle is stale
         * @remarks Do NOT mutate the returned value directly. Use `Component.mutablyChange`
         * when you need to perform in-place updates so change events and internal
         * bookkeeping remain correct.
         * 
         * @example
         * ```typescript
         * const position = RblxECS.Component.get(player, Position);
         * if (position) {
         *   print(`Player at (${position.x}, ${position.y}, ${position.z})`);
         * }
         * ```
         */
        export function get<T extends Record<string, unknown>>(
            entityHandle: EntityHandle,
            component: StrictComponent<T>
        ): Readonly<T> | undefined {
            const [entityId, _] = entityHandle;

            // Ensure handle hasn't been invalidated by entity destruction
            if (!isEntityValid(entityHandle, generationsArray)) {
                error(
                    `Failed to get component for entity ID ${entityId}. ` +
                    `Handle is stale (generation mismatch).`
                );
            }

            // Retrieve the storage bucket for this component type
            const componentEntry = components.get(component);

            if (componentEntry === undefined) {
                RblxLogger.errorOutput(
                    "RblxECS.Component.get",
                    `Component type ${component} has not been registered.`
                );
                return undefined;
            }

            const [componentsDenseArray, entityToComponentsSparseArray] = componentEntry;

            // Look up the dense array index for this entity
            const componentIndex = entityToComponentsSparseArray.get(entityId);

            if (componentIndex === undefined) {
                // Entity doesn't have this component
                return undefined;
            }

            // Return the component instance (cast is safe due to type branding)
            return componentsDenseArray[componentIndex] as T;
        }

        /**
         * Mutably modifies a component's data for a specific entity by invoking a callback function.
         * The callback is invoked with the component data, allowing in-place mutations to occur.
         * This also invokes all callbacks listening for a changed component for the specific entity.
         * 
         * @template T - The type of the component data, constrained to be an Record<string, unknown> type.
         * @param entityHandle - A handle referencing the entity whose component will be modified.
         * @param component - The component identifier to modify on the entity.
         * @param callback - A function invoked with the component data to perform mutations. Return value is unused.
         *
         * @returns void
         *
         * @throws Throws an error if the entity handle is stale or outdated.
         * @throws Throws an error if the component does not exist in the ECS system.
         * @throws Throws an error if the specified entity does not have the requested component.
         */
        export function mutablyChange<T extends Record<string, unknown>>(entityHandle: EntityHandle, component: StrictComponent<T>, callback: (data: T) => boolean): void {
            const [ entityId ] = entityHandle;
            if (!isEntityValid(entityHandle, generationsArray)) error(`Cannot mutably change a component data for the entity with the ID of ${entityId}. The entity itself is stale and outdated.`);

            const componentEntry = components.get(component);
            if (componentEntry === undefined) error(`Cannot mutably change a component data for the entity with the ID of ${entityId}. No such component with the ID of ${component} of any entity has been found to be modified.`);

            const [ denseArrayComponents, sparseArrayEntityToComponents ] = componentEntry;
            const componentIndex = sparseArrayEntityToComponents.get(entityId)!;
            
            const denseComponent = denseArrayComponents[componentIndex] as T;
            if (denseComponent === undefined) error(`Cannot mutably change a component data for the entity with the ID of ${entityId}. This entity has no such component to be modified.`);

            const isChanged = callback(denseComponent);

            // Does nothing if the component data is not changed (false).
            if (isChanged !== undefined) {
                // Invoke this callback if it exists for this entity.
                onComponentChangedEventForEntities.get(entityHandle)?.(component, denseArrayComponents[componentIndex]);
            }
        }

        /**
         * Attaches a component to an entity.
         * 
         * @template T - The component data type
         * @param entityHandle - The entity to attach to
         * @param componentType - The component type identifier
         * @param strictComponent - The component data instance
         * @throws Error if entity is stale or already has this component type
         * 
         * @example
         * ```typescript
         * const entity = RblxECS.Entity.createEntity();
         * RblxECS.Component.add(entity, Position, { x: 10, y: 20, z: 30 });
         * RblxECS.Component.add(entity, Velocity, { dx: 1, dy: 0, dz: 0 });
         * ```
         */
        export function add<T extends Record<string, unknown>>(
            entityHandle: EntityHandle,
            componentType: StrictComponent<T>,
            strictComponent: T
        ): void {
            const [entityId, generation] = entityHandle;

            // Validate handle before modifying storage
            if (!isEntityValid(entityHandle, generationsArray)) {
                error(
                    `Failed to add component to entity ID ${entityId}. ` +
                    `Handle is stale (generation mismatch).`
                );
            }

            const componentEntry = components.get(componentType);

            if (componentEntry === undefined) {
                // First time this component type is being used - initialize storage
                const denseArraycomponents = new Array<Record<string, unknown>>();
                const sparseArrayEntityToComponents = new Map<number, number>();
                const denseArrayComponentsToEntity = new Map<number, number>();

                // Add the component data
                denseArraycomponents.push(strictComponent);
                const newLastIndex = denseArraycomponents.size() - 1;

                // Establish bidirectional mapping
                sparseArrayEntityToComponents.set(entityId, newLastIndex);
                denseArrayComponentsToEntity.set(newLastIndex, entityId);

                // Register the storage bucket
                components.set(componentType, [
                    denseArraycomponents,
                    sparseArrayEntityToComponents,
                    denseArrayComponentsToEntity,
                ]);
            } else {
                // Component type already registered, add to existing storage
                const [
                    denseArraycomponents,
                    sparseArrayEntityToComponents,
                    denseArrayComponentsToEntity,
                ] = components.get(componentType)!;

                // Check if entity already has this component
                const index = sparseArrayEntityToComponents.get(entityId);
                if (index !== undefined) {
                    error(
                        `Failed to add component to entity ID ${entityId}. ` +
                        `Entity already has a component of type ${componentType}.`
                    );
                }

                // Append component to dense array
                denseArraycomponents.push(strictComponent);
                const lastIndex = denseArraycomponents.size() - 1;


                // Update both mappings
                sparseArrayEntityToComponents.set(entityId, lastIndex);
                denseArrayComponentsToEntity.set(lastIndex, entityId);
            }

            // Fire a callback for an added component if it exists.
            onComponentAddedEventForEntities.get(entityHandle)?.(componentType);
        }

        /**
         * Removes a component from an entity using swap-and-pop.
         * 
         * @param entityHandle - The entity to remove from
         * @param componentType - The component type to remove (numeric for internal use)
         * @returns True if removed, false if component wasn't present
         * @throws Error if entity handle is stale
         * 
         * @example
         * ```typescript
         * const removed = RblxECS.Component.remove(entity, Position);
         * if (removed) {
         *   print("Position component removed");
         * }
         * ```
         */
        export function remove<T>(entityHandle: EntityHandle, componentType: StrictComponent<T>): boolean {
            const [entityId] = entityHandle;

            // Validate handle before modifying storage
            if (!isEntityValid(entityHandle, generationsArray)) {
                error(`Failed to remove component from stale entity handle ${entityId}.`);
            }

            // Retrieve storage bucket for this component type
            const componentEntry = components.get(componentType);
            if (componentEntry === undefined) return false;

            const [
                denseArrayComponents,
                sparseArrayEntityToComponents,
                denseArrayComponentToEntity,
            ] = componentEntry;

            // Find the component's index in the dense array
            const indexOfComponentToRemove = sparseArrayEntityToComponents.get(entityId);
            if (indexOfComponentToRemove === undefined) return false;

            const lastIndexOfDenseArrayComponentToSwap = denseArrayComponents.size() - 1;

            // Only swap if we're not already removing the last element
            if (indexOfComponentToRemove !== lastIndexOfDenseArrayComponentToSwap) {
                // Find which entity owns the component at last index we're about to swap
                const entityIdToBeSwapped = denseArrayComponentToEntity.get(lastIndexOfDenseArrayComponentToSwap)!;

                // Swap components in dense array
                [
                    denseArrayComponents[indexOfComponentToRemove],
                    denseArrayComponents[lastIndexOfDenseArrayComponentToSwap],
                ] = [
                    denseArrayComponents[lastIndexOfDenseArrayComponentToSwap],
                    denseArrayComponents[indexOfComponentToRemove],
                ];

                // Update sparse mapping for the swapped component's owner
                sparseArrayEntityToComponents.set(entityIdToBeSwapped, indexOfComponentToRemove);

                // Update sparse component-to-entity mapping for last component -> swapped entity ID.
                denseArrayComponentToEntity.set(indexOfComponentToRemove, entityIdToBeSwapped);
            }

            // Remove the last element (which now contains the removed component)
            denseArrayComponents.pop();

            // Delete the entity ID to component reference as it'd still point to the removed component otherwise.
            sparseArrayEntityToComponents.delete(entityId);

            /**
            * Clean up the outdated reference between the component at last index and the respective entity ID as the swapped component mapping
            * (at index of removed component) has been updated to correctly point to the same entity ID.
            */
            denseArrayComponentToEntity.delete(lastIndexOfDenseArrayComponentToSwap);

            // Fire a callback for a removed component if it exists.
            onComponentRemovedEventForEntities.get(entityHandle)?.(componentType);

            return true;
        }
    }

    /**
     * Tag management operations.
     * 
     * Tags are lightweight boolean markers for entity categorization.
     * Unlike components, tags carry no data payload, making them ideal for
     * filtering entities (e.g., "IsAlive", "IsPlayer", "NeedsUpdate").
     * 
     * Uses the same archetype storage pattern as components but stores
     * only entity IDs instead of component data.
     */
    export namespace Tag {
        /**
         * Registers a new tag type and returns a unique identifier.
         * 
         * @returns Unique numeric tag identifier
         * 
         * @example
         * ```typescript
         * const IsAlive = RblxECS.Tag.createStrictTag();
         * const IsPlayer = RblxECS.Tag.createStrictTag();
         * const NeedsRendering = RblxECS.Tag.createStrictTag();
         * ```
         */
        export function createStrictTag(): StrictTag {
            // Pre-increment to start tag IDs at 1
            return (nextTagId += 1) as StrictTag;
        }

        /**
         * Checks if an entity has a specific tag.
         * 
         * @param entityHandle - The entity to check
         * @param tag - The tag to search for
         * @returns True if entity has the tag, false otherwise
         * 
         * @example
         * ```typescript
         * if (RblxECS.Tag.has(entity, IsAlive)) {
         *   // Process living entity
         * }
         * ```
         */
        export function has(entityHandle: EntityHandle, tag: StrictTag): boolean {
            const [entityId] = entityHandle;

            // Retrieve tag storage bucket
            const tagEntry = tags.get(tag);
            if (tagEntry === undefined) return false;

            const [arrayEntitiesWithThisTag, arrayEntityToTag] = tagEntry;

            // Find index in dense array via sparse mapping
            const tagIndex = arrayEntityToTag.get(entityId);
            if (tagIndex === undefined) return false;

            // Verify the entity ID is actually stored at this index
            return arrayEntitiesWithThisTag[tagIndex] !== undefined;
        }

        /**
         * Adds a tag to an entity.
         *
         * @param entityHandle - The entity to tag
         * @param tag - The tag to add
         * @returns True on success
         * @throws Error if entity is stale or already has this tag
         * 
         * @example
         * ```typescript
         * RblxECS.Tag.add(player, IsAlive);
         * RblxECS.Tag.add(player, IsPlayer);
         * ```
         */
        export function add(entityHandle: EntityHandle, tag: StrictTag): boolean {
            const [entityId] = entityHandle;

            // Validate handle before modifying storage
            if (!isEntityValid(entityHandle, generationsArray)) {
                error(
                    `Cannot add tag to entity ID ${entityId}. ` +
                    `Handle is stale (generation mismatch).`
                );
            }

            const tagEntry = tags.get(tag);

            if (tagEntry === undefined) {
                // First time this tag is being used - initialize storage
                const [arrayEntitiesWithThisTag, sparseMapEntityToTag, sparseMapTagToEntity] = [
                    new Array<number>(),
                    new Map<number, number>(),
                    new Map<number, number>(),
                ];

                // Add entity ID to dense array
                arrayEntitiesWithThisTag.push(entityId);
                const thisTagIndex = arrayEntitiesWithThisTag.size() - 1;

                // Establish bidirectional mapping
                sparseMapEntityToTag.set(entityId, thisTagIndex);
                sparseMapTagToEntity.set(thisTagIndex, entityId);

                // Register the storage bucket
                tags.set(tag, [arrayEntitiesWithThisTag, sparseMapEntityToTag, sparseMapTagToEntity]);

                // Fire a callback for an added tag if it exists.
                onTagAddedEventForEntities.get(entityHandle)?.(tag);

                return true;
            }

            // Tag already registered, add to existing storage
            const [arrayEntitiesWithThisTag, arrayEntityToTag, arrayTagToEntity] = tagEntry;

            // Check if entity already has this tag
            const tagFromEntityId = arrayEntityToTag.get(entityId);
            if (tagFromEntityId !== undefined) {
                error(
                    `Cannot add tag to entity ID ${entityId}. ` +
                    `Entity already has this tag.`
                );
            }

            // Append entity ID to dense array
            arrayEntitiesWithThisTag.push(entityId);
            const indexTag = arrayEntitiesWithThisTag.size() - 1;

            // Update both mappings
            arrayTagToEntity.set(indexTag, entityId);
            arrayEntityToTag.set(entityId, indexTag);

            // Fire a callback for an added tag if it exists.
            onTagAddedEventForEntities.get(entityHandle)?.(tag);

            return true;
        }

        /**
         * Removes a tag from an entity using swap-and-pop on the dense storage
         * while updating the accompanying sparse Maps.
         *
         * Invokes any registered `onTagRemovedEventForEntities` callback for the entity.
         *
         * @param entityHandle - The entity to untag
         * @param tag - The tag to remove
         * @returns True if removed, false if tag wasn't present
         * @throws Error if entity handle is stale
         *
         * @example
         * ```typescript
         * RblxECS.Tag.remove(enemy, IsAlive); // Enemy died
         * ```
         */
        export function remove(entityHandle: EntityHandle, tag: StrictTag) {
            const [entityId] = entityHandle;

            // Validate handle before modifying storage
            if (!isEntityValid(entityHandle, generationsArray)) {
                error(
                    `Cannot remove tag from entity ID ${entityId}. ` +
                    `Handle is stale (generation mismatch).`
                );
            }

            // Retrieve tag storage bucket
            const tagEntry = tags.get(tag);
            if (tagEntry === undefined) return false;

            const [arrayEntitiesWithThisTag, sparseMapEntityToTag, sparseMapTagToEntity] = tagEntry;

            // Find the entity's index in the dense array
            const indexTagToRemoveFromEntityId = sparseMapEntityToTag.get(entityId);
            if (indexTagToRemoveFromEntityId === undefined) return false;

            const lastIndexTag = arrayEntitiesWithThisTag.size() - 1;

            // Find which entity owns the tag we're about to swap
            const entityIdFromLastIndexTag = sparseMapTagToEntity.get(lastIndexTag)!;
            
            // Update sparse mapping for the entity being swapped
            sparseMapEntityToTag.set(entityIdFromLastIndexTag, indexTagToRemoveFromEntityId);
            sparseMapTagToEntity.set(indexTagToRemoveFromEntityId, entityIdFromLastIndexTag);

            // Swap entity IDs in dense array
            [
                arrayEntitiesWithThisTag[lastIndexTag],
                arrayEntitiesWithThisTag[indexTagToRemoveFromEntityId],
            ] = [
                arrayEntitiesWithThisTag[indexTagToRemoveFromEntityId],
                arrayEntitiesWithThisTag[lastIndexTag],
            ];

            // Remove the last element (which now contains the removed entity ID)
            arrayEntitiesWithThisTag.pop();

            // Delete the entity ID mapping to the removed tag.
            sparseMapEntityToTag.delete(entityId);

            /**
            * Delete the index last tag mapping to the respective entity ID because other swapped tag mapping
            * (at the index of removed tag) has been updated to correctly map to the index of last tag.
            */
            sparseMapTagToEntity.delete(lastIndexTag);

            // Fire a callback for an added tag if it exists.
            onTagRemovedEventForEntities.get(entityHandle)?.(tag);

            return true;
        }
    }

    /**
     * Events
     *
     * Public API to register per-entity lifecycle callbacks for component and tag
     * operations. Each setter attaches a listener function keyed by the entity
     * handle tuple `[entityId, generation]` and will be invoked synchronously
     * by the corresponding `Component`/`Tag` operation when it occurs.
     *
     * Available listeners:
     * - `setComponentAddedForEntitySignalCallback(entityHandle, callback)` — called
     *   when a component is added to the given entity.
     * - `setComponentRemovedForEntitySignalCallback(entityHandle, callback)` — called
     *   when a component is removed from the given entity.
     * - `setComponentChangedForEntitySignalCallback(entityHandle, callback)` — called
     *   when a component's data is mutably changed via `Component.mutablyChange`.
     * - `setTagAddedForEntitySignalCallback(entityHandle, callback)` — called
     *   when a tag is added to the given entity.
     * - `setTagRemovedForEntitySignalCallback(entityHandle, callback)` — called
     *   when a tag is removed from the given entity.
     *
     * Notes:
     * - Callbacks are stored in internal Maps and are not automatically removed
     * - Callback invocation is synchronous and happens inside the operation that
     *   triggered the event.
     */
    export namespace Events {
        /**
            * Register a callback invoked when a component is added to the specified entity.
            *
            * @param entityHandle - Entity handle to attach the listener to.
            * @param callback - Function called with the component type that was added.
            */
        export function setComponentAddedForEntitySignalCallback(entityHandle: EntityHandle, callback: (addedComponent: StrictComponent<unknown>) => void) {
            onComponentAddedEventForEntities.set(entityHandle, callback);
        }

        /**
            * Register a callback invoked when a component is removed from the specified entity.
            *
            * @param entityHandle - Entity handle to attach the listener to.
            * @param callback - Function called with the component type that was removed.
            */
        export function setComponentRemovedForEntitySignalCallback(entityHandle: EntityHandle, callback: (removedComponent: StrictComponent<unknown>) => void) {
            onComponentRemovedEventForEntities.set(entityHandle, callback);
        }

        /**
            * Register a callback invoked when a component's data is mutably changed on the specified entity.
            *
            * @param entityHandle - Entity handle to attach the listener to.
            * @param callback - Function called with the component type and the changed data (payload depends on component).
            */
        export function setComponentChangedForEntitySignalCallback(entityHandle: EntityHandle, callback: (changedComponent: StrictComponent<unknown>, changedData: unknown) => void) {
            onComponentChangedEventForEntities.set(entityHandle, callback);
        }

        /**
            * Register a callback invoked when a tag is added to the specified entity.
            *
            * @param entityHandle - Entity handle to attach the listener to.
            * @param callback - Function called with the tag that was added.
            */
        export function setTagAddedForEntitySignalCallback(entityHandle: EntityHandle, callback: (addedTag: StrictTag) => void) {
            onTagAddedEventForEntities.set(entityHandle, callback);
        }

        /**
            * Register a callback invoked when a tag is removed from the specified entity.
            *
            * @param entityHandle - Entity handle to attach the listener to.
            * @param callback - Function called with the tag that was removed.
            */
        export function setTagRemovedForEntitySignalCallback(entityHandle: EntityHandle, callback: (removedTag: StrictTag) => void) {
            onTagRemovedEventForEntities.set(entityHandle, callback);
        }
    }
}