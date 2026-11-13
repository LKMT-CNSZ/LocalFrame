'use strict';

const PromptMemory = (() => {
  const LIMIT = 30;

  function create(key, fields, storage = localStorage) {
    const ids = Object.keys(fields);
    function normalize(input) {
      if (!input || typeof input !== 'object') return null;
      const values = {};
      for (const id of ids) {
        const value = input[id] ?? '';
        if (typeof value !== 'string' || value.length > fields[id]) return null;
        values[id] = value.trim();
      }
      return values[ids[0]] ? values : null;
    }
    function signature(values) { return JSON.stringify(ids.map(id => values[id])); }
    function list() {
      try {
        const data = JSON.parse(storage.getItem(key) || '[]');
        if (!Array.isArray(data)) return [];
        const seen = new Set();
        const entries = [];
        for (const item of data) {
          const values = normalize(item?.values);
          if (!values || seen.has(signature(values))) continue;
          seen.add(signature(values));
          entries.push({ values });
          if (entries.length === LIMIT) break;
        }
        return entries;
      } catch { return []; }
    }
    function write(entries) {
      try { storage.setItem(key, JSON.stringify(entries)); return true; }
      catch { return false; }
    }
    function remember(input) {
      const values = normalize(input);
      if (!values) return false;
      const entries = list().filter(entry => signature(entry.values) !== signature(values));
      return write([{ values }, ...entries].slice(0, LIMIT));
    }
    function remove(values) { return write(list().filter(entry => signature(entry.values) !== signature(values))); }
    function clear() { return write([]); }
    return { list, remember, remove, clear };
  }

  function attach(key, ids, anchor, root = document, storage = localStorage) {
    const elements = ids.map(id => root.getElementById(id));
    const fields = Object.fromEntries(elements.map(element => [element.id, element.maxLength > 0 ? element.maxLength : 4000]));
    const memory = create(key, fields, storage);
    const panel = root.createElement('section'); panel.className = 'prompt-memory';
    panel.setAttribute('aria-label', '提示词记忆');
    const tools = root.createElement('div'); tools.className = 'prompt-memory-tools';
    const save = root.createElement('button'); save.type = 'button'; save.textContent = '记住当前提示词';
    const details = root.createElement('details');
    const summary = root.createElement('summary');
    const list = root.createElement('div'); list.className = 'prompt-memory-list';
    const clear = root.createElement('button'); clear.type = 'button'; clear.textContent = '清空提示词列表';
    const status = root.createElement('p'); status.className = 'prompt-memory-status'; status.setAttribute('role', 'status');
    status.textContent = '输入自动记住；生成后加入最近 30 条，保存在本机。';
    tools.append(save); details.append(summary, list, clear); panel.append(tools, details, status);
    anchor.insertAdjacentElement('afterend', panel);

    function capture() { return Object.fromEntries(elements.map(element => [element.id, element.value])); }
    function render() {
      const entries = memory.list();
      summary.textContent = `提示词记忆 · ${entries.length} 条`;
      clear.hidden = entries.length === 0;
      list.replaceChildren();
      if (!entries.length) {
        const empty = root.createElement('p'); empty.textContent = '还没有记录，可先记住当前提示词。'; list.append(empty);
      }
      for (const entry of entries) {
        const row = root.createElement('div'); row.className = 'prompt-memory-entry';
        const apply = root.createElement('button'); apply.type = 'button'; apply.className = 'prompt-memory-apply';
        apply.textContent = entry.values[ids[0]];
        apply.title = ids.map(id => entry.values[id]).filter(Boolean).join('\n\n');
        apply.setAttribute('aria-label', `填入提示词 ${entry.values[ids[0]].slice(0, 80)}`);
        apply.addEventListener('click', () => {
          for (const element of elements) element.value = entry.values[element.id];
          for (const element of elements) {
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
          }
          elements[0].focus(); status.textContent = '已填入提示词，可继续编辑。';
        });
        const remove = root.createElement('button'); remove.type = 'button'; remove.textContent = '删除';
        remove.setAttribute('aria-label', `删除提示词 ${entry.values[ids[0]].slice(0, 80)}`);
        remove.addEventListener('click', () => {
          const saved = memory.remove(entry.values); render();
          status.textContent = saved ? '已删除这条提示词记忆。' : '保存失败，请检查本机存储空间。';
        });
        row.append(apply, remove); list.append(row);
      }
    }
    function remember(values = capture()) {
      if (!values[ids[0]]?.trim()) { status.textContent = '请先输入提示词。'; return false; }
      const saved = memory.remember(values); render();
      status.textContent = saved ? '已记住提示词，可从列表再次填入。' : '保存失败，请检查提示词长度和本机存储空间。';
      return saved;
    }
    save.addEventListener('click', () => remember());
    clear.addEventListener('click', () => {
      if (!window.confirm('清空本页已保存的提示词列表吗？')) return;
      const saved = memory.clear(); render();
      status.textContent = saved ? '已清空提示词列表。' : '保存失败，请检查本机存储空间。';
    });
    details.addEventListener('toggle', () => { if (details.open) render(); });
    render();
    return { capture, remember };
  }
  return { create, attach, LIMIT };
})();
if (typeof module !== 'undefined') module.exports = PromptMemory;
