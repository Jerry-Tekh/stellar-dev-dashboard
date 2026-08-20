import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { behaviorAnalytics } from '../../lib/behaviorAnalytics';
import AnalyticsConsentBanner from './AnalyticsConsentBanner';

describe('AnalyticsConsentBanner', () => {
  beforeEach(() => behaviorAnalytics.eraseData());

  it('has no detectable accessibility violations while consent is pending', async () => {
    const { container } = render(
      <MemoryRouter>
        <AnalyticsConsentBanner />
      </MemoryRouter>
    );

    expect((await axe(container)).violations).toEqual([]);
  });
});
