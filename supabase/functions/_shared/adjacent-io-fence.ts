/** Request-local only. A fresh guard is never shared while it is in flight. */
export function adjacentIoFence<T>(fresh: () => Promise<T>, check: () => void) {
  let generation = 0;
  let cachedGeneration = -1;
  let cached!: T;
  let hasCached = false;
  let activeIO = 0;
  let activeFresh = 0;
  let freshCalls = 0;
  let reusedCalls = 0;
  const invalidate = () => { generation += 1; hasCached = false; };

  async function current(): Promise<T> {
    check();
    if (hasCached && cachedGeneration === generation && activeIO === 0 && activeFresh === 0) {
      reusedCalls += 1;
      return cached;
    }
    invalidate();
    const started = generation;
    activeFresh += 1;
    freshCalls += 1;
    let succeeded = false;
    let value!: T;
    try {
      value = await fresh();
      check();
      succeeded = true;
      return value;
    } finally {
      const reusable = succeeded && generation === started && activeIO === 0 && activeFresh === 1;
      activeFresh -= 1;
      invalidate();
      if (reusable) { cached = value; cachedGeneration = generation; hasCached = true; }
    }
  }

  async function io<V>(operation: () => PromiseLike<V> | V): Promise<V> {
    invalidate();
    activeIO += 1;
    try {
      check();
      return await operation();
    } finally {
      activeIO -= 1;
      invalidate();
    }
  }

  return {current, io, counts: () => ({fresh: freshCalls, reused: reusedCalls})};
}
