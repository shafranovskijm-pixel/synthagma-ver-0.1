import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoIdentification } from '../useVideoIdentification';

const mocks = vi.hoisted(() => ({ from: vi.fn(), bucket: vi.fn(), upload: vi.fn(), rpc: vi.fn(), toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc, storage: { from: mocks.bucket } } }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
const challenge = { challengeId: 'challenge-a', bucket: 'final-test-photos' as const, path: 'user-a/challenge-a.jpg' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bucket.mockReturnValue({ upload: mocks.upload });
  mocks.upload.mockResolvedValue({ data: {}, error: null });
  mocks.rpc.mockResolvedValue({ data: { completed: true, challengeId: challenge.challengeId }, error: null });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: async () => new Blob(['photo'], { type: 'image/jpeg' }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function photoHarness() {
  const verified = vi.fn();
  const hook = renderHook(() => useVideoIdentification({ userId: 'user-a', isOpen: true, finalTestPhoto: challenge, onVerified: verified }));
  hook.result.current.videoRef.current = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
  hook.result.current.canvasRef.current = { width: 0, height: 0, getContext: () => ({ translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(), setTransform: vi.fn() }), toDataURL: () => 'data:image/jpeg;base64,photo' } as unknown as HTMLCanvasElement;
  act(() => hook.result.current.capturePhoto());
  return { ...hook, verified };
}

describe('camera photo for a final test', () => {
  it('uses a fresh photo and server-owned private path without changing profile or generic identification', async () => {
    const { result, verified } = photoHarness();
    expect(result.current.step).toBe('confirm');
    expect(result.current.verificationHistory).toEqual([]);
    await act(async () => { await result.current.confirmPhoto(); });
    expect(mocks.bucket).toHaveBeenCalledWith('final-test-photos');
    expect(mocks.upload).toHaveBeenCalledWith(challenge.path, expect.any(Blob), { contentType: 'image/jpeg', upsert: false });
    expect(mocks.rpc).toHaveBeenCalledWith('complete_final_test_photo', { p_challenge_id: challenge.challengeId });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(verified).toHaveBeenCalledTimes(1);
  });

  it.each(['400', '403', '409'])('recovers an ambiguous upload (%s) only through server confirmation of that object', async statusCode => {
    mocks.upload.mockResolvedValue({ error: { statusCode, message: 'already exists or response lost' } });
    const { result, verified } = photoHarness();
    await act(async () => { await result.current.confirmPhoto(); });
    expect(verified).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('recovers a rejected network response when the server confirms the uploaded object', async () => {
    mocks.upload.mockRejectedValue(new Error('Network response lost'));
    const { result, verified } = photoHarness();
    await act(async () => { await result.current.confirmPhoto(); });
    expect(verified).toHaveBeenCalledTimes(1);
  });

  it('retains the same preview after an ambiguous upload and disallows replacing the immutable photo', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Network response lost' } });
    const { result, verified } = photoHarness();
    const photo = result.current.capturedPhoto;
    await act(async () => { await result.current.confirmPhoto(); });
    act(() => result.current.retakePhoto());
    expect(result.current.photoLocked).toBe(true);
    expect(result.current.capturedPhoto).toBe(photo);
    expect(result.current.step).toBe('confirm');
    expect(verified).not.toHaveBeenCalled();
  });

  it('does not advance to testing when completion returns after closing the dialog', async () => {
    let resolve!: (value: unknown) => void;
    mocks.rpc.mockImplementation(() => new Promise(done => { resolve = done; }));
    const { result, verified } = photoHarness();
    let pending!: Promise<void>;
    act(() => { pending = result.current.confirmPhoto(); });
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    act(() => result.current.handleClose());
    await act(async () => { resolve({ data: { completed: true, challengeId: challenge.challengeId }, error: null }); await pending; });
    expect(verified).not.toHaveBeenCalled();
  });

  it('never reports success when evidence expired or was rejected', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Final test photo expired' } });
    const { result, verified } = photoHarness();
    await act(async () => { await result.current.confirmPhoto(); });
    expect(verified).not.toHaveBeenCalled();
    expect(result.current.step).toBe('confirm');
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('Время подтверждения истекло'));
  });

  it('stops the camera when the dialog is removed', async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }], getVideoTracks: () => [{}] };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const { result, unmount } = renderHook(() => useVideoIdentification({ userId: 'user-a', isOpen: true, finalTestPhoto: challenge }));
    result.current.videoRef.current = { play: () => Promise.resolve() } as HTMLVideoElement;
    await act(async () => { await result.current.startCamera(); });
    await waitFor(() => expect(result.current.stream).toBe(stream));
    expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: false });
    unmount();
    expect(stop).toHaveBeenCalled();
  });
});
