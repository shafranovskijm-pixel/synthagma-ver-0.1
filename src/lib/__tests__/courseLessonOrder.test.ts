import { describe, expect, it } from 'vitest';
import { orderCourseLessons } from '../courseLessonOrder';

const modules = [{ id: 'm2', order_index: 1 }, { id: 'm1', order_index: 0 }];
const lesson = (id: string, order_index: number, module_id: string | null = null) => ({ id, order_index, module_id });
const ids = (rows: { id: string }[]) => rows.map(row => row.id);

describe('course lesson order', () => {
  it('places three M1 items before five M2 items even when their flat indexes put M2 first', () => {
    const input = [
      lesson('2.1', 0, 'm2'), lesson('S2', 1, 'm2'), lesson('test2', 2, 'm2'),
      lesson('final-work', 3, 'm2'), lesson('final-test', 4, 'm2'),
      lesson('1.1', 5, 'm1'), lesson('S1', 6, 'm1'), lesson('test1', 7, 'm1'),
    ];
    expect(ids(orderCourseLessons(input, modules))).toEqual([
      '1.1', 'S1', 'test1', '2.1', 'S2', 'test2', 'final-work', 'final-test',
    ]);
  });

  it('keeps the global lesson-index order for legacy courses without module definitions', () => {
    const legacy = [lesson('first', 0), lesson('second', 1, 'old-module'), lesson('third', 2)];
    expect(orderCourseLessons(legacy, [])).toEqual(legacy);
    expect(ids(orderCourseLessons([legacy[2], legacy[0], legacy[1]], []))).toEqual(['first', 'second', 'third']);
  });

  it('retains unassigned and unknown-module lessons after known modules in flat order', () => {
    expect(ids(orderCourseLessons([
      lesson('unknown', 1, 'missing'), lesson('unassigned', 0), lesson('known', 8, 'm1'),
    ], modules))).toEqual(['known', 'unassigned', 'unknown']);
  });

  it('keeps tied modules grouped in input order and tied lessons stable', () => {
    const tied = [{ id: 'b', order_index: 0 }, { id: 'a', order_index: 0 }];
    expect(ids(orderCourseLessons([
      lesson('a-first', 0, 'a'), lesson('b-later', 1, 'b'),
      lesson('b-first', 0, 'b'), lesson('b-second-tied', 0, 'b'),
    ], tied))).toEqual(['b-first', 'b-second-tied', 'b-later', 'a-first']);
  });

  it('does not mutate the frozen input, modules, objects, or stored indexes', () => {
    const a = Object.freeze(lesson('a', 9, 'm1'));
    const b = Object.freeze(lesson('b', 0, 'm2'));
    const input = Object.freeze([b, a]);
    const frozenModules = Object.freeze(modules.map(m => Object.freeze({ ...m })));
    const result = orderCourseLessons(input, frozenModules);
    expect(result).toEqual([a, b]);
    expect(result).not.toBe(input);
    expect(result[0]).toBe(a);
    expect(input).toEqual([b, a]);
    expect(a.order_index).toBe(9);
    expect(frozenModules.map(m => m.id)).toEqual(['m2', 'm1']);
  });
});
