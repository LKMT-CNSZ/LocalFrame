'use strict';
// Only caller supplied field IDs are persisted. Passwords, files and consent are rejected.
const LastSettings = (() => {
  function valid(element, value) {
    if (!element || typeof value !== 'string' || element.type === 'password' || element.type === 'file' || element.type === 'checkbox') return false;
    if (element.tagName === 'SELECT') return [...element.options].some(option => option.value === value && !option.disabled);
    if (element.type === 'number' || element.type === 'range') {
      const number = Number(value);
      return value.trim() !== '' && Number.isFinite(number) && (!element.min || number >= Number(element.min)) && (!element.max || number <= Number(element.max));
    }
    return !element.maxLength || element.maxLength < 0 || value.length <= element.maxLength;
  }
  function create(key, ids, root = document, storage = localStorage) {
    const elements = ids.map(id => root.getElementById(id)).filter(Boolean);
    function read() {
      try { const data = JSON.parse(storage.getItem(key) || '{}'); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; } catch { return {}; }
    }
    function restore(onlyIds = ids) {
      const data = read();
      for (const id of onlyIds) {
        const element = root.getElementById(id);
        if (Object.hasOwn(data, id) && valid(element, data[id])) element.value = data[id];
      }
    }
    function save() {
      const data = {};
      for (const element of elements) if (valid(element, element.value)) data[element.id] = element.value;
      try { storage.setItem(key, JSON.stringify(data)); } catch {}
    }
    function clear() { try { storage.removeItem(key); } catch {} }
    function listen() { for (const element of elements) { element.addEventListener('change', save); if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') element.addEventListener('input', save); } }
    function notice(anchor) {
      if (!anchor) return;
      const row = root.createElement('p'); row.className = 'hint';
      row.textContent = '自动记住本页上次参数；文件、密钥和费用确认需重新选择。 ';
      const button = root.createElement('button'); button.type = 'button'; button.textContent = '清除本页记忆';
      button.addEventListener('click', () => { clear(); button.textContent = '已清除，下次打开使用默认参数'; });
      row.append(button); anchor.insertAdjacentElement('afterend', row);
    }
    return { read, restore, save, clear, listen, notice };
  }
  return { create, valid };
})();
if (typeof module !== 'undefined') module.exports = LastSettings;
