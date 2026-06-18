const DEFAULT_BINDINGS = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  shoot: 'Mouse0',
  reload: 'KeyR',
  pickup: 'KeyE',
  revive: 'KeyF',
  dropWeapon: 'KeyG',
  ammoDropModifier: 'KeyQ',
  ability: 'ShiftLeft',
  scoreboard: 'Tab',
  slot1: 'Digit1',
  slot2: 'Digit2',
  slot3: 'Digit3'
};

function loadBindings() {
  try {
    return { ...DEFAULT_BINDINGS, ...JSON.parse(localStorage.getItem('msk3d-bindings') ?? '{}') };
  } catch {
    return { ...DEFAULT_BINDINGS };
  }
}

function saveBindings(bindings) {
  localStorage.setItem('msk3d-bindings', JSON.stringify(bindings));
}

function eventCode(event) {
  if (event.type.startsWith('mouse')) return `Mouse${event.button}`;
  return event.code;
}

export function createInput({ onAction, onEscape, onScoreboard } = {}) {
  const keys = new Set();
  let bindings = loadBindings();
  let mouseShoot = false;
  let blocked = false;

  function actionForCode(code) {
    return Object.entries(bindings).find(([, value]) => value === code)?.[0] ?? null;
  }

  function emitAction(action) {
    if (blocked) return;
    if (action === 'reload') onAction?.({ type: 'reload' });
    if (action === 'pickup') onAction?.({ type: 'pickup' });
    if (action === 'dropWeapon') onAction?.({ type: 'drop-weapon' });
    if (action === 'ability') onAction?.({ type: 'ability' });
    if (action === 'slot1') onAction?.({ type: 'switch-slot', slot: 0 });
    if (action === 'slot2') onAction?.({ type: 'switch-slot', slot: 1 });
    if (action === 'slot3') onAction?.({ type: 'switch-slot', slot: 2 });
  }

  const onKeyDown = (event) => {
    if (event.code === 'Escape') {
      event.preventDefault();
      onEscape?.();
      return;
    }
    const action = actionForCode(event.code);
    if (action === 'scoreboard') {
      event.preventDefault();
      onScoreboard?.(true);
      keys.add(event.code);
      return;
    }
    const ammoDropModifier = bindings.ammoDropModifier ?? 'KeyQ';
    const ammoByDigit = { Digit1: 'light', Digit2: 'shell', Digit3: 'energy', Digit4: 'heavy' };
    if (keys.has(ammoDropModifier) && ammoByDigit[event.code]) {
      event.preventDefault();
      onAction?.({ type: 'drop-magazine', ammoType: ammoByDigit[event.code] });
      keys.add(event.code);
      return;
    }
    keys.add(event.code);
    if (action && action !== 'ammoDropModifier') emitAction(action);
  };
  const onKeyUp = (event) => {
    const action = actionForCode(event.code);
    if (action === 'scoreboard') {
      event.preventDefault();
      onScoreboard?.(false);
    }
    keys.delete(event.code);
  };
  const onMouseDown = (event) => {
    const code = eventCode(event);
    if (bindings.shoot === code) mouseShoot = true;
    const action = actionForCode(code);
    if (action && action !== 'shoot') emitAction(action);
  };
  const onMouseUp = (event) => {
    if (bindings.shoot === eventCode(event)) mouseShoot = false;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    get bindings() { return { ...bindings }; },
    setBlocked(value) { blocked = Boolean(value); },
    updateBinding(action, code) {
      if (!DEFAULT_BINDINGS[action]) return;
      bindings = { ...bindings, [action]: code };
      saveBindings(bindings);
    },
    resetBindings() {
      bindings = { ...DEFAULT_BINDINGS };
      saveBindings(bindings);
    },
    snapshot(angle) {
      const pressed = (action) => {
        const code = bindings[action];
        if (code?.startsWith('Mouse')) return action === 'shoot' ? mouseShoot : false;
        return keys.has(code);
      };
      return {
        up: !blocked && pressed('up'),
        down: !blocked && pressed('down'),
        left: !blocked && pressed('left'),
        right: !blocked && pressed('right'),
        shoot: !blocked && (pressed('shoot') || keys.has('Space')),
        revive: !blocked && pressed('revive'),
        angle
      };
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    }
  };
}
