import React from "react";
import ReactDOM from "react-dom"; 

const App = () => {
  const [genres, setGenres] = React.useState([]);
  const [filteredGenres, setFilteredGenres] = React.useState([]);
  const [filters, setFilters] = React.useState({
    genre: "Pop", // Default genre
  });
  const [filterOptions, setFilterOptions] = React.useState({
    genre: [],
  });
  const [showAboutModal, setShowAboutModal] = React.useState(false);
  const [selectedSubgenres, setSelectedSubgenres] = React.useState([]);
  const [combinedResults, setCombinedResults] = React.useState([]);

  // States for Apple query
  const [appleCountry, setAppleCountry] = React.useState("us");
  const [appleExplicit, setAppleExplicit] = React.useState(false);
  const [appleDataType, setAppleDataType] = React.useState("topsongs");
  const [currentPreview, setCurrentPreview] = React.useState(null);
  const [currentPlayingIndices, setCurrentPlayingIndices] = React.useState({
    genreIndex: null,
    songIndex: null,
  });
  const [activeGenreIndices, setActiveGenreIndices] = React.useState([]);
  const [allAppleResults, setAllAppleResults] = React.useState({});
  const [audioElement, setAudioElement] = React.useState(null);

  React.useEffect(() => {
    fetch("./assets/apple_genres.json?t=43")
      .then((response) => response.json())
      .then((data) => {
        console.log("Fetched genres:", data);
        setGenres(data);

        // Dynamically generate filter options
        const genres = [...new Set(data.map((genre) => genre.genre))];

        setFilterOptions({
          genre: genres,
        });

        // Apply default filter to show Pop genre
        const popGenres = data.filter((genre) => genre.genre === "Pop");
        setFilteredGenres(popGenres);

        const savedResults = localStorage.getItem("appleGenreResults");
        if (savedResults) { 
          const parsedResults = JSON.parse(savedResults);
          setAllAppleResults(parsedResults); 
        }
      });
  }, []);

  const handleFilterChange = (property, value) => {
    console.log(`Filter changed: ${property} = ${value}`);

    const newFilters = { ...filters };
    newFilters[property] = value;

    console.log("Updated filters:", newFilters);

    let newFilteredGenres = [...genres];

    // Apply filters one by one
    if (newFilters.genre !== "All") {
      newFilteredGenres = newFilteredGenres.filter(
        (genre) => genre.genre === newFilters.genre
      );
    }

    console.log("Final filtered genres:", newFilteredGenres);

    setFilters(newFilters);
    setFilteredGenres(newFilteredGenres);
    setSelectedSubgenres([]); // Clear selected subgenres when genre changes
    setCombinedResults([]); // Clear combined results
  };

  // Helper function to generate a consistent storage key for a genre query
  const getGenreQueryKey = (genre, country, dataType, explicit) => {
    const genreCode =
      genre.subgenre && genre.subgenre.length > 0
        ? genre.subgenre[0]
        : "unknown";
    return `${genre.name}_${genreCode}_${country}_${dataType}_${explicit}`;
  };

  // Updated handleGenreAppleQuery function
  const handleGenreAppleQuery = (genre, index) => {
    const genreCode =
      genre.subgenre && genre.subgenre.length > 0 ? genre.subgenre[0] : null;
    if (!genreCode) return;

    const queryKey = getGenreQueryKey(
      genre,
      appleCountry,
      appleDataType,
      appleExplicit
    );
    const isRefresh = activeGenreIndices.includes(index);

    // Always set active index, even for cached results
    if (!isRefresh) {
      setActiveGenreIndices((prev) => [...prev, index]);
    }

    // Skip cache checks if this is a refresh request
    if (!isRefresh) {
      // Check if we already have the results in state
      if (allAppleResults[queryKey]) {
        console.log("Loading cached results from state for:", genre.name);
        return;
      }

      // Check localStorage before making the API call
      const savedData = localStorage.getItem("appleGenreResults");
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        if (parsedData[queryKey]) {
          console.log(
            "Loading cached results from localStorage for:",
            genre.name,
            parsedData[queryKey]
          );
          setAllAppleResults((prevResults) => ({
            ...prevResults,
            [queryKey]: parsedData[queryKey],
          }));
          return;
        }
      }
    }

    const itunesUrl = `https://itunes.apple.com/${appleCountry}/rss/${appleDataType}/limit=100/genre=${genreCode}/explicit=${
      appleExplicit ? "true" : "false"
    }/json`;

    console.log(
      isRefresh ? "Refreshing data from API" : "Fetching new data from API"
    );
    fetch(itunesUrl)
      .then((response) => response.json())
      .then((data) => {
        let entries = data?.feed?.entry || []; 
        const entryList = entries.map((entry) => { 
          let returnThis = {
            title: entry["im:name"].label,
            artist: entry["im:artist"].label,
            previewLink: entry.link[1]?.attributes?.href || "",
          }; 
          return returnThis;
        });

        console.log("Fetched data from API:", entryList);

        const newAllResults = { ...allAppleResults };
        newAllResults[queryKey] = entryList;
        setAllAppleResults(newAllResults);
        localStorage.setItem('appleGenreResults', JSON.stringify(newAllResults));
      })
      .catch((error) => console.error("Error loading data: ", error));
  };

  // Updated audio preview handler
  const playPreview = (previewLink, genreIndex, songIndex) => {
    // Stop any existing audio
    if (audioElement) {
      audioElement.pause();
      audioElement.src = "";
    }

    if (
      currentPlayingIndices.genreIndex === genreIndex &&
      currentPlayingIndices.songIndex === songIndex
    ) {
      setCurrentPreview(null);
      setCurrentPlayingIndices({ genreIndex: null, songIndex: null });
      setAudioElement(null);
    } else {
      setCurrentPreview(previewLink);
      setCurrentPlayingIndices({ genreIndex, songIndex });

      // Create and configure new audio element
      const newAudio = new Audio(previewLink);
      newAudio.addEventListener("ended", () => {
        setCurrentPreview(null);
        setCurrentPlayingIndices({ genreIndex: null, songIndex: null });
        setAudioElement(null);
      });
      newAudio.play();
      setAudioElement(newAudio);
    }
  };

  const handleDetailsToggle = (e, genre, index) => {
    if (e.target.open) {
      const queryKey = getGenreQueryKey(
        genre,
        appleCountry,
        appleDataType,
        appleExplicit
      );
      
      // Check if we have cached results
      if (allAppleResults[queryKey]) {
        setActiveGenreIndices((prev) => [...prev, index]);
      } else {
        // If no cached results, fetch them automatically
        handleGenreAppleQuery(genre, index);
      }
    }
  };

  const clearLocalStorage = () => {
    localStorage.removeItem('appleGenreResults');
    setAllAppleResults({});
    setActiveGenreIndices([]);
    setCombinedResults([]);
  };

  const handleSubgenreToggle = (genreName) => {
    setSelectedSubgenres((prev) => {
      if (prev.includes(genreName)) {
        return prev.filter((name) => name !== genreName);
      } else {
        return [...prev, genreName];
      }
    });
  };

  const handleSearchSubgenres = () => {
    if (selectedSubgenres.length === 0) {
      setCombinedResults([]);
      return;
    }

    // Fetch data for all selected subgenres
    const promises = selectedSubgenres.map((genreName) => {
      const genre = filteredGenres.find((g) => g.name === genreName);
      if (!genre) return Promise.resolve([]);

      const queryKey = getGenreQueryKey(
        genre,
        appleCountry,
        appleDataType,
        appleExplicit
      );

      // Check if data is already cached
      if (allAppleResults[queryKey]) {
        return Promise.resolve(
          allAppleResults[queryKey].map((item, idx) => ({
            ...item,
            subgenre: genreName,
            originalIndex: idx,
          }))
        );
      }

      // Fetch from API
      const genreCode = genre.subgenre && genre.subgenre.length > 0 ? genre.subgenre[0] : null;
      if (!genreCode) return Promise.resolve([]);

      const itunesUrl = `https://itunes.apple.com/${appleCountry}/rss/${appleDataType}/limit=100/genre=${genreCode}/explicit=${
        appleExplicit ? "true" : "false"
      }/json`;

      return fetch(itunesUrl)
        .then((response) => response.json())
        .then((data) => {
          let entries = data?.feed?.entry || [];
          const entryList = entries.map((entry, idx) => ({
            title: entry["im:name"].label,
            artist: entry["im:artist"].label,
            previewLink: entry.link[1]?.attributes?.href || "",
            subgenre: genreName,
            originalIndex: idx,
          }));

          // Cache the results
          const newAllResults = { ...allAppleResults };
          newAllResults[queryKey] = entryList.map((item) => ({
            title: item.title,
            artist: item.artist,
            previewLink: item.previewLink,
          }));
          setAllAppleResults(newAllResults);
          localStorage.setItem("appleGenreResults", JSON.stringify(newAllResults));

          return entryList;
        })
        .catch((error) => {
          console.error("Error loading data: ", error);
          return [];
        });
    });

    Promise.all(promises).then((results) => {
      // Combine results maintaining order (first records first across all genres)
      const maxLength = Math.max(...results.map((r) => r.length));
      const combined = [];

      for (let i = 0; i < maxLength; i++) {
        results.forEach((result) => {
          if (result[i]) {
            combined.push(result[i]);
          }
        });
      }

      setCombinedResults(combined);
    });
  };

  // Generate color for each subgenre
  const getSubgenreColor = (subgenre) => {
    const colors = [
      "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8",
      "#F7DC6F", "#BB8FCE", "#85C1E2", "#F8B739", "#52B788"
    ];
    const index = selectedSubgenres.indexOf(subgenre);
    return colors[index % colors.length];
  };

  return (
    <div className="container py-4">
      {/* Header with About button */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">iTunes Music Explorer</h2>
        <button 
          className="btn btn-outline-secondary"
          onClick={() => setShowAboutModal(true)}
        >
          About
        </button>
      </div>

      {/* About Modal */}
      {showAboutModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowAboutModal(false)}
        >
          <div 
            style={{
              backgroundColor: 'white',
              padding: '2rem',
              borderRadius: '8px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>About iTunes Music Explorer</h3>
            <p>
              This tool allows you to explore music from the iTunes catalog using Apple's RSS feeds. 
              You can browse different genres, filter by various criteria, and listen to song previews. 
              The data is fetched from Apple's iTunes API and cached locally for better performance.
            </p>
            <button 
              className="btn btn-primary"
              onClick={() => setShowAboutModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Compact control panel */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-auto">
              <label htmlFor="countryInput" className="form-label small mb-1">Country Code</label>
              <input
                type="text"
                id="countryInput"
                className="form-control form-control-sm"
                value={appleCountry}
                onChange={(e) => setAppleCountry(e.target.value)}
                placeholder="us"
                style={{ width: '80px' }}
              />
            </div>
            <div className="col-auto">
              <div className="form-check">
                <input
                  type="checkbox"
                  id="explicitCheckbox"
                  className="form-check-input"
                  checked={appleExplicit}
                  onChange={(e) => setAppleExplicit(e.target.checked)}
                />
                <label htmlFor="explicitCheckbox" className="form-check-label small">Explicit</label>
              </div>
            </div>
            <div className="col-auto">
              <div className="btn-group btn-group-sm" role="group">
                <input
                  type="radio"
                  className="btn-check"
                  id="topSongsRadio"
                  name="dataType"
                  value="topsongs"
                  checked={appleDataType === "topsongs"}
                  onChange={(e) => setAppleDataType(e.target.value)}
                />
                <label className="btn btn-outline-primary" htmlFor="topSongsRadio">Top Songs</label>
                
                <input
                  type="radio"
                  className="btn-check"
                  id="topAlbumsRadio"
                  name="dataType"
                  value="topalbums"
                  checked={appleDataType === "topalbums"}
                  onChange={(e) => setAppleDataType(e.target.value)}
                />
                <label className="btn btn-outline-primary" htmlFor="topAlbumsRadio">Top Albums</label>
              </div>
            </div>
            <div className="col-auto">
              <button 
                className="btn btn-sm btn-danger"
                onClick={clearLocalStorage}
              >
                Clear Cache
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Genre filter */}
      <div className="card mb-4">
        <div className="card-body">
          <h5 className="card-title mb-3">Select Genre</h5>
          <div className="btn-group flex-wrap" role="group">
            {filterOptions.genre.map((genre) => (
              <button 
                key={genre}
                type="button" 
                className={`btn btn-sm ${filters.genre === genre ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => handleFilterChange("genre", genre)}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Subgenre selection - only shown when genre is selected */}
      {filters.genre && filters.genre !== "All" && filteredGenres.length > 0 && (
        <div className="card mb-4">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="card-title mb-0">Select Subgenres</h5>
              <div className="btn-group btn-group-sm" role="group">
                <button 
                  className="btn btn-outline-secondary"
                  onClick={() => setSelectedSubgenres(filteredGenres.map(g => g.name))}
                >
                  Select All
                </button>
                <button 
                  className="btn btn-outline-secondary"
                  onClick={() => setSelectedSubgenres([])}
                >
                  Deselect All
                </button>
              </div>
            </div>
            <div className="row g-2 mb-3">
              {filteredGenres.map((genre) => (
                <div className="col-md-4 col-sm-6" key={genre.name}>
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id={`subgenre-${genre.name}`}
                      checked={selectedSubgenres.includes(genre.name)}
                      onChange={() => handleSubgenreToggle(genre.name)}
                    />
                    <label 
                      className="form-check-label" 
                      htmlFor={`subgenre-${genre.name}`}
                    >
                      {genre.name}
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <button 
              className="btn btn-success"
              onClick={handleSearchSubgenres}
              disabled={selectedSubgenres.length === 0}
            >
              Search Selected Subgenres ({selectedSubgenres.length})
            </button>
          </div>
        </div>
      )}

      {/* Combined results display */}
      {combinedResults.length > 0 && (
        <div className="card">
          <div className="card-body">
            <h5 className="card-title mb-3">Results</h5>
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Artist</th>
                    <th>Subgenre</th>
                    <th>Preview</th>
                    <th>YouTube</th>
                  </tr>
                </thead>
                <tbody>
                  {combinedResults.map((entry, i) => (
                    <tr key={`${entry.subgenre}-${i}`}>
                      <td>{entry.title}</td>
                      <td>{entry.artist}</td>
                      <td>
                        <span 
                          className="badge"
                          style={{ 
                            backgroundColor: getSubgenreColor(entry.subgenre),
                            color: 'white',
                          }}
                        >
                          {entry.subgenre}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm"
                          onClick={() => playPreview(entry.previewLink, entry.subgenre, i)}
                          style={{
                            backgroundColor:
                              currentPlayingIndices.genreIndex === entry.subgenre &&
                              currentPlayingIndices.songIndex === i
                                ? "#dc3545"
                                : "#28a745",
                            color: "white",
                            border: "none",
                          }}
                        >
                          {currentPlayingIndices.genreIndex === entry.subgenre &&
                          currentPlayingIndices.songIndex === i
                            ? "Stop"
                            : "Play"}
                        </button>
                      </td>
                      <td>
                        <a
                          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                            entry.artist
                          )}+ - +${encodeURIComponent(entry.title)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-sm btn-outline-danger"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M8.051 1.999h.089c.822.003 4.987.033 6.11.335a2.01 2.01 0 0 1 1.415 1.42c.101.38.172.883.22 1.402l.01.104.022.26.008.104c.065.914.073 1.77.074 1.957v.075c-.001.194-.01 1.108-.082 2.06l-.008.105-.009.104c-.05.572-.124 1.14-.235 1.558a2.007 2.007 0 0 1-1.415 1.42c-1.16.312-5.569.334-6.18.335h-.142c-.309 0-1.587-.006-2.927-.052l-.17-.006-.087-.004-.171-.007-.171-.007c-1.11-.049-2.167-.128-2.654-.26a2.007 2.007 0 0 1-1.415-1.419c-.111-.417-.185-.986-.235-1.558L.09 9.82l-.008-.104A31.4 31.4 0 0 1 0 7.68v-.123c.002-.215.01-.958.064-1.778l.007-.103.003-.052.008-.104.022-.26.01-.104c.048-.519.119-1.023.22-1.402a2.007 2.007 0 0 1 1.415-1.42c.487-.13 1.544-.21 2.654-.26l.17-.007.172-.006.086-.003.171-.007A99.788 99.788 0 0 1 7.858 2h.193zM6.4 5.209v4.818l4.157-2.408L6.4 5.209z"/>
                          </svg>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById("react-root"));
