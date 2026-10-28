import React from 'react';
import '@testing-library/jest-dom/vitest';
import {afterEach,beforeEach,vi} from 'vitest';
import {cleanup} from '@testing-library/react';
vi.mock('@/components/ui/dialog',()=>({
 Dialog:({open,children}:any)=>open?<div role="dialog">{children}</div>:null,
 DialogContent:({children}:any)=><div>{children}</div>,
 DialogHeader:({children}:any)=><header>{children}</header>,
 DialogTitle:({children}:any)=><h2>{children}</h2>,
}));
vi.mock('@/components/ui/button',()=>({Button:({children,...props}:any)=><button {...props}>{children}</button>}));
vi.mock('@/components/ui/SigmaSpinner',()=>({SigmaSpinner:()=> <span aria-hidden="true"/>}));
// Exact public dummy from the existing timeout config; no .env or real configuration read.
beforeEach(()=>{vi.stubEnv('VITE_SUPABASE_URL','https://platform.example');vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn(()=>{throw Error('NETWORK_NOT_ALLOWED');}));});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();});
