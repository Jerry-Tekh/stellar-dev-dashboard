import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'jest-axe';
import { behaviorAnalytics } from '../../lib/behaviorAnalytics';
import BehaviorAnalyticsDashboard from './BehaviorAnalyticsDashboard';

function renderDashboard() {
  return render(
    <MemoryRouter>
      <BehaviorAnalyticsDashboard />
    </MemoryRouter>
  );
}

describe('BehaviorAnalyticsDashboard', () => {
  beforeEach(() => {
    behaviorAnalytics.eraseData();
    vi.restoreAllMocks();
  });

  it('shows an actionable empty state before analytics is enabled', () => {
    renderDashboard();
    expect(screen.getByRole('heading', { name: 'Behavior & personalization' })).toBeInTheDocument();
    expect(screen.getByText('No behavior insights yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enable private analytics' }));
    expect(behaviorAnalytics.getConsent()).toMatchObject({
      status: 'granted',
      usage: true,
      personalization: true,
    });
  });

  it('allows personalization to be disabled independently', () => {
    behaviorAnalytics.setConsent(true, true);
    renderDashboard();
    fireEvent.click(screen.getByRole('tab', { name: 'Privacy & controls' }));
    const choices = screen.getAllByRole('checkbox');
    expect(choices).toHaveLength(2);
    fireEvent.click(choices[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Save choices' }));
    expect(behaviorAnalytics.getConsent()).toMatchObject({ usage: true, personalization: false });
    expect(screen.getByRole('status')).toHaveTextContent('Privacy choices saved.');
  });

  it('erases analytics after explicit confirmation', () => {
    behaviorAnalytics.setConsent(true, true);
    behaviorAnalytics.track({
      type: 'navigation',
      name: 'view:builder',
      properties: { tab: 'builder' },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDashboard();
    fireEvent.click(screen.getByRole('tab', { name: 'Privacy & controls' }));
    fireEvent.click(screen.getByRole('button', { name: 'Erase data' }));
    expect(behaviorAnalytics.getConsent().status).toBe('pending');
    expect(behaviorAnalytics.getEventCount()).toBe(0);
  });

  it('has no detectable accessibility violations', async () => {
    behaviorAnalytics.setConsent(true, true);
    const { container } = renderDashboard();
    expect((await axe(container)).violations).toEqual([]);
  });
});
