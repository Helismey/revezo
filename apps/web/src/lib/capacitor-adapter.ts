const TOKEN_KEY = 'revezo_auth_token';

/**
 * Verifica se a aplicação está rodando em um container nativo Capacitor (Android/iOS)
 */
export const isCapacitorNative = (): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    const win = window as any;
    return Boolean(typeof win.Capacitor !== 'undefined' && typeof win.Capacitor.isNativePlatform === 'function' && win.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
};

/**
 * Recupera o token de sessão do KeyStore (Android) / Keychain (iOS) com segurança (Rule 17)
 */
export const getSecureToken = async (): Promise<string | null> => {
  if (!isCapacitorNative()) return null;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    return value;
  } catch {
    return null;
  }
};

/**
 * Armazena o token de sessão no KeyStore/Keychain nativo criptografado pelo SO
 */
export const setSecureToken = async (token: string): Promise<void> => {
  if (!isCapacitorNative()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: TOKEN_KEY, value: token });
  } catch {
    // Ignora se não for suportado
  }
};

/**
 * Remove o token seguro ao efetuar logout
 */
export const removeSecureToken = async (): Promise<void> => {
  if (!isCapacitorNative()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key: TOKEN_KEY });
  } catch {
    // Ignora
  }
};

/**
 * Configura escuta de deep links (revezo://) e botão voltar nativo do Android
 */
export const setupCapacitorListeners = (onNavigate?: (path: string) => void): (() => void) => {
  if (!isCapacitorNative()) {
    return () => {};
  }

  let cleanupFn = () => {};

  import('@capacitor/app').then(({ App }) => {
    const backHandler = App.addListener('backButton', ({ canGoBack }: { canGoBack: boolean }) => {
      if (canGoBack && typeof window !== 'undefined') {
        window.history.back();
      } else {
        App.exitApp();
      }
    });

    const urlHandler = App.addListener('appUrlOpen', (event: { url: string }) => {
      try {
        // Exemplo: revezo://confirmar/token123 -> /confirmar/token123
        const path = event.url.replace(/^revezo:\/\/?/, '/');
        if (onNavigate && path) {
          onNavigate(path);
        }
      } catch (err) {
        console.warn('[Capacitor] Erro ao processar deep link:', err);
      }
    });

    cleanupFn = () => {
      backHandler.then((h: { remove: () => Promise<void> }) => h.remove()).catch(() => {});
      urlHandler.then((h: { remove: () => Promise<void> }) => h.remove()).catch(() => {});
    };
  }).catch(() => {});

  return () => {
    cleanupFn();
  };
};
