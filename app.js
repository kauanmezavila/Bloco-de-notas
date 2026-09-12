(function () {
  'use strict';

  /* ============================= Storage ============================= */
  var NOTES_KEY = 'bn:notes';
  var SETTINGS_KEY = 'bn:settings';

  var DEFAULT_SETTINGS = {
    theme: 'system',
    confirmDelete: true,
    autosave: true,
    defaultSort: 'updated'
  };

  function loadNotes() {
    try {
      var raw = localStorage.getItem(NOTES_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.error('Falha ao carregar anotações', e);
      return [];
    }
  }

  function saveNotes() {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
      return true;
    } catch (e) {
      console.error('Falha ao salvar anotações', e);
      showToast('Não foi possível salvar. Espaço de armazenamento cheio?');
      return false;
    }
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      var obj = raw ? JSON.parse(raw) : {};
      return Object.assign({}, DEFAULT_SETTINGS, obj);
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Falha ao salvar configurações', e);
    }
  }

  /* ============================= State ============================= */
  var notes = loadNotes();
  var settings = loadSettings();
  var ui = {
    filter: 'all',        // all | favorites | pinned | archived
    sort: settings.defaultSort,
    query: '',
    editingId: null,
    isNewNote: false
  };
  var pendingModalResolve = null;

  /* ============================= Helpers ============================= */
  function uid() {
    return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function nowIso() { return new Date().toISOString(); }

  function stripTags(html) {
    var d = document.createElement('div');
    d.innerHTML = html || '';
    return (d.textContent || d.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function fold(str) {
    return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  var dtFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
  var tFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
  function formatDateTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var today = new Date();
    var sameDay = d.toDateString() === today.toDateString();
    var datePart = sameDay ? 'hoje' : dtFormatter.format(d).replace('.', '');
    return datePart + ' · ' + tFormatter.format(d);
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  /* ============================= Toast ============================= */
  var toastTimer = null;
  function showToast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ============================= Modal ============================= */
  function openModal(opts) {
    // opts: { title, text, actions: [{label, cls, value}] }
    return new Promise(function (resolve) {
      $('#modal-title').textContent = opts.title || '';
      $('#modal-text').textContent = opts.text || '';
      var actionsEl = $('#modal-actions');
      actionsEl.innerHTML = '';
      (opts.actions || []).forEach(function (a) {
        var btn = document.createElement('button');
        btn.className = a.cls || 'btn-quiet';
        btn.textContent = a.label;
        btn.addEventListener('click', function () {
          closeModal();
          resolve(a.value);
        });
        actionsEl.appendChild(btn);
      });
      $('#modal-scrim').classList.add('open');
      pendingModalResolve = resolve;
    });
  }
  function closeModal() {
    $('#modal-scrim').classList.remove('open');
    pendingModalResolve = null;
  }
  $('#modal-scrim').addEventListener('click', function (e) {
    if (e.target === $('#modal-scrim')) { closeModal(); }
  });

  function confirmDialog(title, text, confirmLabel, danger) {
    return openModal({
      title: title,
      text: text,
      actions: [
        { label: 'Cancelar', cls: 'btn-quiet', value: false },
        { label: confirmLabel, cls: danger ? 'btn-danger' : 'btn-primary', value: true }
      ]
    });
  }

  /* ============================= Theme ============================= */
  var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function applyTheme() {
    var mode = settings.theme;
    var dark = mode === 'dark' || (mode === 'system' && mql && mql.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
  if (mql) {
    var onSchemeChange = function () { if (settings.theme === 'system') applyTheme(); };
    if (mql.addEventListener) mql.addEventListener('change', onSchemeChange);
    else if (mql.addListener) mql.addListener(onSchemeChange);
  }

  /* ============================= Navigation ============================= */
  var VIEWS = ['view-list', 'view-editor', 'view-settings', 'view-trash'];

  function showView(id) {
    VIEWS.forEach(function (v) {
      $('#' + v).classList.toggle('active', v === id);
    });
    window.scrollTo(0, 0);
  }

  function go(state, push) {
    // state: {view, filter}
    if (push !== false) {
      history.pushState(state, '', '#' + state.view + (state.filter ? '/' + state.filter : ''));
    }
    render(state);
  }

  window.addEventListener('popstate', function (e) {
    var state = e.state || { view: 'view-list', filter: 'all' };
    render(state);
  });

  function updateDrawerActive(state) {
    var activeFilter = null;
    if (state.view === 'view-list') activeFilter = state.filter || 'all';
    else if (state.view === 'view-trash') activeFilter = 'trash';
    else if (state.view === 'view-settings') activeFilter = 'settings';
    $all('.drawer .nav-item').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === activeFilter);
    });
  }

  function render(state) {
    closeDrawer();
    updateDrawerActive(state);
    if (state.view === 'view-list') {
      ui.filter = state.filter || 'all';
      showView('view-list');
      renderList();
    } else if (state.view === 'view-trash') {
      showView('view-trash');
      renderTrash();
    } else if (state.view === 'view-settings') {
      showView('view-settings');
      renderSettings();
    } else if (state.view === 'view-editor') {
      showView('view-editor');
      loadEditor(state.noteId);
    }
  }

  /* ============================= Drawer ============================= */
  function openDrawer() {
    $('#drawer').classList.add('open');
    $('#scrim').classList.add('open');
  }
  function closeDrawer() {
    $('#drawer').classList.remove('open');
    $('#scrim').classList.remove('open');
  }
  $('#btn-menu').addEventListener('click', openDrawer);
  $('#scrim').addEventListener('click', closeDrawer);

  $all('.drawer .nav-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = btn.getAttribute('data-filter');
      closeDrawer();
      if (f === 'trash') go({ view: 'view-trash' });
      else if (f === 'settings') go({ view: 'view-settings' });
      else go({ view: 'view-list', filter: f });
    });
  });

  $('#btn-settings-top').addEventListener('click', function () { go({ view: 'view-settings' }); });

  /* ============================= List rendering ============================= */
  var FILTER_TITLES = {
    all: 'Bloco de Notas',
    favorites: 'Favoritas',
    pinned: 'Fixadas',
    archived: 'Arquivadas'
  };
  var EMPTY_MESSAGES = {
    all: 'Você ainda não tem anotações. Toque em + para começar.',
    favorites: 'Nenhuma anotação favoritada ainda.',
    pinned: 'Nenhuma anotação fixada ainda.',
    archived: 'Nenhuma anotação arquivada.'
  };

  function scopedNotes(filter) {
    return notes.filter(function (n) {
      if (n.deleted) return false;
      if (filter === 'archived') return !!n.archived;
      if (n.archived) return false;
      if (filter === 'favorites') return !!n.favorite;
      if (filter === 'pinned') return !!n.pinned;
      return true;
    });
  }

  function applySearch(list, query) {
    if (!query) return list;
    var q = fold(query.trim());
    if (!q) return list;
    return list.filter(function (n) {
      var title = fold(n.title || '');
      var body = fold(stripTags(n.content || ''));
      return title.indexOf(q) !== -1 || body.indexOf(q) !== -1;
    });
  }

  function applySort(list, sortKey) {
    var arr = list.slice();
    if (sortKey === 'alpha') {
      arr.sort(function (a, b) {
        var ta = a.title || 'Sem título', tb = b.title || 'Sem título';
        return ta.localeCompare(tb, 'pt-BR', { sensitivity: 'base' });
      });
    } else if (sortKey === 'created') {
      arr.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    } else {
      arr.sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
    }
    return arr;
  }

  function bubblePinned(list) {
    var pinned = list.filter(function (n) { return n.pinned; });
    var rest = list.filter(function (n) { return !n.pinned; });
    return pinned.concat(rest);
  }

  function renderList() {
    $('#list-title').textContent = FILTER_TITLES[ui.filter] || 'Bloco de Notas';
    $('#sort-select').value = ui.sort;
    $('#search-input').value = ui.query;

    var list = scopedNotes(ui.filter);
    var totalInScope = list.length;
    list = applySearch(list, ui.query);
    list = applySort(list, ui.sort);
    if (ui.filter === 'all' || ui.filter === 'favorites') list = bubblePinned(list);

    var countLabel = totalInScope + (totalInScope === 1 ? ' anotação' : ' anotações');
    $('#list-count').textContent = countLabel;

    var container = $('#note-list');
    container.innerHTML = '';
    var emptyEl = $('#empty-state');

    if (list.length === 0) {
      emptyEl.style.display = '';
      $('#empty-text').textContent = (ui.query && totalInScope > 0)
        ? 'Nenhuma anotação encontrada.'
        : (totalInScope === 0 ? EMPTY_MESSAGES[ui.filter] : 'Nenhuma anotação encontrada.');
      $('#empty-glyph').textContent = (ui.query) ? '🔍' : '✎';
      container.style.display = 'none';
      return;
    }
    emptyEl.style.display = 'none';
    container.style.display = '';

    list.forEach(function (n) {
      container.appendChild(buildNoteRow(n));
    });
  }

  function buildNoteRow(n) {
    var row = document.createElement('div');
    row.className = 'note-row' + (n.pinned ? ' pinned' : '');
    row.setAttribute('data-id', n.id);
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');

    var star = n.favorite
      ? '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.63 22 9.24 16.8 13.97 18.36 21 12 17.3 5.64 21 7.2 13.97 2 9.24 8.91 8.63"/></svg>'
      : '';
    var title = n.title && n.title.trim() ? n.title : 'Sem título';
    var preview = stripTags(n.content || '') || 'Sem conteúdo';

    row.innerHTML =
      '<div class="note-main">' +
        '<div class="note-title">' + star + '<span>' + escapeHtml(title) + '</span></div>' +
        '<div class="note-preview">' + escapeHtml(preview) + '</div>' +
        '<div class="note-date">' + formatDateTime(n.updatedAt) + '</div>' +
      '</div>';

    if (ui.filter === 'archived') {
      var actions = document.createElement('div');
      actions.className = 'note-actions';
      var restoreBtn = document.createElement('button');
      restoreBtn.className = 'chip-btn';
      restoreBtn.textContent = 'Restaurar';
      restoreBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        n.archived = false;
        n.updatedAt = nowIso();
        saveNotes();
        renderList();
        showToast('Anotação restaurada.');
      });
      actions.appendChild(restoreBtn);
      row.appendChild(actions);
    }

    row.addEventListener('click', function (ev) {
      if (ev.target.closest && ev.target.closest('.note-actions')) return;
      go({ view: 'view-editor', noteId: n.id });
    });
    row.addEventListener('keydown', function (ev) {
      if ((ev.key === 'Enter' || ev.key === ' ') && !(ev.target.closest && ev.target.closest('.note-actions'))) {
        ev.preventDefault();
        go({ view: 'view-editor', noteId: n.id });
      }
    });

    return row;
  }

  $('#search-input').addEventListener('input', function (e) {
    ui.query = e.target.value;
    renderList();
  });
  $('#sort-select').addEventListener('change', function (e) {
    ui.sort = e.target.value;
    renderList();
  });
  $('#btn-new').addEventListener('click', function () {
    go({ view: 'view-editor', noteId: null });
  });

  /* ============================= Trash rendering ============================= */
  function renderTrash() {
    var list = notes.filter(function (n) { return n.deleted; });
    list.sort(function (a, b) { return new Date(b.deletedAt || b.updatedAt) - new Date(a.deletedAt || a.updatedAt); });

    $('#trash-count').textContent = list.length + (list.length === 1 ? ' item' : ' itens');
    var container = $('#trash-list');
    container.innerHTML = '';
    var emptyEl = $('#trash-empty');

    if (list.length === 0) {
      emptyEl.style.display = '';
      container.style.display = 'none';
      return;
    }
    emptyEl.style.display = 'none';
    container.style.display = '';

    list.forEach(function (n) {
      var row = document.createElement('div');
      row.className = 'note-row';
      var title = n.title && n.title.trim() ? n.title : 'Sem título';
      var preview = stripTags(n.content || '') || 'Sem conteúdo';
      row.innerHTML =
        '<div class="note-main">' +
          '<div class="note-title"><span>' + escapeHtml(title) + '</span></div>' +
          '<div class="note-preview">' + escapeHtml(preview) + '</div>' +
          '<div class="note-date">Excluída em ' + formatDateTime(n.deletedAt || n.updatedAt) + '</div>' +
        '</div>';
      var actions = document.createElement('div');
      actions.className = 'note-actions';
      actions.style.flexDirection = 'column';
      actions.style.gap = '6px';

      var restoreBtn = document.createElement('button');
      restoreBtn.className = 'chip-btn';
      restoreBtn.textContent = 'Restaurar';
      restoreBtn.addEventListener('click', function () {
        n.deleted = false;
        n.deletedAt = null;
        n.updatedAt = nowIso();
        saveNotes();
        renderTrash();
        showToast('Anotação restaurada.');
      });

      var delBtn = document.createElement('button');
      delBtn.className = 'chip-btn danger';
      delBtn.textContent = 'Excluir';
      delBtn.addEventListener('click', function () {
        confirmDialog(
          'Excluir definitivamente?',
          'Essa anotação será apagada para sempre e não poderá ser recuperada.',
          'Excluir', true
        ).then(function (ok) {
          if (!ok) return;
          notes = notes.filter(function (x) { return x.id !== n.id; });
          saveNotes();
          renderTrash();
          showToast('Anotação excluída definitivamente.');
        });
      });

      actions.appendChild(restoreBtn);
      actions.appendChild(delBtn);
      row.appendChild(actions);
      container.appendChild(row);
    });
  }

  $('#btn-trash-back').addEventListener('click', function () { history.back(); });

  /* ============================= Editor ============================= */
  var editorDirty = false;
  var editorAutosaveTimer = null;

  function loadEditor(id) {
    editorDirty = false;
    clearTimeout(editorAutosaveTimer);
    var note;
    if (id) {
      note = notes.find(function (n) { return n.id === id; });
      ui.isNewNote = false;
    }
    if (!note) {
      var ts = nowIso();
      note = {
        id: uid(), title: '', content: '', createdAt: ts, updatedAt: ts,
        favorite: false, pinned: false, archived: false, deleted: false, deletedAt: null
      };
      ui.isNewNote = true;
    }
    ui.editingId = note.id;
    ui._draft = note; // working reference; persisted only on save

    $('#note-title').value = note.title || '';
    var body = $('#note-body');
    body.innerHTML = note.content || '';
    updateEditorMeta(note);
    updateEditorToggleIcons(note);
    $('#btn-editor-delete').style.display = ui.isNewNote ? 'none' : '';
    $('#note-title').focus();
  }

  function updateEditorMeta(note) {
    if (ui.isNewNote) {
      $('#editor-meta').textContent = '';
    } else {
      $('#editor-meta').textContent = 'Criada ' + formatDateTime(note.createdAt) + ' · editada ' + formatDateTime(note.updatedAt);
    }
  }

  function updateEditorToggleIcons(note) {
    $('#btn-editor-favorite').classList.toggle('on', !!note.favorite);
    $('#btn-editor-pin').classList.toggle('on', !!note.pinned);
  }

  function currentNote() {
    return notes.find(function (n) { return n.id === ui.editingId; }) || ui._draft;
  }

  function hasContent(note) {
    return !!(note.title && note.title.trim()) || !!stripTags(note.content).trim();
  }

  function commitEditorFields(note) {
    note.title = $('#note-title').value;
    note.content = $('#note-body').innerHTML;
  }

  function persistEditor(showMsg) {
    var note = currentNote();
    commitEditorFields(note);
    note.updatedAt = nowIso();
    if (!notes.some(function (n) { return n.id === note.id; })) {
      notes.unshift(note);
    }
    ui.isNewNote = false;
    saveNotes();
    editorDirty = false;
    updateEditorMeta(note);
    $('#btn-editor-delete').style.display = '';
    if (showMsg) showToast('Salvo.');
  }

  function markDirty() {
    editorDirty = true;
    if (settings.autosave) {
      clearTimeout(editorAutosaveTimer);
      editorAutosaveTimer = setTimeout(function () { persistEditor(false); }, 700);
    }
  }

  $('#note-title').addEventListener('input', markDirty);
  $('#note-body').addEventListener('input', markDirty);

  $('#btn-editor-save').addEventListener('click', function () {
    var note = currentNote();
    commitEditorFields(note);
    if (!hasContent(note)) { showToast('Nada para salvar.'); return; }
    persistEditor(true);
    history.back();
  });

  $('#btn-editor-back').addEventListener('click', function () {
    var note = currentNote();
    commitEditorFields(note);
    var exists = notes.some(function (n) { return n.id === note.id; });

    if (!hasContent(note)) {
      // Nothing worth keeping — discard silently if it was never saved.
      history.back();
      return;
    }
    if (!exists) {
      persistEditor(false);
    } else if (editorDirty) {
      persistEditor(false);
    }
    history.back();
  });

  function persistIfWorthKeeping(note) {
    commitEditorFields(note);
    if (hasContent(note) || notes.some(function (n) { return n.id === note.id; })) {
      persistEditor(false);
    }
  }

  $('#btn-editor-favorite').addEventListener('click', function () {
    var note = currentNote();
    note.favorite = !note.favorite;
    updateEditorToggleIcons(note);
    persistIfWorthKeeping(note);
    showToast(note.favorite ? 'Adicionada aos favoritos.' : 'Removida dos favoritos.');
  });

  $('#btn-editor-pin').addEventListener('click', function () {
    var note = currentNote();
    note.pinned = !note.pinned;
    updateEditorToggleIcons(note);
    persistIfWorthKeeping(note);
    showToast(note.pinned ? 'Anotação fixada.' : 'Anotação desafixada.');
  });

  $('#btn-editor-share').addEventListener('click', function () {
    var note = currentNote();
    commitEditorFields(note);
    var title = note.title && note.title.trim() ? note.title : 'Sem título';
    var text = stripTags(note.content);
    if (navigator.share) {
      navigator.share({ title: title, text: text }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(title + '\n\n' + text).then(function () {
        showToast('Copiado para a área de transferência.');
      }).catch(function () {
        showToast('Não foi possível compartilhar.');
      });
    } else {
      showToast('Compartilhamento não é suportado neste dispositivo.');
    }
  });

  $('#btn-editor-more').addEventListener('click', function () {
    var note = currentNote();
    if (ui.isNewNote) { showToast('Salve a anotação primeiro.'); return; }
    openModal({
      title: note.archived ? 'Anotação arquivada' : 'Mais opções',
      text: note.archived ? 'Esta anotação está arquivada.' : 'Arquive para tirá-la da lista principal sem excluí-la.',
      actions: [
        { label: 'Fechar', cls: 'btn-quiet', value: 'close' },
        note.archived
          ? { label: 'Desarquivar', cls: 'btn-primary', value: 'unarchive' }
          : { label: 'Arquivar', cls: 'btn-primary', value: 'archive' }
      ]
    }).then(function (val) {
      if (val === 'archive') {
        note.archived = true; note.updatedAt = nowIso(); saveNotes();
        showToast('Anotação arquivada.');
        history.back();
      } else if (val === 'unarchive') {
        note.archived = false; note.updatedAt = nowIso(); saveNotes();
        showToast('Anotação desarquivada.');
      }
    });
  });

  function doSoftDelete() {
    var note = currentNote();
    note.deleted = true;
    note.deletedAt = nowIso();
    note.updatedAt = nowIso();
    if (!notes.some(function (n) { return n.id === note.id; })) notes.unshift(note);
    saveNotes();
    showToast('Anotação enviada para a lixeira.');
    history.back();
  }

  $('#btn-editor-delete').addEventListener('click', function () {
    if (settings.confirmDelete) {
      confirmDialog('Excluir anotação?', 'Ela será movida para a lixeira e poderá ser restaurada depois.', 'Excluir', true)
        .then(function (ok) { if (ok) doSoftDelete(); });
    } else {
      doSoftDelete();
    }
  });

  /* ---- Formatting toolbar ---- */
  function applyCommand(cmd) {
    $('#note-body').focus();
    if (cmd === 'bold') document.execCommand('bold');
    else if (cmd === 'italic') document.execCommand('italic');
    else if (cmd === 'underline') document.execCommand('underline');
    else if (cmd === 'ul') document.execCommand('insertUnorderedList');
    else if (cmd === 'ol') document.execCommand('insertOrderedList');
    else if (cmd === 'heading') {
      var block = document.queryCommandValue('formatBlock');
      document.execCommand('formatBlock', false, (block === 'h2' ? 'p' : 'h2'));
    } else if (cmd === 'link') {
      var url = window.prompt('Endereço do link (https://…)');
      if (url) {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed) document.execCommand('insertText', false, url);
        document.execCommand('createLink', false, url);
      }
    }
    markDirty();
    refreshFormatState();
  }

  function refreshFormatState() {
    try {
      $all('.format-bar button[data-cmd]').forEach(function (btn) {
        var cmd = btn.getAttribute('data-cmd');
        var map = { bold: 'bold', italic: 'italic', underline: 'underline', ul: 'insertUnorderedList', ol: 'insertOrderedList' };
        if (map[cmd]) btn.classList.toggle('on', document.queryCommandState(map[cmd]));
      });
    } catch (e) { /* queryCommandState can throw in some contexts; ignore */ }
  }

  $all('.format-bar button[data-cmd]').forEach(function (btn) {
    var cmd = btn.getAttribute('data-cmd');
    if (cmd === 'delete') return; // handled separately (btn-editor-delete)
    btn.addEventListener('click', function () { applyCommand(cmd); });
  });
  $('#note-body').addEventListener('keyup', refreshFormatState);
  $('#note-body').addEventListener('mouseup', refreshFormatState);

  /* ============================= Settings ============================= */
  function renderSettings() {
    $all('#theme-segmented button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-theme') === settings.theme);
    });
    $('#switch-confirm-delete').classList.toggle('on', settings.confirmDelete);
    $('#switch-autosave').classList.toggle('on', settings.autosave);
    $('#settings-sort').value = settings.defaultSort;

    var archivedCount = notes.filter(function (n) { return n.archived && !n.deleted; }).length;
    var trashCount = notes.filter(function (n) { return n.deleted; }).length;
    $('#archived-count-label').textContent = archivedCount;
    $('#trash-count-label').textContent = trashCount;
  }

  $('#btn-settings-back').addEventListener('click', function () { history.back(); });

  $all('#theme-segmented button').forEach(function (b) {
    b.addEventListener('click', function () {
      settings.theme = b.getAttribute('data-theme');
      saveSettings();
      applyTheme();
      renderSettings();
    });
  });

  $('#switch-confirm-delete').addEventListener('click', function () {
    settings.confirmDelete = !settings.confirmDelete;
    saveSettings();
    renderSettings();
  });
  $('#switch-autosave').addEventListener('click', function () {
    settings.autosave = !settings.autosave;
    saveSettings();
    renderSettings();
  });
  $('#settings-sort').addEventListener('change', function (e) {
    settings.defaultSort = e.target.value;
    ui.sort = e.target.value;
    saveSettings();
  });

  $('#btn-goto-archived').addEventListener('click', function () { go({ view: 'view-list', filter: 'archived' }); });
  $('#btn-goto-trash').addEventListener('click', function () { go({ view: 'view-trash' }); });

  /* ---- Export / Import ---- */
  $('#btn-export').addEventListener('click', function () {
    var payload = { app: 'bloco-de-notas', version: 1, exportedAt: nowIso(), notes: notes };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = 'bloco-de-notas-backup-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    showToast('Exportação iniciada.');
  });

  $('#btn-import').addEventListener('click', function () { $('#import-file').click(); });

  $('#import-file').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var incoming;
      try {
        var parsed = JSON.parse(reader.result);
        incoming = Array.isArray(parsed) ? parsed : parsed.notes;
        if (!Array.isArray(incoming)) throw new Error('formato inválido');
      } catch (err) {
        showToast('Arquivo inválido. Não foi possível importar.');
        e.target.value = '';
        return;
      }

      var existingIds = {};
      notes.forEach(function (n) { existingIds[n.id] = true; });
      var collisions = incoming.filter(function (n) { return n && n.id && existingIds[n.id]; }).length;
      var fresh = incoming.filter(function (n) { return n && n.id && !existingIds[n.id]; });

      function finishImport(overwrite) {
        fresh.forEach(function (n) { notes.push(sanitizeImportedNote(n)); });
        if (overwrite) {
          incoming.forEach(function (n) {
            if (n && n.id && existingIds[n.id]) {
              var idx = notes.findIndex(function (x) { return x.id === n.id; });
              if (idx !== -1) notes[idx] = sanitizeImportedNote(n);
            }
          });
        }
        saveNotes();
        renderSettings();
        if (ui.filter) renderList();
        showToast('Importação concluída: ' + (fresh.length + (overwrite ? collisions : 0)) + ' anotação(ões).');
      }

      if (collisions > 0) {
        openModal({
          title: 'Anotações já existem',
          text: collisions + ' anotação(ões) do arquivo já existem neste dispositivo. Deseja substituí-las pelas versões importadas?',
          actions: [
            { label: 'Manter atuais', cls: 'btn-quiet', value: 'keep' },
            { label: 'Substituir', cls: 'btn-danger', value: 'overwrite' }
          ]
        }).then(function (choice) { finishImport(choice === 'overwrite'); });
      } else {
        finishImport(false);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  function sanitizeImportedNote(n) {
    var ts = nowIso();
    return {
      id: n.id || uid(),
      title: typeof n.title === 'string' ? n.title : '',
      content: typeof n.content === 'string' ? n.content : '',
      createdAt: n.createdAt || ts,
      updatedAt: n.updatedAt || ts,
      favorite: !!n.favorite,
      pinned: !!n.pinned,
      archived: !!n.archived,
      deleted: !!n.deleted,
      deletedAt: n.deletedAt || null
    };
  }

  /* ============================= Service worker ============================= */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline-first still works without it */ });
    });
  }

  /* ============================= Boot ============================= */
  applyTheme();
  if (!history.state) {
    history.replaceState({ view: 'view-list', filter: 'all' }, '');
  }
  render(history.state || { view: 'view-list', filter: 'all' });

})();
