// Serialize job mutations; result cleanup must wait until every pump write settles.
export const batchRuntime = { pumping: false };

let stateQueue: Promise<void> = Promise.resolve();

export function withBatchState<T>(operation: () => Promise<T>): Promise<T> {
  const result = stateQueue.then(operation);
  stateQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function requireSettledBatch(): void {
  if (batchRuntime.pumping) {
    throw new Error('The previous batch is still stopping. Try again when it has stopped.');
  }
}
