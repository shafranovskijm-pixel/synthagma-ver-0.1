import { TextDecoder } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DrivingApp from '@/components/driving-school/DrivingApp';
import { linkedProgramVersion } from '@/lib/driving-school/program-version';
import type { DrivingAdapter, Row, State } from '@/lib/driving-school/types';
import { schoolState } from './fixtures';

const OLD_PROGRAM = 'synthetic-program-edition-old';
const NEW_PROGRAM = 'synthetic-program-edition-new';
function program(id: string, version: string, active = 1): Row<'program'> {
  return { id, kind: 'program', name: 'QA Same Name', active,
    data: { version, category: 'B', transmission: 'MT', practiceMinutes: 600 } };
}
function student(state: State): Row<'student'> {
  const value = state.resources.find((r): r is Row<'student'> => r.kind === 'student');
  if (!value) throw new Error('Synthetic fixture student missing');
  return value;
}
function stateWithPrograms(programs: Row<'program'>[], programId = OLD_PROGRAM): State {
  const state = schoolState();
  state.resources = [...programs, ...state.resources.filter(r => r.kind !== 'program')];
  student(state).data.programId = programId;
  return state;
}
function adapter(state: State) {
  return { load: vi.fn().mockResolvedValue(state), mutate: vi.fn(), canCreateStudents: true } satisfies DrivingAdapter;
}
function ui(value: DrivingAdapter) {
  return <MemoryRouter initialEntries={['/driving-school?view=students&student=student']}>
    <DrivingApp adapter={value} onExit={() => {}} />
  </MemoryRouter>;
}
function versionParagraph(version: string) {
  return screen.findByText((_text, element) => element?.tagName === 'P'
    && element.textContent?.includes('Версия программы: ' + version) === true);
}
async function openDraft() {
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Документы' }), { button: 0, ctrlKey: false });
  return screen.findByText('ЧЕРНОВИК · НЕ УТВЕРЖДЁН');
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('exact linked programme version display', () => {
  it('ASV01 keeps the exact historical UUID in student overview and draft despite a newer same-name programme', async () => {
    const state = stateWithPrograms([
      program(NEW_PROGRAM, '2026-new'), program(OLD_PROGRAM, ' 2024-bound ', 0),
    ]);
    const wrongKind: Row<'group'> = { id: OLD_PROGRAM, kind: 'group', name: 'Not a programme', active: 1,
      data: { programId: NEW_PROGRAM } };
    expect(linkedProgramVersion([wrongKind, ...state.resources], OLD_PROGRAM)).toBe('2024-bound');
    const value = adapter(state);
    render(ui(value));
    expect(await versionParagraph('2024-bound')).toBeTruthy();
    expect(screen.queryByText(/Версия программы: 2026-new/)).toBeNull();
    await openDraft();
    expect(await versionParagraph('2024-bound')).toBeTruthy();
    expect(screen.queryByText(/Версия программы: 2026-new/)).toBeNull();
    expect(state.resources.find(r => r.kind === 'program' && r.id === OLD_PROGRAM)?.active).toBe(0);
    expect(value.mutate).not.toHaveBeenCalled();
  });

  it('ASV02 reports an absent exact programme and a blank exact version instead of borrowing another edition', async () => {
    const missing = stateWithPrograms([program(NEW_PROGRAM, '2026-do-not-borrow')], 'missing-exact-id');
    expect(linkedProgramVersion(missing.resources, undefined)).toBe('программа не найдена');
    expect(linkedProgramVersion(missing.resources, 'missing-exact-id')).toBe('программа не найдена');
    const missingAdapter = adapter(missing);
    const view = render(ui(missingAdapter));
    expect(await versionParagraph('программа не найдена')).toBeTruthy();
    expect(screen.queryByText(/Версия программы: 2026-do-not-borrow/)).toBeNull();
    view.unmount();
    const blank = stateWithPrograms([program(NEW_PROGRAM, '2026-do-not-borrow'), program(OLD_PROGRAM, ' \t\n ')]);
    expect(linkedProgramVersion(blank.resources, OLD_PROGRAM)).toBe('не указана');
    const blankAdapter = adapter(blank);
    render(ui(blankAdapter));
    expect(await versionParagraph('не указана')).toBeTruthy();
    expect(screen.queryByText(/Версия программы: 2026-do-not-borrow/)).toBeNull();
    expect(missingAdapter.mutate).not.toHaveBeenCalled();
    expect(blankAdapter.mutate).not.toHaveBeenCalled();
  });

  it('ASV03 appends the eighth escaped CSV column while retaining the first seven, BOM, filename and draft boundary', async () => {
    const version = ' =SUM("1";"2") ';
    const state = stateWithPrograms([program(OLD_PROGRAM, version)]);
    const bound = state.resources.find((r): r is Row<'program'> => r.kind === 'program')!;
    bound.name = 'QA Program "B"; basic';
    const record = student(state);
    record.name = '=QA "Student"; 1';
    record.data.email = 'qa@example.invalid';
    const start = Date.parse('2026-10-01T09:00:00Z');
    state.lessons = [{ id: 'synthetic-lesson', student_id: record.id, instructor_id: 'instructor', car_id: 'car',
      start, end: start + 45 * 60000, status: 'completed', actual_minutes: 45,
      topic: '=2+2 "practice"; note', note: '' }];
    const value = adapter(state);
    render(ui(value));
    expect(await versionParagraph('=SUM("1";"2")')).toBeTruthy();
    await openDraft();
    const blobs: Blob[] = [];
    let filename = '';
    const revoked = vi.fn();
    const StandardURL = URL;
    vi.stubGlobal('URL', class extends StandardURL {
      static createObjectURL(object: Blob | MediaSource) {
        if (!(object instanceof Blob)) throw new Error('Expected actual CSV Blob');
        blobs.push(object);
        return 'blob:synthetic-as004-csv';
      }
      static revokeObjectURL = revoked;
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      filename = this.download;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Журнал CSV' }));
    expect(filename).toBe('zhurnal-praktiki.csv');
    expect(blobs).toHaveLength(1);
    const blob = blobs[0];
    expect(blob.type).toBe('text/csv;charset=utf-8');
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    const date = new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
    }).format(start);
    const legacySevenHeader = '"ФИО";"Email";"Программа";"Начало";"Статус";"Факт минут";"Тема"';
    const legacySevenRow = '"\'=QA ""Student""; 1";"qa@example.invalid";"QA Program ""B""; basic";"'
      + date + '";"Проведено";"45";"\'=2+2 ""practice""; note"';
    expect(csv).toBe('\uFEFF' + legacySevenHeader + ';"Версия программы"\r\n'
      + legacySevenRow + ';"\'=SUM(""1"";""2"")"');
    expect(value.mutate).not.toHaveBeenCalled();
    await waitFor(() => expect(revoked).toHaveBeenCalledWith('blob:synthetic-as004-csv'), { timeout: 2500 });
  });
});
