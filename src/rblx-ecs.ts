import { StrictComponent, ComponentType, ComponentsDenseArray, CallbackWithSelectedStrictComponentsArguments, NewStrictComponentsTupleReturnType, EntityToComponentsSparseArray, ComponentToEntityDenseArray } from "./types/component";
import { EntityHandle } from "./types/entity";
import { RblxLogger } from "./utils/logger";
import { isEntityValid } from "./utils/isEntityValid";

/**
 * RblxECS
 *
 * Compact Entity Component System core for Roblox-TS projects.
 *
 * Concepts:
 * - Entities are represented as `[entityId, generation]` handles. Generations detect stale handles.
 * - Components are stored in dense arrays for fast iteration and mapped with sparse arrays for O(1) lookup.
 * - Event subscriptions use a bitmask per component-set to efficiently dispatch batched change notifications.
 */
export namespace RblxECS {
    /**
     * The next unique entity ID to be allocated.
     * Incremented when creating new entities; reused IDs come from freeEntityIdsArray instead.
     */
    let nextEntityId         : number     = 0;

    /**
     * Array of all currently active entity IDs.
     * Includes both newly created and recycled entities that haven't been destroyed.
     */
    const entities           : number[] = [];

    /**
     * Parallel array to entity IDs storing generation counters.
     * Incremented each time an entity ID is reused after destruction.
     * Used to validate EntityHandles and detect stale references.
     */
    const generationsArray   : number[]   = [];

    /**
     * Pool of entity IDs available for recycling.
     * When an entity is destroyed, its ID is returned here instead of being discarded,
     * reducing allocation pressure and maintaining stable ID ranges.
     */
    const freeEntityIdsArray       : number[]   = [];

    /**
     * Maps component change bitmasks to their associated callback functions.
     * A bitmask represents a specific set of component types. When any of those
     * components change on an entity, all registered callbacks for that mask are invoked.
     * 
     * Structure: Map<bitmask, [callback1, callback2, ...]>
     */
    const componentsChangedSignalCallbacks: Array<Array<((...args: number[]) => void)>> = new Array();

    /**
     * Central registry of all component types and their storage structures.
     * 
     * For each registered component type, stores:
     * 1. ComponentsDenseArray: Contiguous array of component instances for cache efficiency
     * 2. SparseEntityToComponentsMap: Maps entity IDs to indices in the dense array
     * 
     * This hybrid structure provides O(1) lookups and O(1) removal while maintaining cache locality.
     */
    export const components: [ComponentsDenseArray<object>, EntityToComponentsSparseArray, ComponentToEntityDenseArray][] = [];

    /**
     * Debug utilities for the ECS system.
     * 
     * Provides logging and diagnostic capabilities to monitor and troubleshoot
     * ECS operations during development.
     */
    export namespace Debugger {
        /**
         * Enables or disables debug mode for the ECS logger.
         * 
         * When enabled, the logger will output detailed information about ECS operations
         * such as entity creation, destruction, and component modifications.
         * 
         * @param value - Whether debug mode should be enabled (true) or disabled (false)
         * 
         * @example
         * ```typescript
         * RblxECS.Debugger.setIsDebugMode(true); // Enable debug logging
         * ```
         */
        export function setIsDebugMode(value: boolean) {
            // Set debug mode for logging.
            RblxLogger.Configuration.inDebugMode = value;
        }
    }

    /**
     * Entity lifecycle management.
     * 
     * Handles creation, destruction, and validation of entities.
     * Maintains entity identity through generations and supports efficient ID recycling.
     */
    export namespace Entity {
        /**
         * Creates a new entity and returns its unique handle.
         * 
         * This function either recycles a freed entity ID or allocates a new one,
         * then increments its generation counter. The returned EntityHandle can be used
         * to add, remove, and query components throughout the entity's lifetime.
         * 
         * ## Allocation Strategy
         * 1. If free IDs are available in the pool, pop and recycle one
         * 2. Otherwise, allocate a new ID from the nextEntityId counter
         * 3. Increment the generation for the selected ID
         * 4. Add the ID to the global entities list (new IDs only)
         * 
         * ## Generation Tracking
         * Entity generations prevent use-after-free bugs. Each time an ID is reused,
         * its generation is incremented. Passing an outdated EntityHandle (with an old generation)
         * to any operation will fail validation, protecting against logic errors.
         * 
         * @returns {EntityHandle} A tuple [entityId, generation] uniquely identifying the new entity
         * 
         * @example
         * ```typescript
         * const entity = RblxECS.Entity.createEntity();
         * const [id, generation] = entity;
         * console.log(`Created entity ${id} at generation ${generation}`);
         * ```
         */
        export function createEntity(): EntityHandle {
            // Check if any previously freed entity IDs are available for reuse
            if (freeEntityIdsArray.size() > 0) {
                // Recycle an ID from the free list
                const entityId = freeEntityIdsArray.pop()!;

                // Increment the generation for this reused entity ID
                const generationIncremented = (generationsArray[entityId] ?? -1) + 1; 
                generationsArray[entityId] = generationIncremented;

                // Return the recycled entity's ID and updated generation
                return [entityId, generationIncremented];
            } else {
                // No reusable IDs; allocate a new entity ID
                const entityId = nextEntityId++;

                // Initialize the generation for this new entity ID
                const generationIncremented = (generationsArray[entityId] ?? -1) + 1; 
                generationsArray[entityId] = generationIncremented;

                // Register the new entity in the global entity list
                entities.push(entityId);

                // Return the new entity's ID and its initial generation
                return [entityId, generationIncremented];
            }
        }
        
        /**
         * Destroys an entity and frees its resources.
         * 
         * Removes all components attached to the entity, returns its ID to the free pool,
         * and increments its generation counter. After destruction, the entity ID may be
         * recycled for a new entity, rendering the old EntityHandle invalid.
         * 
         * ## Destruction Process
         * 1. Validates the entity handle (checks generation and existence)
         * 2. Iterates through all component types and removes matching components
         * 3. Uses swap-and-pop removal to maintain dense array structure
         * 4. Adds the entity ID back to the free pool
         * 5. Increments generation to invalidate the handle
         * 
         * ## Error Handling
         * If the entity has already been destroyed (stale handle), logs a warning
         * and returns false without performing any operations.
         * 
         * @param {EntityHandle} entityHandle - The handle of the entity to destroy
         * @returns {boolean} True if destruction succeeded, false if the handle was invalid/stale
         * 
         * @example
         * ```typescript
         * const entity = RblxECS.Entity.createEntity();
         * RblxECS.Entity.destroyEntity(entity); // Entity is now destroyed
         * // Using entity handle here would fail validation
         * ```
         */
        export function destroyEntity(entityHandle: EntityHandle) {
            const [ entityId, generation ] = entityHandle;
            if (!isEntityValid(entityHandle, generationsArray)) {
                RblxLogger.logOutput("RblxECS.destroyEntity", `The entity with ID of ${entityHandle[0]} has been destroyed already before. Ignoring this operation.`);
                return false;
            }

            for (let componentType = 0; componentType < components.size(); componentType++) {
                const componentBucket = components[componentType];

                if (componentBucket === undefined) {
                    RblxLogger.errorOutput("RblxECS.destroyEntity", `either componentsDenseArray or entityToComponentsSparseArray is undefined.`);
                    continue;
                }

                RblxECS.Component.remove(entityHandle, componentType);

            }

            const generationIncremented = generation + 1;

            freeEntityIdsArray.push(entityId);
            generationsArray[entityId] = generationIncremented;
        }
    }

    /**
     * Component attachment and querying.
     * 
     * Manages component registration, attachment to entities, and type-safe retrieval.
     * Supports adding, removing, and querying components with full TypeScript type safety.
     */
    export namespace Component {
        /**
         * Creates a branded StrictComponent type identifier.
         * 
         * This function creates a unique numeric identifier for a component type that carries
         * TypeScript generic information about the component's data structure. The identifier
         * is used internally for storage and lookup, while the generic type provides compile-time
         * type safety for component data.
         * 
         * ## Type Safety
         * The generic parameter T determines what data shape is associated with this component.
         * All operations using this StrictComponent ID will be type-checked against T.
         * 
         * @template T - The component data structure (must be an object type)
         * @param {number} id - A unique numeric identifier for this component type
         * @returns {StrictComponent<T>} A branded numeric type representing this component
         * 
         * @example
         * ```typescript
         * interface Position { x: number; y: number; z: number }
         * const Position = RblxECS.Component.createStrictComponent<Position>(0);
         * 
         * interface Velocity { x: number; y: number; z: number }
         * const Velocity = RblxECS.Component.createStrictComponent<Velocity>(1);
         * ```
         */
        export function createStrictComponent<T extends object>(id: number): StrictComponent<T> {
            return id as StrictComponent<T>;
        }
        
        /**
         * Retrieves a component from an entity.
         * 
         * Queries the component storage structures to find and return a component instance
         * attached to the given entity. Returns undefined if the entity doesn't have the component
         * or if the component type isn't registered.
         * 
         * ## Lookup Process
         * 1. Validates the entity handle (generation and existence)
         * 2. Looks up the component type in the storage map
         * 3. Uses the sparse map to find the component's index in the dense array
         * 4. Returns the component instance or undefined if not found
         * 
         * @template T - The component data type
         * @param {EntityHandle} entityHandle - The entity to query
         * @param {StrictComponent<T>} component - The component type to retrieve
         * @returns {T | undefined} The component instance if attached, undefined otherwise
         * 
         * @throws {Error} If the entity handle is stale or invalid
         * 
         * @example
         * ```typescript
         * const position = RblxECS.Component.get(entity, Position);
         * if (position) {
         *   console.log(`Entity at ${position.x}, ${position.y}, ${position.z}`);
         * }
         * ```
         */
        export function get<T extends object>(entityHandle: EntityHandle, component: StrictComponent<T>): Readonly<T> | undefined {
            const [ entityId, _ ] = entityHandle;
            if (!isEntityValid(entityHandle, generationsArray)) error(`Failed to add a component to the entity handle with the ID of ${entityId}, the entity handle itself is stale and outdated.`);
            
            // Look up the component entry for the provided type.
            const componentEntry = components[component];

            if (componentEntry === undefined) {
                RblxLogger.errorOutput("RblxECS.destroyEntity", `either ComponentsDenseArray or EntityToComponentsSparseArray is undefined.`);
                return undefined;
            }

            const [ComponentsDenseArray, EntityToComponentsSparseArray] = componentEntry;


            // Find the index of the component for this entity.
            const componentIndex = EntityToComponentsSparseArray[entityId];
            
            if (componentIndex === undefined) {
                return undefined;
            }

            // Return the component instance from the dense array.
            return ComponentsDenseArray[componentIndex] as T;
        }

        /**
         * Attaches a component instance to an entity.
         * 
         * Adds a component with the provided data to the given entity. If this is the first
         * time the component type is being added to any entity, initializes the storage structures.
         * Multiple components of the same type cannot be attached to one entity (subsequent calls overwrite).
         * 
         * ## Storage Mechanism
         * 1. Validates the entity handle
         * 2. Retrieves or initializes storage structures for the component type
         * 3. Appends the component data to the dense array
         * 4. Records the entity-to-index mapping in the sparse map
         * 5. Updates the global component registry
         * 
         * @template T - The component data type
         * @param {EntityHandle} entityHandle - The entity to attach to
         * @param {StrictComponent<T>} componentType - The component type identifier
         * @param {T} strictComponent - The component data instance
         * @returns {void}
         * 
         * @throws {Error} If the entity handle is stale or invalid
         * 
         * @example
         * ```typescript
         * const positionData = { x: 10, y: 20, z: 30 };
         * RblxECS.Component.add(entity, Position, positionData);
         * ```
         */
        export function add<T extends object>(entityHandle: EntityHandle, componentType: StrictComponent<T>, strictComponent: T): void {
            const [ entityId, generation ] = entityHandle;
            if (!isEntityValid(entityHandle, generationsArray)) error(`Failed to add a component to the entity handle with the ID of ${entityId}, the entity handle itself is stale and outdated.`);

            const componentEntry = components[componentType];

            if (componentEntry === undefined) {
                const denseArraycomponents           = new Array<object>();
                const sparseArrayEntityToComponents  = new Array<number>();
                const denseArrayComponentsToEntity   = new Array<number>();

                // Store the component data in the dense array.
                denseArraycomponents.push(strictComponent);
                const newLastIndex = denseArraycomponents.size() - 1;

                sparseArrayEntityToComponents[entityId]      = newLastIndex;
                denseArrayComponentsToEntity[newLastIndex]   = entityId;
                
                // Update the mapping for this component type.
                components[componentType] = [denseArraycomponents, sparseArrayEntityToComponents, denseArrayComponentsToEntity];
            } else {
                const [denseArraycomponents, sparseArrayEntityToComponents, denseArrayComponentsToEntity] = components[componentType];
                                
                const index = sparseArrayEntityToComponents[entityId];
                if (index !== undefined) error(`Failed to add a component to the entity handle with the ID of ${entityId}, the same component with the same type has already been added to it.`);

                // Store the component data in the dense array.
                denseArraycomponents.push(strictComponent);
                const lastIndex = denseArraycomponents.size() - 1;

                sparseArrayEntityToComponents[entityId] = lastIndex;
                denseArrayComponentsToEntity[lastIndex] = entityId;
            }
        }

        /**
         * Removes a component from an entity.
         * 
         * Detaches and deletes a component from the given entity. Uses swap-and-pop removal
         * to maintain the density of the component array and update affected mappings.
         * 
         * ## Removal Process
         * 1. Validates the entity handle
         * 2. Looks up the component in the storage structures
         * 3. Swaps the target component with the last element in the dense array
         * 4. Updates the mapping for the swapped component's owner entity
         * 5. Removes the component from all storage structures
         * 
         * ## Performance
         * Swap-and-pop ensures O(1) removal and maintains cache locality by keeping
         * all active components contiguous in memory.
         * 
         * @param {EntityHandle} entityHandle - The entity to remove from
         * @param {ComponentType} componentType - The component type to remove
         * @returns {boolean} True if removal succeeded, false if the entity didn't have the component
         * 
         * @throws {Error} If the entity handle is stale or invalid
         * 
         * @example
         * ```typescript
         * const removed = RblxECS.Component.remove(entity, Position);
         * console.log(removed ? "Component removed" : "Entity didn't have that component");
         * ```
         */
        export function remove(entityHandle: EntityHandle, componentType: ComponentType): boolean {
            const [ entityId ] = entityHandle;
            if (!isEntityValid(entityHandle, generationsArray)) error(`Failed to remove a component from stale entity handle ${entityId}.`);

            const componentEntry = components[componentType];
            if (componentEntry === undefined) return false;

            const [denseArrayComponents, sparseArrayEntityToComponents, denseArrayComponentToEntity] = componentEntry;

            const indexOfComponentToRemove = sparseArrayEntityToComponents[entityId];
            if (indexOfComponentToRemove === undefined) return false;

            const lastIndexOfDenseArrayComponentToSwap = denseArrayComponents.size() - 1;
            const lastIndexOfSpraseArrayEntityToSwap = sparseArrayEntityToComponents.size() - 1;

            if (indexOfComponentToRemove !== lastIndexOfDenseArrayComponentToSwap) {
                const entityIdToBeSwapped = denseArrayComponentToEntity[lastIndexOfDenseArrayComponentToSwap];
            
                // Component to remove swapped at its current index position with another component at the last index position.
                [denseArrayComponents[indexOfComponentToRemove], denseArrayComponents[lastIndexOfDenseArrayComponentToSwap]] =
                [denseArrayComponents[lastIndexOfDenseArrayComponentToSwap], denseArrayComponents[indexOfComponentToRemove]];

                sparseArrayEntityToComponents[entityIdToBeSwapped] = indexOfComponentToRemove;

                // Component to remove for entity (THIS entity) swapped at its current index position with another component for another entity at the last index position.
                [denseArrayComponentToEntity[indexOfComponentToRemove], denseArrayComponentToEntity[lastIndexOfDenseArrayComponentToSwap]] =
                [denseArrayComponentToEntity[lastIndexOfDenseArrayComponentToSwap], denseArrayComponentToEntity[indexOfComponentToRemove]]
            }

            // Remove the last element
            denseArrayComponents.pop();
            delete sparseArrayEntityToComponents[entityId];
            denseArrayComponentToEntity.pop();

            return true;
        }

        /**
         * Creates a [ComponentType, data] tuple for returning from batch modification callbacks.
         * 
         * This helper function wraps component type and data into the format expected
         * by batch modification callbacks, improving code clarity and type safety.
         * 
         * @template T - The component data type
         * @param {ComponentType} componentType - The component type identifier
         * @param {T} strictComponent - The component instance to return
         * @returns {[ComponentType, T]} A tuple suitable for batch callback returns
         * 
         * @example
         * ```typescript
         * return RblxECS.Component.returnNewComponent(Position, newPosition);
         * ```
         */
        export function returnNewComponent<T extends object>(componentType: ComponentType, strictComponent: T): [ComponentType, T] {
            return [componentType, strictComponent];
        }
    }

    /**
     * Component change event system.
     * 
     * Manages subscriptions to component modifications. Uses efficient bitmask-based
     * filtering to notify only interested listeners when relevant components change.
     */
    export namespace Events {
            /**
         * Subscribes a callback to be invoked when specified components change.
         * 
         * Registers a listener that fires whenever any of the subscribed component types
         * are modified on an entity through batch operations. The callback bitmask filters
         * notifications to match exactly the subscribed set.
         * 
         * ## Subscription Model
         * - Each unique set of component types gets its own callback list
         * - A bitmask represents the component set (bit N is set if component N is included)
         * - Callbacks are invoked with the modified component data in order
         * - Changes are only reported when components are modified via batch operations
         * 
         * ## Memory Management
         * The ECS maintains callback arrays per bitmask. Callbacks are never automatically
         * unsubscribed; consider this when creating listeners in loops or dynamic contexts.
         * 
         * @template T - Tuple of subscribed StrictComponent types
         * @param {Function} callback - Function invoked with modified component data
         * @param {...StrictComponent[]} componentsToSubscribeFor - Component types to listen for
         * @returns {void}
         * 
         * @example
         * ```typescript
         * RblxECS.Events.setComponentsChangedSignalCallback(
         *   (position, velocity) => {
         *     console.log(`Entity moved to ${position.x}, ${position.y}, ${position.z}`);
         *   },
         *   Position,
         *   Velocity
         * );
         * ```
         */
        export function setComponentsChangedSignalCallback<T extends StrictComponent<any>[]
        >(
            callback: CallbackWithSelectedStrictComponentsArguments<T>,
            ...componentsToSubscribeFor: [...T]
        ) {
            let mask = 0;
            for (const componentToSubscribeFor of componentsToSubscribeFor) {
                mask |= (1 << componentToSubscribeFor);
            }

            // At runtime, selected components are just numeric IDs hence we assert it to ...args: number[].
            const callbacksArray = componentsChangedSignalCallbacks[mask];
            if (callbacksArray === undefined) {
                const newCallbacksArray = new Array<(...args: number[]) => void>();
                newCallbacksArray.push(callback as (...args: number[]) => void);
                componentsChangedSignalCallbacks[mask] = newCallbacksArray;
                return;
            }

            callbacksArray.push(callback as (...args: number[]) => void);
        }
    }
}