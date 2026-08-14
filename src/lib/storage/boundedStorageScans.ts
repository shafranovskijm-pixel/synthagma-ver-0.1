const DEFAULT_STORAGE_SCAN_CONCURRENCY = 3;

export async function runBoundedStorageScans<T>(
  tasks: Array<() => Promise<T>>,
  concurrency = DEFAULT_STORAGE_SCAN_CONCURRENCY,
): Promise<T[]> {
  if (tasks.length === 0) return [];

  const workerCount = Math.min(tasks.length, Math.max(1, Math.floor(concurrency)));
  const results = new Array<T>(tasks.length);
  let nextTaskIndex = 0;

  const worker = async () => {
    while (nextTaskIndex < tasks.length) {
      const taskIndex = nextTaskIndex;
      nextTaskIndex += 1;
      results[taskIndex] = await tasks[taskIndex]();
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
