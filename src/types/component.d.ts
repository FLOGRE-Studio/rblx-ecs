/**
 * A branded number type representing a strictly typed component identifier.
 * Prevents different component types from being mixed at compile time.
 */
export type StrictComponent<T> = number & { readonly __strictComponent: T };

export type StrictTag = number & { readonly __strictTag: never };
/**
 * Extracts the data type of a specific component field from a component object type.
 * Used for strongly-typed access to component data in dense arrays.
 */
export type ComponentDataTypeForDenseArray<T extends object, K extends keyof T> = T[K];

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
    [Array<T[keyof T]>,  Array<number>]
>;