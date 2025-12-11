/**
 * A branded number type representing a strictly typed component identifier.
 * Prevents different component types from being mixed at compile time.
 */
export type StrictComponent<T> = number & { readonly __brand: T };

/** Numeric identifier for a component type. */
export type ComponentType = number;

/**
 * Extracts the data type of a specific component field from a component object type.
 * Used for strongly-typed access to component data in dense arrays.
 */
export type ComponentDataTypeForDenseArray<T extends object, K extends keyof T> = T[K];

/** A dense array storing component data of a single type for cache-efficient iteration. */
export type ComponentsDenseArray<T> = Array<T>;

/**
 * Sparse array mapping entity IDs to their indices in the components dense array.
 * Used for fast O(1) lookup of component data for a specific entity.
 */
export type EntityToComponentsSparseArray = Array<number>;

/**
 * Dense array mapping component indices back to their owning entity IDs.
 * Used for fast iteration and reverse lookups from components to entities.
 */
export type ComponentToEntityDenseArray = Array<number>;

/**
 * Callback function signature for systems operating on selected strict component types.
 * Each argument is either an instance of the component or undefined if the entity lacks that component.
 */
export type CallbackWithSelectedStrictComponentsArguments<T extends StrictComponent<any>[]> = (...args: { [K in keyof T]: T[K] extends StrictComponent<infer X> ? X | undefined: never }) => void;

/**
 * Callback function signature that returns new components to be added to an entity.
 * Used in systems that both read and write components.
 * Returns tuples of [component type ID, component data or undefined].
 */
export type CallbackWithSelectedStrictComponentsArgumentsAndReturnType<T extends StrictComponent<any>[]> = (...args: { [K in keyof T]: T[K] extends StrictComponent<infer X> ? X | undefined: never }) => NewStrictComponentsTupleReturnType<T>;

/**
 * Transform type that converts a tuple of StrictComponent types into a tuple of [componentId, componentData] pairs.
 * Used as the return type for callbacks that create new components.
 */
export type NewStrictComponentsTupleReturnType<T extends StrictComponent<any>[]> = { [K in keyof T]: T[K] extends StrictComponent<infer X> ? [number, X | undefined] : [number, never] }

/**
 * A map structure for efficient component storage and retrieval.
 * Each component type maps to its [dense array of components, sparse array of entity-to-component indices].
 */
export type ComponentsMap<T extends object> = Map<
    keyof T,
    [ComponentsDenseArray<T[keyof T]>, EntityToComponentsSparseArray]
>;