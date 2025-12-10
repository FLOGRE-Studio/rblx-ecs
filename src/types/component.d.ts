import { EntityId } from "./entity";

export type StrictComponent<T> = number & { readonly __brand: T };

export type ComponentType = number;

export type IndexForDenseComponentArray = number;
export type ComponentDataTypeForDenseArray<T extends object, K extends keyof T> = T[K];

export type DenseComponentsArray<T> = Array<T>;
export type SparseEntityToComponentsMap = Map<EntityId, IndexForDenseComponentArray>;

export type CallbackWithSelectedStrictComponentsArguments<T extends StrictComponent<any>[]> = (...args: { [K in keyof T]: T[K] extends StrictComponent<infer X> ? X | undefined: never }) => void;
export type CallbackWithSelectedStrictComponentsArgumentsAndReturnType<T extends StrictComponent<any>[]> = (...args: { [K in keyof T]: T[K] extends StrictComponent<infer X> ? X | undefined: never }) => NewStrictComponentsTupleReturnType<T>;


export type NewStrictComponentsTupleReturnType<T extends StrictComponent<any>[]> = { [K in keyof T]: T[K] extends StrictComponent<infer X> ? [number, X | undefined] : [number, never] }


export type ComponentsMap<T extends object> = Map<
    keyof T,
    [DenseComponentsArray<T[keyof T]>, SparseEntityToComponentsMap]
>;