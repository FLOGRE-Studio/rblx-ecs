
/**
 * A handle that uniquely identifies an entity and prevents use-after-free bugs.
 * Consists of:
 * - EntityId: the index where the entity data is stored
 * - Generation: a counter incremented when the entity ID is recycled, ensuring handles become invalid after entity deletion
 */
export type EntityHandle = [number, number];