// Пример будущего мода. Его можно подключить в index.js и расширять игру без переписывания режимов.
export function installExampleMod(hooks) {
  hooks.on('player:damage', (event) => {
    // Пример: броня, баффы, сопротивления, модификаторы оружия.
    return event;
  });

  hooks.on('pve:room-enter', (event) => {
    // Пример: мод может читать комнату и врагов, а затем добавить ловушки или награды.
    return event;
  });

  hooks.on('pve:room-cleared', (event) => {
    // Пример: мод может выдать дополнительную награду после зачистки.
    return event;
  });
}
