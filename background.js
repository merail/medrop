chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  chrome.storage.local.get(['enabled', 'rules', 'excludedExtensions', 'catchAllFolder'], (cfg) => {
    if (cfg.enabled === false) {
      suggest();
      return;
    }

    const rules = cfg.rules || [];
    const excluded = cfg.excludedExtensions || [];
    const catchAll = cfg.catchAllFolder || '';

    const base = item.filename.split(/[\\/]/).pop();
    const dot = base.lastIndexOf('.');
    const ext = dot > -1 ? base.slice(dot + 1).toLowerCase() : '';

    if (excluded.includes(ext)) {
      suggest();
      return;
    }

    const rule = rules.find((r) => r.extensions.includes(ext));
    const folder = rule ? rule.folder : catchAll;

    if (!folder) {
      suggest();
      return;
    }

    suggest({ filename: `${folder}/${base}`, conflictAction: 'uniquify' });
  });

  return true;
});
