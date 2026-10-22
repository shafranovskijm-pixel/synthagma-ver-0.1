import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JournalCreationWizard } from '../JournalCreationWizard';

// Use the actual shared Radix Checkbox. Its checked-change event must not also
// reach the surrounding field card and toggle the same controlled value twice.
describe('journal wizard real preset checkbox interaction', () => {
  it('toggles once on the checkbox, unchecks, and keeps the card text and Next step working', () => {
    const complete = vi.fn();
    render(<JournalCreationWizard open onClose={() => {}} onComplete={complete} />);
    const notes = screen.getByRole('checkbox', { name: 'Примечания' });
    const next = screen.getByRole('button', { name: 'Далее' });
    expect(notes).not.toBeChecked();
    expect(next).toBeDisabled();

    fireEvent.click(notes, { detail: 1 });
    expect(notes).toBeChecked();
    expect(next).toBeEnabled();
    fireEvent.click(notes, { detail: 1 });
    expect(notes).not.toBeChecked();
    expect(next).toBeDisabled();

    fireEvent.click(screen.getByText('Примечания', { exact: true }));
    expect(notes).toBeChecked();
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(screen.getByLabelText('Название поля notes')).toHaveValue('Примечания');
    expect(complete).not.toHaveBeenCalled();
  });

  it('keeps other selected presets when a checkbox or its card is toggled and preserves the selection when going back', () => {
    render(<JournalCreationWizard open onClose={() => {}} onComplete={() => {}} />);
    const notes = screen.getByRole('checkbox', { name: 'Примечания' });
    const number = screen.getByRole('checkbox', { name: 'Номер документа' });
    const next = screen.getByRole('button', { name: 'Далее' });
    fireEvent.click(notes, { detail: 1 });
    fireEvent.click(screen.getByText('Номер документа', { exact: true }));
    expect(notes).toBeChecked();
    expect(number).toBeChecked();
    fireEvent.click(notes, { detail: 1 });
    expect(notes).not.toBeChecked();
    expect(number).toBeChecked();
    expect(next).toBeEnabled();

    fireEvent.click(screen.getByText('Номер документа', { exact: true }));
    expect(number).not.toBeChecked();
    expect(next).toBeDisabled();
    fireEvent.click(number, { detail: 1 });
    expect(number).toBeChecked();
    fireEvent.click(next);
    expect(screen.getByLabelText('Название поля doc_number')).toHaveValue('Номер документа');
    expect(screen.queryByLabelText('Название поля notes')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByRole('checkbox', { name: 'Номер документа' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Примечания' })).not.toBeChecked();
  });
});
