import { EntityHandle } from "../types/entity";

export function isEntityValid(entityHandle: EntityHandle, generationsArray: number[]) {
    const [ entityId, generation ] = entityHandle;
    return generationsArray[entityId] === generation;
}