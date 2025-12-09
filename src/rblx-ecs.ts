import RblxObject from "@rbxts/rblx-object-utils";
import { StrictComponent, ComponentType, DenseComponentsArray, SparseEntityToComponentsMap, ComponentsChangedSignalCallback } from "./types/component";
import { EntityHandle, EntityId } from "./types/entity";
import { RblxLogger } from "./utils/logger";
import { isEntityValid } from "./utils/isEntityValid";

export namespace RblxECS {
    let nextEntityId         : number     = 0;
    const entities           : EntityId[] = [];
    const generationsArray   : number[]   = [];
    const freeIdsArray       : number[]   = [];

    /**
     * Stores all registered component types with their dense arrays and sparse maps.
     */
    const components: Map<
        ComponentType,
        [DenseComponentsArray<object>, SparseEntityToComponentsMap]
    > = new Map();

    export namespace Debugger {
        /**
         * Enables or disables debug mode for the ECS logger.
         * @param value Whether debug mode should be enabled or not.
         */
        export function setIsDebugMode(value: boolean) {
            // Set debug mode for logging.
            RblxLogger.Configuration.inDebugMode = true;
        }
    }

    export namespace Entity {
        /**
         * Creates a new entity and returns its unique identifier and current generation.
         * 
         * This function will either recycle a free entity ID (if available) or allocate a new one.
         * Entity generations are incremented to help track whether a given ID is still valid
         * if it has been reused after destruction.
         * 
         * @returns [entityId, generation] - Tuple of the entity's unique identifier and its generation.
         * 
         * Implementation Details:
         * - The function first checks if there are any previously freed entity IDs
         *   in the 'freeIdsArray'. If so, it pops one from the array (recycling an ID).
         *   Otherwise, it uses and increments 'nextEntityId' to create a new unique ID.
         *
         * - For the selected ID, its generation counter is incremented (or set to 0 if not present).
         *   This generation is used to distinguish between different incarnations of the same numeric ID.
         * - When a new entity is created (not recycled), its ID is also appended to the master 'entities' array.
         */
        export function createEntity(): EntityHandle {
            // Check if any previously freed entity IDs are available for reuse
            if (freeIdsArray.size() > 0) {
                // Recycle an ID from the free list
                const id = freeIdsArray.pop()!;

                // Increment the generation for this reused entity ID
                const generationIncremented = (generationsArray[id] ?? -1) + 1; 
                generationsArray[id] = generationIncremented;

                // Return the recycled entity's ID and updated generation
                return [id, generationIncremented];
            } else {
                // No reusable IDs; allocate a new entity ID
                const id = nextEntityId++;

                // Initialize the generation for this new entity ID
                const generationIncremented = (generationsArray[id] ?? -1) + 1; 
                generationsArray[id] = generationIncremented;

                // Register the new entity in the global entity list
                entities.push(id);

                // Return the new entity's ID and its initial generation
                return [id, generationIncremented];
            }
        }
        
        export function destroyEntity(entityHandle: EntityHandle) {
            const [ entityId, generation ] = entityHandle;
            if (!isEntityValid(entityHandle, generationsArray)) {
                RblxLogger.logOutput("RblxECS.destroyEntity", `The entity with ID of ${entityHandle[0]} has been destroyed already before. Ignoring this operation.`);
                return false;
            }

            for (const [componentType, componentEntry] of components) {
                const [denseComponentsArray, sparseEntityToComponentsMap] = componentEntry;

                const componentIndex = sparseEntityToComponentsMap.get(entityId);

                if (componentIndex !== undefined) {
                    const lastArrayIndexDenseComponent = denseComponentsArray.size() - 1;

                    if (componentIndex !== lastArrayIndexDenseComponent) {
                        denseComponentsArray[componentIndex] = denseComponentsArray[lastArrayIndexDenseComponent];
                        [denseComponentsArray[componentIndex], denseComponentsArray[lastArrayIndexDenseComponent]] = [denseComponentsArray[lastArrayIndexDenseComponent],denseComponentsArray[componentIndex]]
                    }

                    denseComponentsArray.pop();
                    sparseEntityToComponentsMap.delete(entityId);
                }
            }

            const generationIncremented = generation + 1;

            freeIdsArray.push(entityId);
            generationsArray[entityId] = generationIncremented;
        }
    }

    export namespace Component {
        export function createStrictComponent<T extends object>(id: number): StrictComponent<T> {
            return id as StrictComponent<T>;
        }
        
        export function getComponent<T>(entityHandle: EntityHandle, component: StrictComponent<T>): T | undefined {
            const [ entityId, generation ] = entityHandle;
            if (!isEntityValid(entityHandle, generationsArray)) error(`Failed to add a component to the entity handle with the ID of ${entityId}, the entity handle itself is stale and outdated.`);
            
            // Look up the component entry for the provided type.
            const componentEntry = components.get(component);

            if (componentEntry === undefined) {
                return undefined;
            }

            const [denseComponentsArray, sparseEntityToComponentsMap] = componentEntry;

            // Find the index of the component for this entity.
            const componentIndex = sparseEntityToComponentsMap.get(entityId);
            
            if (componentIndex === undefined) {
                return undefined;
            }

            // Return the component instance from the dense array.
            return denseComponentsArray[componentIndex] as T;
        }

        export function addComponent<T extends object>(entityHandle: EntityHandle, componentType: StrictComponent<T>, StrictComponent: T): void {
            const [ entityId, generation ] = entityHandle;
            if (!isEntityValid(entityHandle, generationsArray)) error(`Failed to add a component to the entity handle with the ID of ${entityId}, the entity handle itself is stale and outdated.`);

            // Retrieve or initialize component storage structures.
            let denseComponentsArray: Array<object>;
            let sparseEntityToComponentsMap: Map<EntityId, number> = new Map();

            const componentsEntryIndexed = components.get(componentType);

            denseComponentsArray         = componentsEntryIndexed ? componentsEntryIndexed[0] : new Array();
            sparseEntityToComponentsMap  = componentsEntryIndexed ? componentsEntryIndexed[1] : new Map();

            // Store the component data in the dense array.
            denseComponentsArray.push(StrictComponent as object);
            sparseEntityToComponentsMap.set(entityId, denseComponentsArray.size() - 1);

            // Update the mapping for this component type.
            components.set(componentType, [denseComponentsArray, sparseEntityToComponentsMap]);
        }

        export function removeComponent(entityHandle: EntityHandle, componentType: ComponentType): boolean {
            const [ entityId, generation ] = entityHandle;
            if (!isEntityValid(entityHandle, generationsArray)) error(`Failed to add a component to the entity handle with the ID of ${entityId}, the entity handle itself is stale and outdated.`);

            // Look up the component entry.
            const componentEntry = components.get(componentType);

            if (!componentEntry) {
                return false;
            }

            const [denseComponentsArray, sparseEntityToComponentsMap] = componentEntry;

            // Find the index for this entity's component.
            const componentIndex = sparseEntityToComponentsMap.get(entityId);
            if (componentIndex === undefined) {
                return false;
            }

            // Remove the component data from the dense array
            // Swap with the last element and pop to keep array dense
            const lastIdx = denseComponentsArray.size();

            if (componentIndex !== lastIdx) {
                // Swap the element to remove with the last one
                denseComponentsArray[componentIndex] = denseComponentsArray[lastIdx];

                // Find which entity owns the last component and update its mapping
                const swappedEntityId = [...RblxObject.entries(sparseEntityToComponentsMap)]
                    .find(([_, idx]) => idx === lastIdx)?.[0];
                if (swappedEntityId !== undefined) {
                    sparseEntityToComponentsMap.set(swappedEntityId, componentIndex);
                }
            }
            
            // Remove the last component
            denseComponentsArray.pop();
            // Delete the removed component's mapping.
            sparseEntityToComponentsMap.delete(entityId);

            // Indicate this a successful removal.
            return true;
        }
    }


    // TODO: Add support for multiple components changed event.
    export namespace Events {
        const componentsChangedSignalCallbacks: ((...args: any[]) => void)[] = [];

        export function setComponentsChangedSignalCallback<T extends StrictComponent<any>[]
        >(
            callback: ComponentsChangedSignalCallback<T>,
            ...componentsToSubscribeFor: [...T]
        ) {
            componentsChangedSignalCallbacks.push(callback);
        }
    }
}