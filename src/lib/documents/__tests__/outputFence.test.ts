import { afterEach, describe, expect, it } from 'vitest';
import { setOfflineAuthActor, observeOfflineAccess } from '@/utils/courseCache';
import { captureDocumentOutputFence } from '../outputFence';
afterEach(() => setOfflineAuthActor(null));
describe('document output fence', () => {
    it('blocks a same-user access downgrade before React updates', () => { setOfflineAuthActor('QA'); const current = captureDocumentOutputFence(); current(); observeOfflineAccess('QA', 'downgraded'); expect(current).toThrow('Доступ изменился'); });
    it('blocks an actor round trip and an anonymous-to-auth transition', () => { setOfflineAuthActor('QA-A'); const current = captureDocumentOutputFence(); setOfflineAuthActor('QA-B'); setOfflineAuthActor('QA-A'); expect(current).toThrow(); setOfflineAuthActor(null); const publicCurrent = captureDocumentOutputFence(); publicCurrent(); setOfflineAuthActor('QA-A'); expect(publicCurrent).toThrow(); setOfflineAuthActor(null); expect(publicCurrent).toThrow(); });
});
