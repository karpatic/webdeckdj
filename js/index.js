// YouTube Playlists Functionality
async function createPlaylist() {
    const playlistName = document.getElementById('newPlaylistName').value;
    if (!playlistName) {
        document.getElementById('playlistCreationStatus').innerText = 'Please enter a playlist name.';
        return;
    }

    const db = await dbPromise;
    const tx = db.transaction('youtubePlaylists', 'readwrite');
    try { 
        await tx.store.add({ playlistName: playlistName, tracks: [] });
        await tx.done;
        document.getElementById('playlistCreationStatus').innerText = 'Playlist created successfully.';
        renderPlaylists();
    } catch (error) {
        console.error("Error in createPlaylist:", error);
        document.getElementById('playlistCreationStatus').innerText = 'Error creating playlist: ' + error.message;
    }
}

async function loadPlaylistsFromIndexedDB() {
    const db = await dbPromise;
    const tx = db.transaction('youtubePlaylists', 'readonly');
    const playlists = await tx.store.getAll();
    await tx.done;
    return playlists;
}

async function storePlaylistInIndexedDB(playlistName, tracks) {
    const db = await dbPromise;
    const tx = db.transaction('youtubePlaylists', 'readwrite');
    await tx.store.put({
        playlistName: playlistName,
        tracks: tracks
    });
    await tx.done;
}

async function deletePlaylist(playlistName) {
    if (confirm("Are you sure you want to delete this playlist?")) {
        const db = await dbPromise;
        const tx = db.transaction('youtubePlaylists', 'readwrite');
        await tx.store.delete(playlistName);
        await tx.done;
        renderPlaylists();
    }
}
  
 
async function addTrackToPlaylist(playlistName, trackName, videoURL) {
    const db = await dbPromise;
    const tx = db.transaction('youtubePlaylists', 'readwrite');
    try {
        const playlist = await tx.store.get(playlistName);
        if (playlist) {
            playlist.tracks.push({ title: trackName, url: videoURL });
            await tx.store.put(playlist);
            alert('Track added to playlist successfully.');
        } else {
            alert('Playlist not found.');
        }
    } catch (error) {
        console.error('Error adding track to playlist:', error);
        alert('Error adding track to playlist.');
    } finally {
        await tx.done;
        renderPlaylists(); // Update the playlists UI
    }
}

    
    
function removeFromPlaylist(playlistName, index) {
    if (confirm("Are you sure you want to remove this track from the playlist?")) {
        loadPlaylistsFromIndexedDB().then(playlists => {
            const playlistObj = playlists.find(p => p.playlistName === playlistName);
            if (playlistObj) {
                playlistObj.tracks.splice(index, 1);
                storePlaylistInIndexedDB(playlistName, playlistObj.tracks);
                renderPlaylists();
            }
        });
    }
}

async function renderPlaylists() {
    const playlistsContainer = document.getElementById("playlistsContainer"); 
    playlistsContainer.innerHTML = '<hr>';
    const playlists = await loadPlaylistsFromIndexedDB();

    playlists.forEach(playlistObj => {
        const playlistName = playlistObj.playlistName;
        let playlistHTML = `<details open><summary>${playlistName}</summary>`;

        playlistObj.tracks.forEach((track, index) => {
            playlistHTML += `
                <div>
                    <button onclick="playFromPlaylist('${playlistName}', ${index})">Play</button>
                    <span style="float: right; color: red; cursor: pointer;" onclick="removeFromPlaylist('${playlistName}', ${index})">
                        <i class="fa fa-times"></i>
                    </span>
                    <p>${track.title}</p>
                </div>
            `;
        });

        playlistHTML += `<br><button style="float: right; color:" onclick="deletePlaylist('${playlistName}')">Delete Playlist</button><br></details><hr>`;
        playlistsContainer.innerHTML += playlistHTML;
    });
}

async function populatePlaylistDropdowns() {
    const playlists = await loadPlaylistsFromIndexedDB();
    const playlistSelect = document.getElementById('playlistSelect');
    const bulkPlaylistSelect = document.getElementById('bulkPlaylistSelect');

    playlistSelect.innerHTML = '';
    bulkPlaylistSelect.innerHTML = '';

    playlists.forEach(playlist => {
        playlistSelect.innerHTML += `<option value="${playlist.playlistName}">${playlist.playlistName}</option>`;
        bulkPlaylistSelect.innerHTML += `<option value="${playlist.playlistName}">${playlist.playlistName}</option>`;
    });
}

async function populatePlaylistDropdowns() {
    const playlists = await loadPlaylistsFromIndexedDB();
    const playlistSelect = document.getElementById('playlistSelect');
    const bulkPlaylistSelect = document.getElementById('bulkPlaylistSelect');

    playlistSelect.innerHTML = '';
    bulkPlaylistSelect.innerHTML = '';

    playlists.forEach(playlist => {
        playlistSelect.innerHTML += `<option value="${playlist.playlistName}">${playlist.playlistName}</option>`;
        bulkPlaylistSelect.innerHTML += `<option value="${playlist.playlistName}">${playlist.playlistName}</option>`;
    });
}


async function addTrackToPlaylist() {
    const playlistName = document.getElementById('playlistSelect').value;
    const trackName = document.getElementById('trackName').value;
    const trackURL = document.getElementById('trackURL').value;
    console.log({playlistName, trackURL})
    if (!trackURL) {
        document.getElementById('trackAdditionStatus').innerText = 'Please enter a track URL.';
        return;
    }
    if (!trackName) {
        document.getElementById('trackAdditionStatus').innerText = 'Please enter a track name.';
        return;
    }
    const db = await dbPromise;
    const tx = db.transaction('youtubePlaylists', 'readwrite');
    try {
        const playlist = await tx.store.get(playlistName);
        playlist.tracks.push({ title: trackName, url: trackURL.split('v=')[1] });
        await tx.store.put(playlist);
        document.getElementById('trackAdditionStatus').innerText = 'Track added successfully.';
        renderPlaylists();
    } catch (error) {
        document.getElementById('trackAdditionStatus').innerText = 'Error adding track.';
    }
}

async function bulkAddTracksToPlaylist() {
    const playlistName = document.getElementById('bulkPlaylistSelect').value;
    const bulkData = document.getElementById('bulkAddTracks').value;
    const lines = bulkData.split('\n');
    
    if (lines[0] === 'title,id') {
        lines.shift(); // Remove the first line if it's 'title,id'
    }

    const tracksToAdd = lines.map(line => {
        const [title, id] = line.split(',');
        if (title && id) {
            return { title: title.trim(), url: id.trim() };
        } else {
            return null;
        }
    }).filter(track => track !== null);

    if (tracksToAdd.length === 0) {
        document.getElementById('bulkAdditionStatus').innerText = 'No valid tracks to add.';
        return;
    }

    const db = await dbPromise;
    const tx = db.transaction('youtubePlaylists', 'readwrite');
    try {
        const playlist = await tx.store.get(playlistName);
        if (playlist) {
            playlist.tracks.push(...tracksToAdd);
            await tx.store.put(playlist);
            document.getElementById('bulkAdditionStatus').innerText = 'Tracks added successfully.';
            renderPlaylists();
        } else {
            document.getElementById('bulkAdditionStatus').innerText = 'Playlist not found.';
        }
    } catch (error) {
        console.error('Error adding tracks to playlist:', error);
        document.getElementById('bulkAdditionStatus').innerText = 'Error adding tracks.';
    } finally {
        await tx.done;
    }
}


function playFromPlaylist(playlistName, index) {
    currentPlaybackSource = 'YouTube';
    loadPlaylistsFromIndexedDB().then(playlists => {
        const playlistObj = playlists.find(p => p.playlistName === playlistName);
        if (playlistObj && playlistObj.tracks[index]) {
            const track = playlistObj.tracks[index];
            updateYouTubePlayer(track.url);
        }
    });
}

function playYouTubeVideo() {
    let iframe = document.getElementById('youtube_video');
    let innerDoc = iframe.contentDocument || iframe.contentWindow.document;

    // Assuming you know the exact selector of the play button
    let playButton = innerDoc.querySelector('button.play-selector');
    playButton.click();
}

function pauseYouTubeVideo() {
    let iframe = document.getElementById('youtube_video');
    let innerDoc = iframe.contentDocument || iframe.contentWindow.document;

    // Assuming you know the exact selector of the pause button
    let pauseButton = innerDoc.querySelector('button.pause-selector');
    pauseButton.click();
}

function updateYouTubePlayer(videoURL) {
    const iframe = document.getElementById('youtube_video');
    iframe.src = `https://www.youtube.com/embed/${videoURL}`;
}

// Event listeners  
document.getElementById('bulkAddTracksToPlaylistButton').addEventListener('click', bulkAddTracksToPlaylist);

// Initial load of playlists 
document.getElementById('createPlaylistButton').addEventListener('click', async () => {
    await createPlaylist();
    await populatePlaylistDropdowns();
});
document.getElementById('addTrackToPlaylistButton').addEventListener('click', addTrackToPlaylist);

// Initial load of playlists and dropdowns
document.addEventListener('DOMContentLoaded', async () => {
    await renderPlaylists();
    await populatePlaylistDropdowns();
});