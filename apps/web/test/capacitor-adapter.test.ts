import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  isCapacitorNative,
  getSecureToken,
  setSecureToken,
  removeSecureToken,
  setupCapacitorListeners,
} from '../src/lib/capacitor-adapter';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(),
    exitApp: vi.fn(),
  },
}));

beforeEach(() => { vi.stubGlobal('window', { Capacitor: Capacitor }); });

describe('Adaptador Capacitor e Armazenamento Seguro Mobile (Rule 17)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detecta ambiente web padrão quando não está em plataforma nativa', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    expect(isCapacitorNative()).toBe(false);
  });

  it('detecta ambiente mobile nativo quando executando no Capacitor', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    expect(isCapacitorNative()).toBe(true);
  });

  it('grava token de sessão no KeyStore/SharedPreferences nativos com segurança', async () => {
    await setSecureToken('token-jwt-assinado-123');
    expect(Preferences.set).toHaveBeenCalledWith({
      key: 'revezo_auth_token',
      value: 'token-jwt-assinado-123',
    });
  });

  it('recupera token de sessão do armazenamento seguro', async () => {
    vi.mocked(Preferences.get).mockResolvedValueOnce({ value: 'token-armazenado' });
    const token = await getSecureToken();
    expect(token).toBe('token-armazenado');
    expect(Preferences.get).toHaveBeenCalledWith({ key: 'revezo_auth_token' });
  });

  it('remove token seguro ao efetuar logout', async () => {
    await removeSecureToken();
    expect(Preferences.remove).toHaveBeenCalledWith({ key: 'revezo_auth_token' });
  });

  it('configura listeners de deep link e botão voltar nativo quando em plataforma nativa', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

    const removeBack = vi.fn();
    const removeUrl = vi.fn();
    vi.mocked(App.addListener).mockImplementation((event: string, callback: any) => {
      if (event === 'backButton') return Promise.resolve({ remove: removeBack }) as any;
      if (event === 'appUrlOpen') return Promise.resolve({ remove: removeUrl }) as any;
      return Promise.resolve({ remove: vi.fn() }) as any;
    });

    const cleanup = setupCapacitorListeners();
    // Allow dynamic import in the adapter to resolve
    await new Promise((r) => setTimeout(r, 0));

    expect(App.addListener).toHaveBeenCalledWith('backButton', expect.any(Function));
    expect(App.addListener).toHaveBeenCalledWith('appUrlOpen', expect.any(Function));

    cleanup();
  });
});
