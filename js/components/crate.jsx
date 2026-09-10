import React from "react";

const EXAMPLE_DIRECTORY = {
  name: "Example",
  builtIn: true,
  files: [
    {
      name: "01 — Start Here: Find the Beat",
      path: "examples/dj-tutorial/01-start-here-find-the-beat.mp3"
    },
    {
      name: "02 — Keep It Going: Make the Blend",
      path: "examples/dj-tutorial/02-keep-it-going-make-the-blend.mp3"
    },
    {
      name: "03 — You Did It: Finish the Set",
      path: "examples/dj-tutorial/03-you-did-it-finish-the-set.mp3"
    }
  ]
};

const Crate = ({ onSelectLeftTrack, onSelectRightTrack, onFxSamplesChange, selectedFxId, onSelectFx, onPreviewFx, onRegisterMidiActions }) => {
  const [directories, setDirectories] = React.useState([]);
  const [bundledFx, setBundledFx] = React.useState([]);
  const [remoteDirectories, setRemoteDirectories] = React.useState([]);
  const allDirectories = bundledFx.concat(directories, remoteDirectories);
  const directoryEntries = [{ ...EXAMPLE_DIRECTORY, name: 'builtin:example', label: 'Example', type: 'music' }, ...allDirectories];
  const [selectedDirectoryKey, setSelectedDirectoryKey] = React.useState('builtin:example');
  const [selectedFileIndex, setSelectedFileIndex] = React.useState(0);
  const [browseFocus, setBrowseFocus] = React.useState('files');
  const [folderPath, setFolderPath] = React.useState('');
  const [mobileActionKey, setMobileActionKey] = React.useState(null);
  const [isMobileLayout, setIsMobileLayout] = React.useState(() => window.matchMedia('(max-width: 1023px)').matches);
  const pointerGestureRef = React.useRef(null);
  const selectedDirectory = directoryEntries.find(dir => dir.name === selectedDirectoryKey) || directoryEntries[0];
  // A view over the existing root record: indexes still address its original files/IDs.
  const folders = new Map();
  const filesInFolder = [];
  selectedDirectory.files.forEach((file, fileIndex) => {
    let parts = String(file.webkitRelativePath || file.path || file.name).split('/').filter(Boolean);
    const hasRootPrefix = parts[0] === selectedDirectory.label || parts[0] === selectedDirectory.name;
    if (selectedDirectory.builtIn) parts = [file.name];
    else if (parts.length > 1 && hasRootPrefix) parts.shift();
    const relativePath = parts.join('/');
    const prefix = folderPath ? folderPath + '/' : '';
    if (!relativePath.startsWith(prefix)) return;
    const remaining = relativePath.slice(prefix.length).split('/');
    if (remaining.length > 1) {
      const name = remaining[0];
      folders.set(name, { kind: 'folder', name, path: prefix + name });
    } else filesInFolder.push({ kind: 'file', name: file.name || file.title || relativePath, file, fileIndex });
  });
  const folderEntries = Array.from(folders.values()).sort((a, b) => a.name.localeCompare(b.name));
  const visibleEntries = folderEntries.concat(filesInFolder);
  if (folderPath) {
    const parentParts = folderPath.split('/');
    parentParts.pop();
    visibleEntries.unshift({ kind: 'folder', name: '← Parent folder', path: parentParts.join('/') });
  }
  const openFolder = (path) => {
    setMobileActionKey(null);
    setFolderPath(path);
    setBrowseFocus('files');
    setSelectedFileIndex(0);
    if (browserRef.current) browserRef.current.focus();
  };
  const trackRows = visibleEntries.map((entry, index) => {
    const rowKey = `${selectedDirectory.name}:${folderPath}:${entry.kind}:${entry.path || entry.fileIndex}`;
    if (entry.kind === 'folder') {
      return <button key={rowKey} type="button" aria-pressed={index === selectedFileIndex}
        className={`list-group-item ${index === selectedFileIndex ? 'active' : ''}`}
        onFocus={() => { setMobileActionKey(null); setBrowseFocus('files'); setSelectedFileIndex(index); }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); actions.enterSelection(); } }}
        onClick={() => openFolder(entry.path)}>{entry.path ? '📁 ' : ''}{String(entry.name)}</button>;
    }

    const actionsOpen = isMobileLayout && mobileActionKey === rowKey;
    const actionId = `crate-track-actions-${index}`;
    const selectTrack = () => {
      setBrowseFocus('files');
      setSelectedFileIndex(index);
      setMobileActionKey(current => isMobileLayout && current !== rowKey ? rowKey : null);
    };
    const trackName = String(entry.name);
    return <div key={rowKey} className="crate-track-row" data-mobile-action-key={rowKey}>
      <button type="button" aria-pressed={index === selectedFileIndex} aria-expanded={isMobileLayout ? actionsOpen : undefined}
        aria-controls={isMobileLayout ? actionId : undefined}
        className={`list-group-item ${index === selectedFileIndex ? 'active' : ''}`}
        onFocus={() => {
          setBrowseFocus('files');
          setSelectedFileIndex(index);
          if (mobileActionKey !== rowKey) setMobileActionKey(null);
        }}
        onPointerDown={event => {
          pointerGestureRef.current = { key: rowKey, x: event.clientX, y: event.clientY, moved: false };
        }}
        onPointerMove={event => {
          const gesture = pointerGestureRef.current;
          if (gesture && gesture.key === rowKey
            && (Math.abs(event.clientX - gesture.x) > 10 || Math.abs(event.clientY - gesture.y) > 10)) {
            gesture.moved = true;
          }
        }}
        onPointerCancel={() => { pointerGestureRef.current = null; }}
        onPointerUp={() => {
          const gesture = pointerGestureRef.current;
          window.setTimeout(() => {
            if (pointerGestureRef.current === gesture) pointerGestureRef.current = null;
          }, 0);
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            selectTrack();
          }
        }}
        onClick={event => {
          const gesture = pointerGestureRef.current;
          pointerGestureRef.current = null;
          if (gesture && gesture.key === rowKey && gesture.moved) {
            event.preventDefault();
            return;
          }
          selectTrack();
        }}><span className="crate-track-title">{trackName}</span></button>
      {actionsOpen && <div id={actionId} className="crate-track-actions" role="group" aria-label={`Load ${trackName}`}
        onClick={() => setMobileActionKey(null)}>
        <button type="button" className="btn btn-primary" aria-label={`Load left to Deck A: ${trackName}`}
          title="Load left — Deck A" onClick={event => { event.stopPropagation(); loadSelectedTrack('left'); }}>
          <i className="bi bi-box-arrow-in-left" aria-hidden="true"></i>
        </button>
        <button type="button" className="btn btn-success" aria-label={`Load right to Deck B: ${trackName}`}
          title="Load right — Deck B" onClick={event => { event.stopPropagation(); loadSelectedTrack('right'); }}>
          <i className="bi bi-box-arrow-in-right" aria-hidden="true"></i>
        </button>
      </div>}
    </div>;
  });

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
        name: 'builtin:fx', label: 'Samples — Soundboard', type: 'fx', builtIn: true,
        files, fileIds: clips.map(clip => `builtin:fx:${clip[0]}`)
      }]);
    });
    return () => controller.abort();
  }, []);
  const [busy, setBusy] = React.useState(true);
  const [error, setError] = React.useState("");
  const [exampleLoading, setExampleLoading] = React.useState({});
  const [exampleLoadError, setExampleLoadError] = React.useState("");
  const [remotePanelOpen, setRemotePanelOpen] = React.useState(false);
  const [remoteEndpointInput, setRemoteEndpointInput] = React.useState("");
  const [remotePasswordInput, setRemotePasswordInput] = React.useState("");
  const [remoteStatus, setRemoteStatus] = React.useState("");
  const [remoteBusy, setRemoteBusy] = React.useState(false);
  const [remoteLoading, setRemoteLoading] = React.useState({});
  const remoteConnectionRef = React.useRef(null);
  const fileInputRef = React.useRef(null);
  const filesInputRef = React.useRef(null);
  const fxInputRef = React.useRef(null);
  const browserRef = React.useRef(null);
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
            const file = new File(parts, entry?.name || "Unavailable MP3", {
              type: entry?.type || 'audio/mpeg', lastModified: entry?.lastModified || 0
            });
            const savedPath = entry ? entry.path || entry.webkitRelativePath : '';
            Object.defineProperty(file, 'webkitRelativePath', { value: savedPath || file.name });
            return file;
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

  React.useEffect(() => () => {
    remoteConnectionRef.current = null;
  }, []);

  const remoteRequest = async (url, password) => fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${password}` },
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer'
  });

  const connectRemoteAudio = async (event) => {
    event.preventDefault();
    if (remoteBusy) return;
    setRemoteBusy(true);
    setError("");
    setRemoteStatus("");
    try {
      const endpoint = new URL(remoteEndpointInput.trim());
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
        throw new Error('Use an HTTPS manifest endpoint without credentials, query parameters, or a fragment.');
      }
      if (!remotePasswordInput) throw new Error('Enter the audio password.');
      const response = await remoteRequest(endpoint.href, remotePasswordInput);
      if (!response.ok) throw new Error(response.status === 401 ? 'The endpoint or password was not accepted.' : 'The audio endpoint is unavailable.');
      const payload = await response.json();
      if (payload?.version !== 1 || !Array.isArray(payload.albums)) throw new Error('The endpoint returned an invalid audio manifest.');
      const albums = payload.albums.map((album, albumIndex) => {
        if (!album || typeof album.name !== 'string' || !album.name.trim() || !Array.isArray(album.tracks)) {
          throw new Error('The endpoint returned an invalid album.');
        }
        const files = album.tracks.map((track) => {
          if (!track || typeof track.id !== 'string' || !/^[a-f0-9]{64}$/.test(track.id)
            || typeof track.name !== 'string' || !track.name || !/\.mp3$/i.test(track.name)
            || !Number.isSafeInteger(track.size) || track.size < 1
            || typeof track.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(track.sha256)) {
            throw new Error('The endpoint returned invalid track metadata.');
          }
          return { ...track, remote: true };
        });
        return {
          name: `remote:${albumIndex}:${crypto.randomUUID()}`,
          label: album.name,
          type: 'music',
          remote: true,
          files,
          fileIds: files.map(track => track.id)
        };
      });
      remoteConnectionRef.current = { endpoint: endpoint.href, password: remotePasswordInput };
      setRemoteDirectories(albums);
      setRemoteEndpointInput("");
      setRemotePasswordInput("");
      setRemotePanelOpen(false);
      setRemoteStatus(`Connected: ${albums.length} remote album${albums.length === 1 ? '' : 's'}.`);
    } catch (err) {
      remoteConnectionRef.current = null;
      setRemoteDirectories([]);
      setRemoteStatus(err.message || 'Could not connect to remote audio.');
    } finally {
      setRemoteBusy(false);
    }
  };

  const disconnectRemoteAudio = () => {
    remoteConnectionRef.current = null;
    setRemoteDirectories([]);
    setRemoteEndpointInput("");
    setRemotePasswordInput("");
    setRemoteStatus('Remote audio disconnected.');
    if (selectedDirectory?.remote) {
      setSelectedDirectoryKey('builtin:example');
      setFolderPath('');
      setSelectedFileIndex(0);
    }
  };

  const handleDirectorySelect = async (event, type, flatSelectionLabel = '') => {
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
        const label = parts.length > 1 ? parts[0] : flatSelectionLabel || 'Root';
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
      setError(`Could not save ${type === 'fx' ? 'samples' : 'music'}: ${err.message}. Existing folders were not replaced.`);
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
    if (busy || !window.confirm("Clear all imported music? Samples and the built-in Example folder will stay.")) return;
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
    const trackTitle = track.name || track.title || track.path;
    setExampleLoading(previous => { const next = { ...previous }; next[track.path] = true; return next; });
    setExampleLoadError("");
    try {
      const response = await fetch(new URL(track.path, document.baseURI));
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || contentType.includes('text/html')) throw new Error("Audio unavailable");
      const audioData = await response.blob();
      if (!audioData.size) throw new Error("Empty audio file");
      const file = new File([audioData], `${trackTitle}.mp3`, { type: audioData.type || 'audio/mpeg' });
      handleLoadTrack(file, deck);
    } catch (err) {
      setExampleLoadError(`Could not load “${trackTitle}”. The bundled audio file is unavailable.`);
    } finally {
      setExampleLoading(previous => { const next = { ...previous }; next[track.path] = false; return next; });
    }
  };

  const loadRemoteTrack = async (track, deck) => {
    const connection = remoteConnectionRef.current;
    if (!connection || remoteLoading[track.id]) return;
    setRemoteLoading(previous => ({ ...previous, [track.id]: true }));
    setError("");
    try {
      const url = new URL(connection.endpoint);
      url.searchParams.set('track', track.id);
      const response = await remoteRequest(url.href, connection.password);
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.toLowerCase().startsWith('audio/')) throw new Error('Remote MP3 unavailable');
      const audioData = await response.blob();
      if (!audioData.size || audioData.size !== track.size) throw new Error('Remote MP3 was incomplete');
      handleLoadTrack(new File([audioData], track.name, { type: contentType || 'audio/mpeg' }), deck);
    } catch (err) {
      setError(`Could not load “${track.name}” from remote audio. Reconnect and try again.`);
    } finally {
      setRemoteLoading(previous => ({ ...previous, [track.id]: false }));
    }
  };

  const loadSelectedTrack = (deck) => {
    setMobileActionKey(null);
    const entry = visibleEntries[selectedFileIndex];
    const file = entry && entry.kind === 'file' ? entry.file : null;
    if (browseFocus !== 'files') return;
    if (!file || selectedDirectory.type === 'fx' || exampleLoading[file.path] || remoteLoading[file.id]) return;
    if (selectedDirectory.name === 'builtin:example') loadExampleTrack(file, deck);
    else if (selectedDirectory.remote) loadRemoteTrack(file, deck);
    else handleLoadTrack(file, deck);
  };

  const loadControls = selectedDirectory && selectedDirectory.type !== 'fx'
    ? React.createElement('div', { className: 'mt-2' },
      React.createElement('button', {
        type: 'button',
        className: 'btn btn-sm btn-primary me-2',
        disabled: !visibleEntries[selectedFileIndex] || visibleEntries[selectedFileIndex].kind !== 'file' || browseFocus !== 'files',
        onClick: () => loadSelectedTrack('left')
      }, 'Load to Deck A'),
      React.createElement('button', {
        type: 'button',
        className: 'btn btn-sm btn-success',
        disabled: !visibleEntries[selectedFileIndex] || visibleEntries[selectedFileIndex].kind !== 'file' || browseFocus !== 'files',
        onClick: () => loadSelectedTrack('right')
      }, 'Load to Deck B'))
    : null;

  React.useEffect(() => {
    if (!selectedDirectory || selectedDirectory.name === selectedDirectoryKey) return;
    setSelectedDirectoryKey(selectedDirectory.name);
    setFolderPath('');
  }, [directoryEntries, selectedDirectory, selectedDirectoryKey]);

  React.useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const updateLayout = () => {
      setIsMobileLayout(query.matches);
      if (!query.matches) setMobileActionKey(null);
    };
    updateLayout();
    query.addEventListener('change', updateLayout);
    return () => query.removeEventListener('change', updateLayout);
  }, []);

  React.useEffect(() => {
    if (!mobileActionKey) return undefined;
    const dismissOutside = (event) => {
      const row = event.target.closest && event.target.closest('.crate-track-row');
      if (!row || row.dataset.mobileActionKey !== mobileActionKey) setMobileActionKey(null);
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [mobileActionKey]);

  const actions = {
    showDirectories: () => {
      setMobileActionKey(null);
      setFolderPath('');
      if (browserRef.current) browserRef.current.focus();
      setBrowseFocus('directories');
      setSelectedDirectoryKey(currentKey => directoryEntries.some(dir => dir.name === currentKey)
        ? currentKey
        : 'builtin:example');
      setSelectedFileIndex(0);
    },
    moveSelection: (delta) => {
      setMobileActionKey(null);
      if (browseFocus === 'directories') {
        const length = directoryEntries.length;
        if (!length) return;
        setSelectedDirectoryKey(currentKey => {
          const currentIndex = Math.max(0, directoryEntries.findIndex(dir => dir.name === currentKey));
          const moved = currentIndex + delta;
          const wrapped = moved % length + length;
          const nextIndex = wrapped % length;
          return directoryEntries[nextIndex].name;
        });
        setSelectedFileIndex(0);
        return;
      }
      if (!selectedDirectory) return;
      const length = visibleEntries.length;
      if (!length) return;
      setSelectedFileIndex(index => {
        const moved = index + delta;
        const wrapped = moved % length + length;
        return wrapped % length;
      });
    },
    enterSelection: () => {
      if (!selectedDirectory) return;
      if (browseFocus === 'directories') {
        openFolder('');
        setSelectedDirectoryKey(selectedDirectory.name);
        return;
      }
      const entry = visibleEntries[selectedFileIndex];
      if (entry && entry.kind === 'folder') openFolder(entry.path);
    },
    loadSelection: loadSelectedTrack
  };
  const handleBrowseKey = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      actions.moveSelection(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'ArrowRight' || event.key === 'Enter' && event.target === event.currentTarget) {
      event.preventDefault();
      actions.enterSelection();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (mobileActionKey) setMobileActionKey(null);
      else actions.showDirectories();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (folderPath) openFolder(visibleEntries[0].path);
      else actions.showDirectories();
    }
  };
  React.useLayoutEffect(() => {
    if (onRegisterMidiActions) onRegisterMidiActions(actions);
    return () => { if (onRegisterMidiActions) onRegisterMidiActions(null); };
  }, [browseFocus, folderPath, directoryEntries, selectedDirectory, selectedDirectoryKey, selectedFileIndex, exampleLoading, onRegisterMidiActions]);

  React.useEffect(() => {
    setSelectedFileIndex(index => Math.min(index, Math.max(0, visibleEntries.length - 1)));
  }, [selectedDirectory, folderPath]);

  const selectedEntry = visibleEntries[selectedFileIndex];
  const selectedFile = selectedEntry && selectedEntry.kind === 'file' ? selectedEntry.file : null;
  const selectedSourceIndex = selectedFile ? selectedEntry.fileIndex : -1;
  const selectedSampleId = selectedDirectory.fileIds ? selectedDirectory.fileIds[selectedSourceIndex] : null;

  return (
    <div className="card mb-4 bg-transparent">
      <div className="card-header"><h5>Music Crate</h5></div>
      <div className="card-body">
        <div className="d-flex flex-wrap gap-2 mb-3">
          <button className="btn btn-primary" disabled={busy} onClick={() => fileInputRef.current.click()}>Add MP3 Directory</button>
          <button className="btn btn-outline-primary" disabled={busy} onClick={() => filesInputRef.current.click()}>Add MP3 Files</button>
          <button className="btn btn-outline-info" disabled={busy} onClick={() => fxInputRef.current.click()}>Add Samples MP3 Directory</button>
          <button type="button" className="btn btn-outline-light" disabled={remoteBusy}
            onClick={() => setRemotePanelOpen(open => !open)}>Connect Audio</button>
          {remoteDirectories.length > 0 && <button type="button" className="btn btn-outline-warning"
            disabled={remoteBusy} onClick={disconnectRemoteAudio}>Disconnect Audio</button>}
          <button className="btn btn-danger" disabled={busy} onClick={clearImportedMusic}>Clear Imported Music</button>
        </div>
        {remotePanelOpen && <form className="remote-audio-connect mb-3" onSubmit={connectRemoteAudio}>
          <label>Manifest endpoint
            <input type="url" required value={remoteEndpointInput} autoCapitalize="none" autoCorrect="off" spellCheck="false"
              placeholder="https://…" onChange={event => setRemoteEndpointInput(event.target.value)} />
          </label>
          <label>Password
            <input type="password" required value={remotePasswordInput} autoComplete="off"
              onChange={event => setRemotePasswordInput(event.target.value)} />
          </label>
          <button type="submit" className="btn btn-sm btn-primary" disabled={remoteBusy}>{remoteBusy ? 'Connecting…' : 'Connect'}</button>
          <button type="button" className="btn btn-sm btn-outline-secondary" disabled={remoteBusy}
            onClick={() => { setRemotePanelOpen(false); setRemotePasswordInput(""); }}>Cancel</button>
        </form>}
        <input type="file" ref={fileInputRef} webkitdirectory="true" directory="true" multiple accept=".mp3,audio/mpeg" hidden onChange={event => handleDirectorySelect(event, 'music')} />
        <input type="file" ref={filesInputRef} data-selection="files" multiple accept=".mp3,audio/mpeg" hidden
          onChange={event => handleDirectorySelect(event, 'music', 'Selected MP3s')} />
        <input type="file" ref={fxInputRef} webkitdirectory="true" directory="true" multiple accept=".mp3,audio/mpeg" hidden onChange={event => handleDirectorySelect(event, 'fx')} />
        {error && <p role="alert">{error}</p>}
        {remoteStatus && <p role="status">{remoteStatus}</p>}
        {exampleLoadError && <p role="alert">{exampleLoadError}</p>}
        {busy && <p role="status">Updating crate…</p>}
        {selectedFile && exampleLoading[selectedFile.path] && <p role="status">Loading MP3…</p>}
        <div className="crate-browser" ref={browserRef} tabIndex={-1} onKeyDown={handleBrowseKey}>
          <div className="crate-directories" aria-label="Folders" data-browse-focus={browseFocus === 'directories'}>
            {directoryEntries.map((dir, index) => (
              <button key={index} type="button" className={`list-group-item list-group-item-action ${selectedDirectory && selectedDirectory.name === dir.name ? 'active' : ''}`}
                onFocus={() => { setMobileActionKey(null); setBrowseFocus('directories'); setFolderPath(''); setSelectedDirectoryKey(dir.name); setSelectedFileIndex(0); }}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); actions.enterSelection(); } }}
                onClick={() => { openFolder(''); setSelectedDirectoryKey(dir.name); }}>
                {String(dir.label || dir.name)}
              </button>
            ))}
          </div>
          <div className="crate-files" aria-label="Files" data-browse-focus={browseFocus === 'files'}>
            <button type="button" className="btn btn-sm btn-outline-secondary mb-2" onClick={actions.showDirectories}>Directory</button>
            {folderPath && <p className="small mb-2">{String(selectedDirectory.label || selectedDirectory.name)} / {folderPath}</p>}
            {trackRows}
            {loadControls}
            {selectedDirectory.type === 'fx' && selectedFile && <div className="mt-2">
              <button type="button" className="btn btn-sm btn-outline-info me-2"
                aria-pressed={selectedFxId === selectedSampleId} disabled={!selectedFile.size}
                onClick={() => onSelectFx(selectedSampleId)}>Select Sample</button>
              <button type="button" className="btn btn-sm btn-outline-info" disabled={!selectedFile.size}
                onClick={() => onPreviewFx(selectedSampleId)}>Preview Sample</button>
            </div>}
            {!selectedDirectory.builtIn && !selectedDirectory.remote && <div className="mt-2">
              <button type="button" className="btn btn-sm btn-outline-danger me-2" disabled={busy || !selectedFile}
                onClick={() => handleRemoveTrack(selectedDirectory, selectedSourceIndex)}>Remove selected MP3</button>
              <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy}
                onClick={() => handleDeleteDirectory(selectedDirectory)}>Delete directory</button>
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Crate;
