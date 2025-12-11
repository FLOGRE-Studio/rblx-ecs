import { EntityHandle } from "../types/entity";

/**
 * Validate an entity handle against the generations array.
 *
 * Entity handles are tuples `[entityId, generation]`.
 * When an entity id is recycled its generation is incremented; comparing
 * the generation in the handle with the current one prevents use-after-free.
 *
 * @param entityHandle - The handle to validate
 * @param generationsArray - Global generations array by entity id
 * @returns true if the handle's generation matches the current generation
 */
export function isEntityValid(entityHandle: EntityHandle, generationsArray: number[]) {
    const [ entityId, generation ] = entityHandle;
    return generationsArray[entityId] === generation;
}