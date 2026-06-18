export class HookBus {
  constructor() {
    this.listeners = new Map();
  }

  on(name, handler) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(handler);
    return () => this.off(name, handler);
  }

  off(name, handler) {
    const list = this.listeners.get(name) ?? [];
    this.listeners.set(name, list.filter((item) => item !== handler));
  }

  async emit(name, payload) {
    const list = this.listeners.get(name) ?? [];
    let current = payload;
    for (const handler of list) {
      const result = await handler(current);
      if (result !== undefined) current = result;
    }
    return current;
  }
}
