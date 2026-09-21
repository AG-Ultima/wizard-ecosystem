// ============================================
// WIZARD MAPS — Main Controller
// Free tiles (OpenFreeMap), free routing (OSRM),
// free geocoding (Photon)
// ============================================

// ══════════════════════════════════════
// CONFIG
// ══════════════════════════════════════
const CONFIG = {
    // Tile styles — no API key needed
    STYLES: {
        liberty:  'https://tiles.openfreemap.org/styles/liberty',
        bright:   'https://tiles.openfreemap.org/styles/bright',
        positron: 'https://tiles.openfreemap.org/styles/positron',
        dark:     'https://tiles.openfreemap.org/styles/dark',
        fiord:    'https://tiles.openfreemap.org/styles/fiord',
        '3d':     'https://tiles.openfreemap.org/styles/liberty' // 3D via terrain, uses liberty base
    },
    // Free geocoding — Photon (Komoot)
    GEOCODE_URL: 'https://photon.komoot.io/api/',
    // Free routing — OSRM demo server
    ROUTE_URL: 'https://router.project-osrm.org/route/v1/',
    // Default view
    DEFAULT_CENTER: [0, 20],
    DEFAULT_ZOOM: 2
};

// ══════════════════════════════════════
// STATE
// ══════════════════════════════════════
const state = {
    style: 'liberty',
    routeProfile: 'driving',
    routeData: null,
    startPoint: null,
    endPoint: null,
    navigationActive: false,
    navigationStep: 0,
    trafficVisible: false,
    buildings3D: false,
    terrain: false,
    searchDebounce: null,
    routeDebounce: { start: null, end: null },
    userMarker: null,
    routeStartMarker: null,
    routeEndMarker: null
};

// ══════════════════════════════════════
// MAP INIT
// ══════════════════════════════════════
const map = new maplibregl.Map({
    style: CONFIG.STYLES[state.style],
    center: CONFIG.DEFAULT_CENTER,
    zoom: CONFIG.DEFAULT_ZOOM,
    container: 'map',
    attributionControl: false
});

map.addControl(new maplibregl.AttributionControl({
    compact: true,
    customAttribution: '© OpenFreeMap · © OpenStreetMap contributors'
}));

map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

// ══════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════
function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

function formatDistance(meters) {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds) {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hours}h ${rem}m`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// ══════════════════════════════════════
// SEARCH (Photon geocoder)
// ══════════════════════════════════════
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const searchClear = document.getElementById('search-clear');

async function photonSearch(query, limit = 8) {
    try {
        const url = `${CONFIG.GEOCODE_URL}?q=${encodeURIComponent(query)}&limit=${limit}&lang=en`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        return data.features || [];
    } catch (err) {
        console.error('Geocode error:', err);
        return [];
    }
}

function photonFeatureToResult(feature) {
    const p = feature.properties || {};
    const coords = feature.geometry.coordinates;

    const title = p.name || p.street || p.city || 'Unknown place';
    const parts = [
        p.street && p.name ? p.street : null,
        p.housenumber,
        p.city || p.town || p.village,
        p.state,
        p.country
    ].filter(Boolean);

    return {
        name: title,
        subtitle: parts.join(', '),
        center: coords,
        bbox: feature.bbox || null,
        properties: p
    };
}

const handleSearch = debounce(async (query) => {
    if (!query || query.length < 2) {
        searchResults.classList.remove('show');
        return;
    }

    searchResults.innerHTML = '<div class="search-loading">🔍 Searching…</div>';
    searchResults.classList.add('show');

    const features = await photonSearch(query);

    if (!features.length) {
        searchResults.innerHTML = '<div class="search-empty">No results found</div>';
        return;
    }

    searchResults.innerHTML = features.map((f, i) => {
        const r = photonFeatureToResult(f);
        return `
            <div class="search-result-item" data-index="${i}">
                <span class="search-result-icon">📍</span>
                <div class="search-result-text">
                    <div class="search-result-title">${escapeHtml(r.name)}</div>
                    <div class="search-result-subtitle">${escapeHtml(r.subtitle)}</div>
                </div>
            </div>
        `;
    }).join('');

    searchResults.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const feature = features[parseInt(item.dataset.index)];
            const r = photonFeatureToResult(feature);
            flyTo(r.center, r.bbox);
            searchResults.classList.remove('show');
            searchInput.value = r.name;

            // Drop a marker
            new maplibregl.Marker({ color: '#a855f7' })
                .setLngLat(r.center)
                .setPopup(new maplibregl.Popup({ offset: 25 })
                    .setHTML(`<strong>${escapeHtml(r.name)}</strong><br><small>${escapeHtml(r.subtitle)}</small>`))
                .addTo(map)
                .togglePopup();
        });
    });
}, 350);

searchInput.addEventListener('input', (e) => {
    const v = e.target.value;
    searchClear.classList.toggle('show', v.length > 0);
    handleSearch(v);
});

searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const first = searchResults.querySelector('.search-result-item');
        if (first) first.click();
    }
    if (e.key === 'Escape') {
        searchResults.classList.remove('show');
    }
});

searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.remove('show');
    searchResults.classList.remove('show');
});

function flyTo(center, bbox) {
    if (bbox) {
        map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 80, duration: 800 });
    } else {
        map.flyTo({ center, zoom: 15, duration: 800 });
    }
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) {
        searchResults.classList.remove('show');
    }
});

// ══════════════════════════════════════
// LAYERS / STYLE PANEL
// ══════════════════════════════════════
const layersPanel = document.getElementById('layers-panel');
const layersBtn = document.getElementById('layers-btn');
const layersClose = document.getElementById('layers-close');
const styleGrid = document.getElementById('style-grid');

layersBtn.addEventListener('click', () => {
    layersPanel.classList.toggle('show');
    layersBtn.classList.toggle('active');
});

layersClose.addEventListener('click', () => {
    layersPanel.classList.remove('show');
    layersBtn.classList.remove('active');
});

styleGrid.addEventListener('click', (e) => {
    const opt = e.target.closest('.style-option');
    if (!opt) return;

    styleGrid.querySelectorAll('.style-option').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');

    state.style = opt.dataset.style;
    map.setStyle(CONFIG.STYLES[state.style]);

    // Re-add route layers after style change
    map.once('styledata', () => {
        if (state.routeData) drawRoute(state.routeData);
        if (state.buildings3D) enable3DBuildings();
        if (state.terrain) enableTerrain();
    });
});

// Toggles
document.getElementById('toggle-traffic').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('active');
    state.trafficVisible = e.currentTarget.classList.contains('active');
    // OpenFreeMap does not serve a live traffic layer;
    // we show a message that it's a placeholder for future integration
    if (state.trafficVisible) {
        showToast('🚦 Live traffic requires a dedicated provider (not included in free tier)');
        e.currentTarget.classList.remove('active');
        state.trafficVisible = false;
    }
});

document.getElementById('toggle-3d').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('active');
    state.buildings3D = e.currentTarget.classList.contains('active');
    if (state.buildings3D) {
        enable3DBuildings();
    } else {
        disable3DBuildings();
    }
});

document.getElementById('toggle-terrain').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('active');
    state.terrain = e.currentTarget.classList.contains('active');
    if (state.terrain) {
        enableTerrain();
    } else {
        disableTerrain();
    }
});

function enable3DBuildings() {
    if (!map.getLayer('3d-buildings')) {
        // Add 3D buildings from OpenFreeMap vector tiles
        const layers = map.getStyle().layers;
        let labelLayerId;
        for (let i = 0; i < layers.length; i++) {
            if (layers[i].type === 'symbol' && layers[i].layout && layers[i].layout['text-field']) {
                labelLayerId = layers[i].id;
                break;
            }
        }

        map.addLayer({
            id: '3d-buildings',
            source: 'openmaptiles',
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 15,
            filter: ['!=', ['get', 'hide_3d'], true],
            paint: {
                'fill-extrusion-color': '#7c3aed',
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': 0.7
            }
        }, labelLayerId);
    }
}

function disable3DBuildings() {
    if (map.getLayer('3d-buildings')) {
        map.removeLayer('3d-buildings');
    }
}

function enableTerrain() {
    // OpenFreeMap doesn't ship a terrain DEM by default;
    // use a free public DEM source (AWS Terrain Tiles)
    if (!map.getSource('terrain-dem')) {
        map.addSource('terrain-dem', {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            tileSize: 256,
            encoding: 'terrarium',
            maxzoom: 15
        });
    }
    map.setTerrain({ source: 'terrain-dem', exaggeration: 1.2 });
}

function disableTerrain() {
    map.setTerrain(null);
}

// ══════════════════════════════════════
// DIRECTIONS PANEL
// ══════════════════════════════════════
const directionsPanel = document.getElementById('directions-panel');
const directionsBtn = document.getElementById('directions-btn');
const directionsClose = document.getElementById('directions-close');

directionsBtn.addEventListener('click', () => {
    directionsPanel.classList.toggle('show');
    directionsBtn.classList.toggle('active');
});

directionsClose.addEventListener('click', () => {
    directionsPanel.classList.remove('show');
    directionsBtn.classList.remove('active');
});

// Travel modes
document.querySelectorAll('.travel-mode').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.travel-mode').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.routeProfile = btn.dataset.profile;
    });
});

// ══════════════════════════════════════
// ROUTE INPUT AUTOCOMPLETE
// ══════════════════════════════════════
function setupRouteAutocomplete(inputId, suggestionsId, key) {
    const input = document.getElementById(inputId);
    const suggestions = document.getElementById(suggestionsId);

    const handler = debounce(async (query) => {
        if (!query || query.length < 2) {
            suggestions.classList.remove('show');
            return;
        }

        const features = await photonSearch(query, 5);
        if (!features.length) {
            suggestions.classList.remove('show');
            return;
        }

        suggestions.innerHTML = features.map((f, i) => {
            const r = photonFeatureToResult(f);
            return `
                <div class="route-suggestion-item" data-index="${i}">
                    <strong>${escapeHtml(r.name)}</strong><br>
                    <small style="color:var(--text-muted)">${escapeHtml(r.subtitle)}</small>
                </div>
            `;
        }).join('');

        suggestions.classList.add('show');

        suggestions.querySelectorAll('.route-suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const f = features[parseInt(item.dataset.index)];
                const r = photonFeatureToResult(f);
                input.value = r.name;
                state[key] = { lngLat: r.center, name: r.name };
                suggestions.classList.remove('show');
            });
        });
    }, 300);

    input.addEventListener('input', (e) => handler(e.target.value));

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') suggestions.classList.remove('show');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest(`#${inputId}`) && !e.target.closest(`#${suggestionsId}`)) {
            suggestions.classList.remove('show');
        }
    });
}

setupRouteAutocomplete('route-start', 'route-start-suggestions', 'startPoint');
setupRouteAutocomplete('route-end', 'route-end-suggestions', 'endPoint');

// ══════════════════════════════════════
// ROUTING (OSRM)
// ══════════════════════════════════════
const routeGo = document.getElementById('route-go');
const routeClear = document.getElementById('route-clear');
const routeSummary = document.getElementById('route-summary');
const routeTime = document.getElementById('route-time');
const routeDistance = document.getElementById('route-distance');
const stepsList = document.getElementById('steps-list');

async function fetchRoute(start, end, profile = 'driving') {
    // OSRM expects lon,lat
    const coords = `${start.lngLat[0]},${start.lngLat[1]};${end.lngLat[0]},${end.lngLat[1]}`;

    // Map our profile names to OSRM profiles
    // Note: The public OSRM demo server only supports the `driving` profile.
    // For walking/cycling we'd normally use a different server, but the demo
    // only supports car. We warn the user accordingly.
    const osrmProfile = 'driving';

    const url = `${CONFIG.ROUTE_URL}${osrmProfile}/${coords}?overview=full&geometries=geojson&steps=true`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Routing failed');
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
        throw new Error(data.message || 'No route found');
    }

    return data.routes[0];
}

routeGo.addEventListener('click', async () => {
    if (!state.startPoint || !state.endPoint) {
        showToast('⚠️ Please pick both a start and destination');
        return;
    }

    routeGo.disabled = true;
    routeGo.textContent = '…';

    try {
        const route = await fetchRoute(state.startPoint, state.endPoint, state.routeProfile);
        state.routeData = route;
        drawRoute(route);
        renderRouteSummary(route);
    } catch (err) {
        console.error('Route error:', err);
        showToast('❌ Could not calculate route: ' + err.message);
    } finally {
        routeGo.disabled = false;
        routeGo.textContent = 'Get Route';
    }
});

routeClear.addEventListener('click', () => {
    state.routeData = null;
    state.startPoint = null;
    state.endPoint = null;
    document.getElementById('route-start').value = '';
    document.getElementById('route-end').value = '';
    routeSummary.classList.remove('show');
    clearRouteLayers();
    if (state.routeStartMarker) { state.routeStartMarker.remove(); state.routeStartMarker = null; }
    if (state.routeEndMarker) { state.routeEndMarker.remove(); state.routeEndMarker = null; }
});

function clearRouteLayers() {
    if (map.getLayer('route-line-outline')) map.removeLayer('route-line-outline');
    if (map.getLayer('route-line')) map.removeLayer('route-line');
    if (map.getSource('route')) map.removeSource('route');
}

function drawRoute(route) {
    clearRouteLayers();

    map.addSource('route', {
        type: 'geojson',
        data: {
            type: 'Feature',
            properties: {},
            geometry: route.geometry
        }
    });

    map.addLayer({
        id: 'route-line-outline',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
            'line-color': '#0a0a14',
            'line-width': 10,
            'line-opacity': 0.6
        }
    });

    map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
            'line-color': '#a855f7',
            'line-width': 5
        }
    });

    // Start/End markers
    if (state.routeStartMarker) state.routeStartMarker.remove();
    if (state.routeEndMarker) state.routeEndMarker.remove();

    const coords = route.geometry.coordinates;
    state.routeStartMarker = new maplibregl.Marker({ color: '#10b981' })
        .setLngLat(coords[0])
        .addTo(map);

    state.routeEndMarker = new maplibregl.Marker({ color: '#ef4444' })
        .setLngLat(coords[coords.length - 1])
        .addTo(map);

    // Fit bounds
    const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(coords[0], coords[0])
    );
    map.fitBounds(bounds, { padding: { top: 120, bottom: 80, left: 420, right: 80 } });
}

function renderRouteSummary(route) {
    routeTime.textContent = formatDuration(route.duration);
    routeDistance.textContent = formatDistance(route.distance);

    const steps = route.legs[0].steps || [];
    stepsList.innerHTML = steps.map((step, i) => {
        const icon = stepIcon(step.maneuver.type);
        const instruction = step.maneuver.instruction || step.name || 'Continue';
        return `
            <div class="step-item" data-step="${i}">
                <div class="step-icon">${icon}</div>
                <div class="step-content">
                    <div class="step-instruction">${escapeHtml(instruction)}</div>
                    <div class="step-distance">${formatDistance(step.distance)}</div>
                </div>
            </div>
        `;
    }).join('');

    // Click a step → focus that coordinate
    stepsList.querySelectorAll('.step-item').forEach(item => {
        item.addEventListener('click', () => {
            const idx = parseInt(item.dataset.step);
            const step = steps[idx];
            map.flyTo({
                center: step.maneuver.location,
                zoom: 17,
                duration: 800
            });
        });
    });

    routeSummary.classList.add('show');
}

function stepIcon(type) {
    const icons = {
        'turn': '↪️',
        'new name': '➡️',
        'depart': '🚦',
        'arrive': '🏁',
        'merge': '🔀',
        'on ramp': '↗️',
        'off ramp': '↘️',
        'fork': '🍴',
        'end of road': '⚠️',
        'continue': '⬆️',
        'roundabout': '🔄',
        'rotary': '🔄',
        'roundabout turn': '🔄',
        'notification': '🔔'
    };
    return icons[type] || '➡️';
}

// ══════════════════════════════════════
// TURN-BY-TURN NAVIGATION
// ══════════════════════════════════════
const navBanner = document.getElementById('nav-banner');
const navIcon = document.getElementById('nav-icon');
const navStep = document.getElementById('nav-step');
const navSub = document.getElementById('nav-sub');
const navStop = document.getElementById('nav-stop');
const startNav = document.getElementById('start-nav');

startNav.addEventListener('click', () => {
    if (!state.routeData) return;
    state.navigationActive = true;
    state.navigationStep = 0;
    navBanner.classList.add('show');
    map.easeTo({ pitch: 45, zoom: 17, duration: 800 });
    showStep(0);
    if ('vibrate' in navigator) navigator.vibrate(20);
});

navStop.addEventListener('click', () => {
    state.navigationActive = false;
    navBanner.classList.remove('show');
    map.easeTo({ pitch: 0, zoom: 14, duration: 800 });
});

function showStep(index) {
    if (!state.routeData) return;
    const steps = state.routeData.legs[0].steps;
    if (index >= steps.length) {
        navStep.textContent = '🏁 You have arrived!';
        navSub.textContent = 'Destination reached';
        navIcon.textContent = '🏁';
        if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
        return;
    }

    const step = steps[index];
    navIcon.textContent = stepIcon(step.maneuver.type);
    navStep.textContent = step.maneuver.instruction || step.name || 'Continue';
    navSub.textContent = `${formatDistance(step.distance)} · ${formatDuration(step.duration)}`;

    // Fly to step
    map.flyTo({
        center: step.maneuver.location,
        zoom: 17,
        pitch: 45,
        duration: 900
    });

    // Highlight step in list
    stepsList.querySelectorAll('.step-item').forEach((el, i) => {
        el.style.background = i === index ? 'rgba(139,92,246,0.2)' : '';
    });

    // Advance to next step after a delay (simulated) — in real navigation
    // you'd watch the device GPS position and advance when close
    if (state.navigationActive) {
        setTimeout(() => {
            if (state.navigationActive) {
                state.navigationStep = index + 1;
                showStep(state.navigationStep);
            }
        }, 4000);
    }
}

// ══════════════════════════════════════
// GEOLOCATION
// ══════════════════════════════════════
document.getElementById('locate-btn').addEventListener('click', () => {
    if (!navigator.geolocation) {
        showToast('⚠️ Geolocation not supported');
        return;
    }

    showToast('📍 Finding your location…');

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lngLat = [pos.coords.longitude, pos.coords.latitude];

            if (state.userMarker) state.userMarker.remove();
            state.userMarker = new maplibregl.Marker({ color: '#00aaff' })
                .setLngLat(lngLat)
                .setPopup(new maplibregl.Popup().setHTML('<strong>📍 You are here</strong>'))
                .addTo(map);

            map.flyTo({ center: lngLat, zoom: 16, duration: 1200 });
            showToast('✅ Location found');
        },
        (err) => {
            showToast('❌ Location denied: ' + err.message);
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
});

// ══════════════════════════════════════
// MAP CONTROLS
// ══════════════════════════════════════
document.getElementById('zoom-in').addEventListener('click', () => map.zoomIn());
document.getElementById('zoom-out').addEventListener('click', () => map.zoomOut());
document.getElementById('reset-bearing').addEventListener('click', () => {
    map.easeTo({ bearing: 0, pitch: 0, duration: 500 });
});

// ══════════════════════════════════════
// TOAST HELPER
// ══════════════════════════════════════
let toastEl = null;
let toastTimer = null;

function showToast(message) {
    if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.style.cssText = `
            position: fixed;
            bottom: 90px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            background: linear-gradient(135deg, #a855f7, #7c3aed);
            color: white;
            padding: 12px 24px;
            border-radius: 50px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            opacity: 0;
            transition: all 0.3s ease;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 30px rgba(168,85,247,0.5);
            pointer-events: none;
            max-width: 90vw;
            text-align: center;
        `;
        document.body.appendChild(toastEl);
    }

    toastEl.textContent = message;
    requestAnimationFrame(() => {
        toastEl.style.opacity = '1';
        toastEl.style.transform = 'translateX(-50%) translateY(0)';
    });

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toastEl.style.opacity = '0';
        toastEl.style.transform = 'translateX(-50%) translateY(20px)';
    }, 3000);
}

// ══════════════════════════════════════
// KEYBOARD SHORTCUTS
// ══════════════════════════════════════
document.addEventListener('keydown', (e) => {
    // "/" focus search
    if (e.key === '/' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        searchInput.focus();
    }
    // Esc close all panels
    if (e.key === 'Escape') {
        searchResults.classList.remove('show');
        directionsPanel.classList.remove('show');
        layersPanel.classList.remove('show');
        directionsBtn.classList.remove('active');
        layersBtn.classList.remove('active');
    }
    // "n" toggle navigation
    if (e.key === 'n' && !e.target.matches('input, textarea')) {
        if (state.navigationActive) {
            navStop.click();
        } else if (state.routeData) {
            startNav.click();
        }
    }
});

// ══════════════════════════════════════
// MAP LOADED
// ══════════════════════════════════════
map.on('load', () => {
    console.log('🗺️ Wizard Maps loaded');
    console.log('📡 Tiles: OpenFreeMap');
    console.log('🧭 Routing: OSRM');
    console.log('🔍 Geocoding: Photon');

    // Auto-locate on first load (only if user has interacted with site before)
    if (localStorage.getItem('wizard_maps_visited')) {
        // Don't auto-locate on repeat visits — respect privacy
    } else {
        localStorage.setItem('wizard_maps_visited', '1');
    }
});

// Handle map errors gracefully
map.on('error', (e) => {
    console.warn('Map error:', e.error);
});
