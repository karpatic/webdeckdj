import React from "react";

const EXAMPLE_DIRECTORY = {
  name: "Example",
  builtIn: true,
  files: [
    {
      title: "01 — Start Here: Find the Beat",
      path: "examples/dj-tutorial/01-start-here-find-the-beat.mp3"
    },
    {
      title: "02 — Keep It Going: Make the Blend",
      path: "examples/dj-tutorial/02-keep-it-going-make-the-blend.mp3"
    },
    {
      title: "03 — You Did It: Finish the Set",
      path: "examples/dj-tutorial/03-you-did-it-finish-the-set.mp3"
    }
  ]
};

const Crate = ({ onSelectLeftTrack, onSelectRightTrack, onFxSamplesChange, selectedFxId, onSelectFx, onPreviewFx }) => {
  const [directories, setDirectories] = React.useState([]);
  const [bundledFx, setBundledFx] = React.useState([]);
  const allDirectories = bundledFx.concat(directories);

  React.useEffect(() => {
    const controller = new AbortController();
    const clips = [
      ['owoo', 'Owoo'], ['basketball-horn', 'Basketball Horn'],
      ['knuckles-cracking', 'Knuckles Cracking'], ['kabuki', 'Kabuki']
    ];
    Promise.all(clips.map(async (clip) => {
      const id = clip[0];
      const label = clip[1];
      try {
        const response = await fetch(new URL(`examples/fx/${id}.mp3`, document.baseURI), { signal: controller.signal });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || contentType.includes('text/html')) {
          const unavailable = new Error('Audio unavailable');
          throw unavailable;
        }
        const data = await response.blob();
        return new File([data], `${label}.mp3`, { type: 'audio/mpeg' });
      } catch (error) {
        if (!controller.signal.aborted) console.warn('FX audio unavailable:', id, error.message);
        return new File([], `${label}.mp3`, { type: 'audio/mpeg' });
      }
    })).then(files => {
      if (!controller.signal.aborted) setBundledFx([{
        name: 'builtin:fx', label: 'FX — Soundboard', type: 'fx', builtIn: true,
        files, fileIds: clips.map(clip => `builtin:fx:${clip[0]}`)
      }]);
    });
    return () => controller.abort();
  }, []);
  const [busy, setBusy] = React.useState(true);
  const [error, setError] = React.useState("");
  const [exampleLoading, setExampleLoading] = React.useState({});
  const [exampleLoadError, setExampleLoadError] = React.useState("");
  const fileInputRef = React.useRef(null);
  const fxInputRef = React.useRef(null);
  const DB_NAME = 'musicCrateDB';
  const STORE_NAME = 'directories';
  const DB_VERSION = 7;

  const initDB = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other crate tabs and reload to open local storage."));
    request.onupgradeneeded = () => {
      const db = request.result;
      // Never delete or migrate existing records to add a folder type.
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'directoryName' });
      }
    };
  });

  const readFileAsArrayBuffer = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });

  const saveDirectoryToDB = async (dir, isNew = false) => {
    const data = await Promise.all(dir.files.map(async (file, index) => {
      // Keep unreadable persisted entries intact until explicitly removed.
      if (!file.size && dir.record?.data?.[index]) return dir.record.data[index];
      return {
        name: file.name, type: file.type, lastModified: file.lastModified,
        size: file.size, path: file.webkitRelativePath || file.name,
        binaryData: await readFileAsArrayBuffer(file)
      };
    }));
    const record = {
      ...dir.record,
      directoryName: dir.name,
      data,
      type: dir.type,
      displayName: dir.label,
      fileIds: dir.fileIds,
      order: dir.order
    };
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      if (isNew) store.add(record);
      else store.put(record);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error("Save aborted")); };
    });
  };

  const loadDirectoriesFromDB = async () => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        const dirs = request.result.map((record) => {
          const entries = Array.isArray(record.data) ? record.data : [];
          const files = entries.map((entry) => {
            const bytes = entry?.binaryData;
            const parts = bytes ? [bytes] : [];
            return new File(parts, entry?.name || "Unavailable MP3", {
              type: entry?.type || 'audio/mpeg', lastModified: entry?.lastModified || 0
            });
          });
          const savedIds = Array.isArray(record.fileIds) ? record.fileIds : [];
          return {
            name: record.directoryName,
            label: record.displayName || record.directoryName,
            type: record.type === 'fx' ? 'fx' : 'music',
            order: Number.isFinite(record.order) ? record.order : 0,
            fileIds: files.map((file, index) => savedIds[index] || `${record.directoryName}:${index}`),
            files, record
          };
        });
        dirs.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
        resolve(dirs);
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error("Read aborted")); };
    });
  };

  const deleteDirectoriesFromDB = async (names) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      names.forEach(name => store.delete(name));
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error("Delete aborted")); };
    });
  };

  React.useEffect(() => {
    let cancelled = false;
    loadDirectoriesFromDB().then(dirs => {
      if (!cancelled) setDirectories(dirs);
    }).catch(err => {
      if (!cancelled) setError(`Could not read imported directories: ${err.message}`);
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    const samples = [];
    allDirectories.forEach(dir => {
      if (dir.type !== 'fx') return;
      dir.files.forEach((file, index) => {
        if (!file.size) return;
        samples.push({ id: dir.fileIds[index], file, label: file.name.replace(/\.[^/.]+$/, ''), directory: dir.label });
      });
    });
    onFxSamplesChange(samples);
  }, [directories, bundledFx, onFxSamplesChange]);

  const handleDirectorySelect = async (event, type) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || busy) return;
    const mp3Files = files.filter(file => file.type === 'audio/mpeg' || /\.mp3$/i.test(file.name));
    if (!mp3Files.length) { setError("No MP3 files found in the selected directory."); return; }
    setBusy(true);
    setError("");
    try {
      const directoryMap = new Map();
      mp3Files.sort((a, b) => {
        const aPath = a.webkitRelativePath || a.name;
        const bPath = b.webkitRelativePath || b.name;
        return aPath.localeCompare(bPath);
      });
      mp3Files.forEach(file => {
        const path = file.webkitRelativePath || file.name;
        const parts = path.split('/');
        const label = parts.length > 1 ? parts[0] : 'Root';
        if (!directoryMap.has(label)) {
          const name = `local:${type}:${crypto.randomUUID()}`;
          directoryMap.set(label, { name, label, type, files: [], fileIds: [], order: Date.now() });
        }
        const dir = directoryMap.get(label);
        dir.fileIds.push(`${dir.name}:${dir.files.length}`);
        dir.files.push(file);
      });
      // Each import is additive, even when an FX folder shares a music folder's name.
      await Promise.all(Array.from(directoryMap.values()).map((dir) => saveDirectoryToDB(dir, true)));
      setDirectories(await loadDirectoriesFromDB());
    } catch (err) {
      setError(`Could not save ${type === 'fx' ? 'FX' : 'music'}: ${err.message}. Existing folders were not replaced.`);
      try { setDirectories(await loadDirectoriesFromDB()); } catch (readError) { /* Keep current library visible. */ }
    } finally { setBusy(false); }
  };

  const handleRemoveTrack = async (dir, index) => {
    if (busy || !window.confirm(`Remove “${dir.files[index].name}” from “${dir.label}”?`)) return;
    setBusy(true);
    setError("");
    try {
      const updated = { ...dir, files: [...dir.files], fileIds: [...dir.fileIds] };
      updated.files.splice(index, 1);
      updated.fileIds.splice(index, 1);
      if (dir.record) {
        updated.record = { ...dir.record, data: [...dir.record.data] };
        updated.record.data.splice(index, 1);
      }
      if (updated.files.length) await saveDirectoryToDB(updated);
      else await deleteDirectoriesFromDB([dir.name]);
      setDirectories(await loadDirectoriesFromDB());
    } catch (err) { setError(`Could not remove track: ${err.message}`); }
    finally { setBusy(false); }
  };

  const handleDeleteDirectory = async (dir) => {
    if (busy || !window.confirm(`Delete the imported ${dir.type} directory “${dir.label}”?`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteDirectoriesFromDB([dir.name]);
      setDirectories(await loadDirectoriesFromDB());
    } catch (err) { setError(`Could not delete directory: ${err.message}`); }
    finally { setBusy(false); }
  };

  const clearImportedMusic = async () => {
    if (busy || !window.confirm("Clear all imported music? FX and the built-in Example folder will stay.")) return;
    setBusy(true);
    setError("");
    try {
      const current = await loadDirectoriesFromDB();
      const names = current.filter(dir => dir.type !== 'fx').map(dir => dir.name);
      await deleteDirectoriesFromDB(names);
      setDirectories(await loadDirectoriesFromDB());
    } catch (err) { setError(`Could not clear imported music: ${err.message}`); }
    finally { setBusy(false); }
  };

  const handleLoadTrack = (file, deck) => {
    const validFile = file instanceof Blob;
    if (!validFile || !file.size) {
      setError("This MP3 is unavailable. Import its directory again.");
      return;
    }
    if (deck === 'left') onSelectLeftTrack(file);
    else onSelectRightTrack(file);
  };

  const loadExampleTrack = async (track, deck) => {
    setExampleLoading(previous => ({ ...previous, [track.path]: true }));
    setExampleLoadError("");
    try {
      const response = await fetch(new URL(track.path, document.baseURI));
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || contentType.includes('text/html')) throw new Error("Audio unavailable");
      const audioData = await response.blob();
      if (!audioData.size) throw new Error("Empty audio file");
      const file = new File([audioData], `${track.title}.mp3`, { type: audioData.type || 'audio/mpeg' });
      handleLoadTrack(file, deck);
    } catch (err) {
      setExampleLoadError(`Could not load “${track.title}”. The bundled audio file is unavailable.`);
    } finally { setExampleLoading(previous => ({ ...previous, [track.path]: false })); }
  };

  return (
    <div className="card mb-4">
      <div className="card-header"><h5>Music Crate</h5></div>
      <div className="card-body">
        <div className="d-flex flex-wrap gap-2 mb-3">
          <button id="add-music-directory" className="btn btn-primary" disabled={busy} onClick={() => fileInputRef.current.click()}>Add MP3 Directory</button>
          <button id="add-fx-directory" className="btn btn-outline-info" disabled={busy} onClick={() => fxInputRef.current.click()}>Add FX MP3 Directory</button>
          <button className="btn btn-danger" disabled={busy} onClick={clearImportedMusic}>Clear Imported Music</button>
        </div>
        <input id="music-directory-input" type="file" ref={fileInputRef} webkitdirectory="true" directory="true" multiple accept=".mp3,audio/mpeg" hidden onChange={(event) => handleDirectorySelect(event, 'music')} />
        <input id="fx-directory-input" type="file" ref={fxInputRef} webkitdirectory="true" directory="true" multiple accept=".mp3,audio/mpeg" hidden onChange={(event) => handleDirectorySelect(event, 'fx')} />
        {busy && <p role="status">Reading local directories…</p>}
        {error && <p className="alert alert-warning" role="alert">{error}</p>}
        <div id="directoriesContainer">
          <details className="directory-details mb-3" open>
            <summary className="directory-summary">Example <span className="badge bg-secondary ms-2">Built in</span></summary>
            <div className="directory-content card-body">
              {exampleLoadError && <p className="alert alert-danger" role="alert">{exampleLoadError}</p>}
              <table className="table table-hover">
                <thead><tr><th>Title</th><th>Action</th></tr></thead>
                <tbody>{EXAMPLE_DIRECTORY.files.map(track => (
                  <tr key={track.path}>
                    <td>{track.title}</td>
                    <td><div className="btn-group">
                      <button className="btn btn-sm btn-primary" disabled={exampleLoading[track.path]} onClick={() => loadExampleTrack(track, 'left')}>{exampleLoading[track.path] ? 'Loading…' : 'Deck A'}</button>
                      <button className="btn btn-sm btn-success" disabled={exampleLoading[track.path]} onClick={() => loadExampleTrack(track, 'right')}>{exampleLoading[track.path] ? 'Loading…' : 'Deck B'}</button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </details>
          {allDirectories.map(dir => (
            <details key={dir.name} className="directory-details mb-3" data-directory-type={dir.type}>
              <summary className="directory-summary d-flex justify-content-between align-items-center">
                <span className="directory-name">{dir.label} <span className="badge bg-secondary ms-2">{dir.type === 'fx' ? 'FX' : 'Music'}</span></span>
                {!dir.builtIn && <button className="btn btn-sm btn-danger" disabled={busy} onClick={(event) => { event.preventDefault(); handleDeleteDirectory(dir); }}>Delete Directory</button>}
              </summary>
              <div className="directory-content card-body">
                <table className="table table-hover">
                  <thead><tr><th>Title</th><th>Action</th></tr></thead>
                  <tbody>{dir.files.map((file, index) => (
                    <tr key={dir.fileIds[index]} data-fx-id={dir.type === 'fx' ? dir.fileIds[index] : undefined}>
                      <td>{file.name.replace(/\.[^/.]+$/, '')}{!file.size && <span className="badge bg-warning ms-2">Unavailable — reimport</span>}</td>
                      <td>
                        {dir.type === 'fx' ? <div className="btn-group">
                          <button className="btn btn-sm btn-primary" disabled={!file.size} aria-pressed={selectedFxId === dir.fileIds[index]} onClick={() => onSelectFx(dir.fileIds[index])}>Select</button>
                          <button className="btn btn-sm btn-success" disabled={!file.size} onClick={() => onPreviewFx(dir.fileIds[index])}>Preview</button>
                        </div> : <div className="btn-group">
                          <button className="btn btn-sm btn-primary" disabled={!file.size} onClick={() => handleLoadTrack(file, 'left')}>Deck A</button>
                          <button className="btn btn-sm btn-success" disabled={!file.size} onClick={() => handleLoadTrack(file, 'right')}>Deck B</button>
                        </div>}
                        {!dir.builtIn && <button className="btn btn-sm btn-danger" disabled={busy} aria-label={`Remove ${file.name}`} onClick={() => handleRemoveTrack(dir, index)}>×</button>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
                {!dir.files.length && <p>No tracks in this directory.</p>}
              </div>
            </details>
          ))}
        </div>
      </div>
      <style jsx>{`
        .directory-details { border: 1px solid rgba(0, 0, 0, 0.125); border-radius: 0.25rem; overflow: hidden; }
        .directory-summary { padding: 0.75rem 1.25rem; background: #000; color: #fff; border-bottom: 1px solid #ffffff33; cursor: pointer; list-style: none; }
        .directory-summary::-webkit-details-marker { display: none; }
        .directory-summary::before { content: '▶'; display: inline-block; margin-right: 10px; transition: transform 0.2s; }
        details[open] > .directory-summary::before { transform: rotate(90deg); }
        .directory-content { padding: 1.25rem; }
        .directory-name { font-weight: bold; font-size: 1.1rem; color: #fff; }
      `}</style>
    </div>
  );
};

export default Crate;
