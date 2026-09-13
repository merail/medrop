function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const msg = chrome.i18n.getMessage(el.getAttribute('data-i18n'));
    if (msg) el.textContent = msg;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const msg = chrome.i18n.getMessage(el.getAttribute('data-i18n-placeholder'));
    if (msg) el.placeholder = msg;
  });
}
applyI18n();

const rulesContainer = document.getElementById('rules');
const addRuleBtn = document.getElementById('addRule');
const excludedInput = document.getElementById('excluded');
const catchAllInput = document.getElementById('catchAll');
const catchAllError = document.getElementById('catchAllError');
const status = document.getElementById('status');
const enabledToggle = document.getElementById('enabledToggle');
const enabledLabel = document.getElementById('enabledLabel');

const INVALID_FOLDER_CHARS = /[\\:*?"<>|]/;

function validateFolderInput(input, errorEl) {
  const invalid = input.value.split('/').some((segment) => INVALID_FOLDER_CHARS.test(segment));
  input.classList.toggle('invalid', invalid);
  if (errorEl) {
    errorEl.hidden = !invalid;
    errorEl.textContent = invalid ? chrome.i18n.getMessage('invalidFolderChars') : '';
  }
  return !invalid;
}

function getDragAfterElement(container, y) {
  const items = [...container.querySelectorAll('.rule-item:not(.dragging)')];
  return items.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

rulesContainer.addEventListener('dragover', (e) => {
  e.preventDefault();
  const dragging = rulesContainer.querySelector('.dragging');
  if (!dragging) return;
  const afterElement = getDragAfterElement(rulesContainer, e.clientY);
  if (!afterElement) {
    rulesContainer.appendChild(dragging);
  } else {
    rulesContainer.insertBefore(dragging, afterElement);
  }
});

function removeRuleItem(item) {
  const height = item.getBoundingClientRect().height;
  item.style.height = `${height}px`;
  item.style.overflow = 'hidden';
  item.getBoundingClientRect();
  requestAnimationFrame(() => {
    item.classList.add('leaving');
    item.style.height = '0px';
    item.style.marginBottom = '0px';
  });
  item.addEventListener('transitionend', () => item.remove(), { once: true });
}

function addRuleRow(extensions = '', folder = '') {
  const item = document.createElement('div');
  item.className = 'rule-item entering';
  item.draggable = true;
  item.innerHTML = `
    <div class="rule-row">
      <span class="drag-handle" title="${chrome.i18n.getMessage('dragHandleTitle')}">⠿</span>
      <input type="text" class="rule-ext" placeholder="jpg, png, gif" value="${extensions}">
      <span class="arrow">&rarr;</span>
      <input type="text" class="rule-folder" placeholder="Images" value="${folder}">
      <button type="button" class="remove-rule" title="${chrome.i18n.getMessage('removeRuleTitle')}">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    <p class="field-error" hidden></p>
  `;

  const folderInput = item.querySelector('.rule-folder');
  const errorEl = item.querySelector('.field-error');
  folderInput.addEventListener('input', () => validateFolderInput(folderInput, errorEl));

  item.querySelector('.remove-rule').addEventListener('click', () => removeRuleItem(item));

  item.addEventListener('dragstart', () => item.classList.add('dragging'));
  item.addEventListener('dragend', () => item.classList.remove('dragging'));

  rulesContainer.appendChild(item);

  const targetHeight = item.getBoundingClientRect().height;
  item.style.height = '0px';
  item.style.overflow = 'hidden';
  item.getBoundingClientRect();
  requestAnimationFrame(() => {
    item.classList.remove('entering');
    item.style.height = `${targetHeight}px`;
  });
  item.addEventListener('transitionend', () => {
    item.style.height = '';
    item.style.overflow = '';
  }, { once: true });
}

function parseExtensions(value) {
  return value
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean);
}

let statusTimeout;
function showStatus(message, isError) {
  clearTimeout(statusTimeout);
  status.textContent = message;
  status.classList.toggle('error', isError);
  status.classList.add('visible');
  statusTimeout = setTimeout(() => {
    status.classList.remove('visible');
  }, isError ? 3000 : 1500);
}

function updateEnabledLabel(enabled) {
  enabledLabel.textContent = chrome.i18n.getMessage(enabled ? 'sortingEnabled' : 'sortingDisabled');
}

chrome.storage.local.get(['rules', 'excludedExtensions', 'catchAllFolder', 'enabled'], (cfg) => {
  const rules = cfg.rules || [];
  rules.forEach((rule) => addRuleRow(rule.extensions.join(', '), rule.folder));

  if (excludedInput) excludedInput.value = (cfg.excludedExtensions || []).join(', ');
  if (catchAllInput) catchAllInput.value = cfg.catchAllFolder || '';

  const enabled = cfg.enabled !== false;
  enabledToggle.checked = enabled;
  updateEnabledLabel(enabled);
});

addRuleBtn.addEventListener('click', () => addRuleRow());
if (catchAllInput) catchAllInput.addEventListener('input', () => validateFolderInput(catchAllInput, catchAllError));

enabledToggle.addEventListener('change', () => {
  const enabled = enabledToggle.checked;
  chrome.storage.local.set({ enabled });
  updateEnabledLabel(enabled);
});

document.getElementById('save').addEventListener('click', () => {
  const ruleFolderInputs = Array.from(rulesContainer.querySelectorAll('.rule-folder'));
  const validations = [
    ...(catchAllInput ? [validateFolderInput(catchAllInput, catchAllError)] : []),
    ...ruleFolderInputs.map((input) => validateFolderInput(input, input.closest('.rule-item').querySelector('.field-error'))),
  ];

  if (validations.includes(false)) {
    showStatus(chrome.i18n.getMessage('fixInvalidChars'), true);
    return;
  }

  const rules = Array.from(rulesContainer.querySelectorAll('.rule-row'))
    .map((row) => ({
      extensions: parseExtensions(row.querySelector('.rule-ext').value),
      folder: row.querySelector('.rule-folder').value.trim(),
    }))
    .filter((rule) => rule.extensions.length > 0 && rule.folder.length > 0);

  const dataToSave = { rules };
  if (excludedInput) dataToSave.excludedExtensions = parseExtensions(excludedInput.value);
  if (catchAllInput) dataToSave.catchAllFolder = catchAllInput.value.trim();

  chrome.storage.local.set(dataToSave, () => {
    showStatus(chrome.i18n.getMessage('savedStatus'), false);
  });
});
