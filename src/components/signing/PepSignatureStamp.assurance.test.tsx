import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PepSignatureStamp } from './PepSignatureStamp';
it('shows saved facts without turning a badge into a verified legal signature or identity claim', () => {
  const view = render(<PepSignatureStamp fullName="Synthetic Recipient" email="synthetic@example.invalid" signedAt="2026-10-23T00:00:00Z" agreementId="00000000-0000-4000-8000-000000000001" documentHash={'a'.repeat(64)} />);
  expect(screen.getByText('Подтверждение в журнале')).toBeTruthy(); expect(screen.getByText('Synthetic Recipient')).toBeTruthy();
  expect(view.container.textContent).not.toContain('Простой электронной подписью (63-ФЗ)');
  expect(view.container.textContent).toContain('проверяются по отдельным материалам');
});
