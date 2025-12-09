import { EntityId } from "./entity";

export type StrictComponent<T> = number & { readonly __brand: T };

export type ComponentType = number;

export type IndexForDenseComponentArray = number;
export type ComponentDataTypeForDenseArray<T extends object, K extends keyof T> = T[K];

export type DenseComponentsArray<T> = Array<T>;
export type SparseEntityToComponentsMap = Map<EntityId, IndexForDenseComponentArray>;

export type ComponentsChangedSignalCallback<T extends StrictComponent<any>[]> = (...args: { [K in keyof T]: T[K] extends StrictComponent<infer X> ? X : never }) => void

export type ComponentsMap<T extends object> = Map<
    keyof T,
    [DenseComponentsArray<T[keyof T]>, SparseEntityToComponentsMap]
>;