import { describe, expect, it, vi } from 'vitest';
import {
  observePwaUpdates,
  SKIP_WAITING_MESSAGE,
} from './pwaUpdateManager';

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = 'installing';
  postMessage = vi.fn();
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
}

class FakeServiceWorkerContainer extends EventTarget {
  controller: FakeWorker | null = new FakeWorker();

  constructor(private readonly registration: FakeRegistration) {
    super();
  }

  register = vi.fn(async () => this.registration);
}

function asServiceWorkerContainer(container: FakeServiceWorkerContainer) {
  return container as unknown as ServiceWorkerContainer;
}

describe('observePwaUpdates', () => {
  it('expoe um worker que ja esta waiting como atualizacao disponivel', async () => {
    const registration = new FakeRegistration();
    registration.waiting = new FakeWorker();
    const container = new FakeServiceWorkerContainer(registration);
    const onUpdateAvailable = vi.fn();

    const controller = await observePwaUpdates({
      serviceWorker: asServiceWorkerContainer(container),
      onUpdateAvailable,
      reload: vi.fn(),
    });

    expect(container.register).toHaveBeenCalledWith('/sw.js', { type: 'module' });
    expect(onUpdateAvailable).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it('nao anuncia falsamente a primeira instalacao', async () => {
    const registration = new FakeRegistration();
    const container = new FakeServiceWorkerContainer(registration);
    container.controller = null;
    const onUpdateAvailable = vi.fn();
    const controller = await observePwaUpdates({
      serviceWorker: asServiceWorkerContainer(container),
      onUpdateAvailable,
      reload: vi.fn(),
    });
    const installing = new FakeWorker();

    registration.installing = installing;
    registration.dispatchEvent(new Event('updatefound'));
    installing.state = 'installed';
    registration.waiting = installing;
    installing.dispatchEvent(new Event('statechange'));

    expect(onUpdateAvailable).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('detecta worker instalado quando uma versao anterior controla a pagina', async () => {
    const registration = new FakeRegistration();
    const container = new FakeServiceWorkerContainer(registration);
    const onUpdateAvailable = vi.fn();
    const controller = await observePwaUpdates({
      serviceWorker: asServiceWorkerContainer(container),
      onUpdateAvailable,
      reload: vi.fn(),
    });
    const installing = new FakeWorker();

    registration.installing = installing;
    registration.dispatchEvent(new Event('updatefound'));
    installing.state = 'installed';
    registration.waiting = installing;
    installing.dispatchEvent(new Event('statechange'));

    expect(onUpdateAvailable).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it('acompanha um worker que ja esta installing quando a observacao comeca', async () => {
    const registration = new FakeRegistration();
    const installing = new FakeWorker();
    registration.installing = installing;
    const container = new FakeServiceWorkerContainer(registration);
    const onUpdateAvailable = vi.fn();
    const controller = await observePwaUpdates({
      serviceWorker: asServiceWorkerContainer(container),
      onUpdateAvailable,
      reload: vi.fn(),
    });

    installing.state = 'installed';
    registration.waiting = installing;
    installing.dispatchEvent(new Event('statechange'));

    expect(onUpdateAvailable).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it('nao anuncia installing inicial como atualizacao sem controller anterior', async () => {
    const registration = new FakeRegistration();
    const installing = new FakeWorker();
    registration.installing = installing;
    const container = new FakeServiceWorkerContainer(registration);
    container.controller = null;
    const onUpdateAvailable = vi.fn();
    const controller = await observePwaUpdates({
      serviceWorker: asServiceWorkerContainer(container),
      onUpdateAvailable,
      reload: vi.fn(),
    });

    installing.state = 'installed';
    registration.waiting = installing;
    installing.dispatchEvent(new Event('statechange'));

    expect(onUpdateAvailable).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('envia somente a mensagem conhecida ao solicitar atualizacao', async () => {
    const registration = new FakeRegistration();
    const waiting = new FakeWorker();
    registration.waiting = waiting;
    const container = new FakeServiceWorkerContainer(registration);
    const controller = await observePwaUpdates({
      serviceWorker: asServiceWorkerContainer(container),
      onUpdateAvailable: vi.fn(),
      reload: vi.fn(),
    });

    expect(controller.requestUpdate()).toBe(true);
    expect(waiting.postMessage).toHaveBeenCalledWith(SKIP_WAITING_MESSAGE);
    controller.dispose();
  });

  it('recarrega uma unica vez apos a troca de controller solicitada', async () => {
    const registration = new FakeRegistration();
    registration.waiting = new FakeWorker();
    const container = new FakeServiceWorkerContainer(registration);
    const reload = vi.fn();
    const controller = await observePwaUpdates({
      serviceWorker: asServiceWorkerContainer(container),
      onUpdateAvailable: vi.fn(),
      reload,
    });

    controller.requestUpdate();
    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));

    expect(reload).toHaveBeenCalledOnce();
    controller.dispose();
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('remove todos os listeners registrados durante o cleanup', async () => {
    const registration = new FakeRegistration();
    const installing = new FakeWorker();
    registration.installing = installing;
    const container = new FakeServiceWorkerContainer(registration);
    const removeRegistrationListener = vi.spyOn(registration, 'removeEventListener');
    const removeInstallingListener = vi.spyOn(installing, 'removeEventListener');
    const removeContainerListener = vi.spyOn(container, 'removeEventListener');
    const controller = await observePwaUpdates({
      serviceWorker: asServiceWorkerContainer(container),
      onUpdateAvailable: vi.fn(),
      reload: vi.fn(),
    });

    controller.dispose();

    expect(removeRegistrationListener).toHaveBeenCalledWith('updatefound', expect.any(Function));
    expect(removeInstallingListener).toHaveBeenCalledWith('statechange', expect.any(Function));
    expect(removeContainerListener).toHaveBeenCalledWith('controllerchange', expect.any(Function));
  });

  it('nao duplica o listener do mesmo worker installing', async () => {
    const registration = new FakeRegistration();
    const installing = new FakeWorker();
    registration.installing = installing;
    const addInstallingListener = vi.spyOn(installing, 'addEventListener');
    const container = new FakeServiceWorkerContainer(registration);
    const controller = await observePwaUpdates({
      serviceWorker: asServiceWorkerContainer(container),
      onUpdateAvailable: vi.fn(),
      reload: vi.fn(),
    });

    registration.dispatchEvent(new Event('updatefound'));
    registration.dispatchEvent(new Event('updatefound'));

    expect(
      addInstallingListener.mock.calls.filter(([eventName]) => eventName === 'statechange'),
    ).toHaveLength(1);
    controller.dispose();
  });
});
