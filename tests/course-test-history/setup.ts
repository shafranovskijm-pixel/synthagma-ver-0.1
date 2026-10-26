import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { ports } from './client.port';
beforeEach(()=>{ports.calls.length=0;ports.fetchCalls=0;vi.stubGlobal('fetch',()=>{ports.fetchCalls++;throw new Error('NETWORK_NOT_ALLOWED');});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
