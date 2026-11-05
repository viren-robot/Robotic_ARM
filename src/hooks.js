import { useEffect, useReducer } from 'react';
import { subscribe, app } from './lib/controller.js';

// Re-render this component whenever the controller changes; components then read `app` directly.
export function useApp() {
  const [, bump] = useReducer(x => x + 1, 0);
  useEffect(() => subscribe(bump), []);
  return app;
}
