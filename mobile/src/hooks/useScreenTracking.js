import { useEffect } from 'react';
import { analytics } from '../lib/analytics';

export function useScreenTracking(screenName) {
  useEffect(() => {
    analytics.screenView(screenName);
  }, [screenName]);
}
