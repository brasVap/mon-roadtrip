// app.js complet avec autocomplétion Awesomplete (Roadtrippers-like)

// Fonds de carte
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
});
const satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles &copy; Esri' }
);
const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenTopoMap contributors'
});

// Initialisation de la carte avec OSM par défaut
const map = L.map('map', { layers: [osm] }).setView([43.6, 3.9], 6);

const baseLayers = { osm, satellite, topo };

function updateBasemap() {
    Object.values(baseLayers).forEach(l => map.removeLayer(l));
    const layer = baseLayers[basemapSelect.value] || osm;
    layer.addTo(map);
}

basemapSelect.addEventListener('change', updateBasemap);
updateBasemap();

// Variables globales
const etapes = [];
const etapesList = document.getElementById('etapes-list');
const searchInput = document.getElementById('search');
const resetButton = document.getElementById('reset');
const toggleBtn = document.getElementById('toggle-details');
const detailsDiv = document.getElementById('details-segments');
const shareBtn = document.getElementById('share-trip');
const poiMarkers = L.layerGroup();
const categoryFiltersDiv = document.getElementById('category-filters');
const basemapSelect = document.getElementById('basemap-select');
const poiToggleBtn = document.getElementById('toggle-poi');
const categoryLayers = {};
const categoriesSet = new Set();
let autoOptimize = true;
let poiVisible = true;
if (poiVisible) poiMarkers.addTo(map);

// Fonction utilitaire pour charger des POI
function createCategoryCheckbox(cat) {
    if (categoryFiltersDiv.querySelector(`input[data-cat="${cat}"]`)) return;
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = true;
    input.dataset.cat = cat;
    input.addEventListener('change', updatePOIFilters);
    label.appendChild(input);
    label.appendChild(document.createTextNode(' ' + cat));
    categoryFiltersDiv.appendChild(label);
}

function loadPOI(url) {
    fetch(url)
        .then(response => response.json())
        .then(data => {
            data.features.forEach(f => {
                const cat = f.properties.category || 'other';
                categoriesSet.add(cat);
                if (!categoryLayers[cat]) {
                    categoryLayers[cat] = L.layerGroup().addTo(poiMarkers);
                }
                const marker = L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]])
                    .bindPopup(f.properties.name || 'POI');
                categoryLayers[cat].addLayer(marker);
            });
            categoriesSet.forEach(createCategoryCheckbox);
            updatePOIFilters();
        })
        .catch(err => console.error(`Erreur chargement ${url}:`, err));
}

function updatePOIFilters() {
    Object.entries(categoryLayers).forEach(([cat, layer]) => {
        const cb = categoryFiltersDiv.querySelector(`input[data-cat="${cat}"]`);
        if (cb && cb.checked) {
            if (!poiMarkers.hasLayer(layer)) poiMarkers.addLayer(layer);
        } else {
            if (poiMarkers.hasLayer(layer)) poiMarkers.removeLayer(layer);
        }
    });
}

// Fonction reset POI
function resetPOI() {
    poiMarkers.clearLayers();
    categoryFiltersDiv.innerHTML = '';
    Object.keys(categoryLayers).forEach(k => delete categoryLayers[k]);
    categoriesSet.clear();
    loadPOI('poi.geojson');
    loadPOI('poi_nationalparks.geojson');
    if (poiVisible && !map.hasLayer(poiMarkers)) {
        poiMarkers.addTo(map);
    }
}

// Chargement initial des POI
resetPOI();

function haversine(a, b) {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h = sinDLat * sinDLat + sinDLon * sinDLon * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.sqrt(h));
}

function optimizeItinerary() {
    if (!autoOptimize || etapes.length <= 2) return;
    const remaining = etapes.slice(1);
    const optimized = [etapes[0]];
    let current = etapes[0];
    while (remaining.length) {
        let best = 0;
        let bestDist = haversine(current, remaining[0]);
        for (let i = 1; i < remaining.length; i++) {
            const d = haversine(current, remaining[i]);
            if (d < bestDist) { bestDist = d; best = i; }
        }
        current = remaining.splice(best, 1)[0];
        optimized.push(current);
    }

    // 2-opt improvement
    let improved = true;
    while (improved) {
        improved = false;
        for (let i = 1; i < optimized.length - 1; i++) {
            for (let k = i + 1; k < optimized.length; k++) {
                const newRoute = optimized.slice();
                const segment = newRoute.slice(i, k).reverse();
                newRoute.splice(i, k - i, ...segment);
                const currentDist = optimized.reduce((acc, cur, idx) => {
                    if (idx === 0) return 0;
                    return acc + haversine(optimized[idx - 1], cur);
                }, 0);
                const newDist = newRoute.reduce((acc, cur, idx) => {
                    if (idx === 0) return 0;
                    return acc + haversine(newRoute[idx - 1], cur);
                }, 0);
                if (newDist + 1e-6 < currentDist) {
                    optimized.splice(0, optimized.length, ...newRoute);
                    improved = true;
                }
            }
        }
    }

    etapes.splice(0, etapes.length, ...optimized);
    renumberDays();
}

function renumberDays() {
    etapes.forEach((e, i) => { e.day = i + 1; });
}

function saveItinerary() {
    const data = etapes.map(e => ({
        name: e.name,
        lat: e.lat,
        lon: e.lon,
        day: e.day,
        notes: e.notes
    }));
    localStorage.setItem('roadtrip', JSON.stringify(data));
}

function loadItinerary(data) {
    const trip = data || JSON.parse(localStorage.getItem('roadtrip') || 'null');
    if (!trip) return;
    trip.forEach(step => {
        const etape = {
            name: step.name,
            lat: step.lat,
            lon: step.lon,
            day: step.day,
            notes: step.notes,
            marker: null
        };
        const marker = L.marker([step.lat, step.lon], { draggable: true }).addTo(map)
            .bindPopup(step.name);
        marker.on('dragend', e => {
            const ll = e.target.getLatLng();
            etape.lat = ll.lat;
            etape.lon = ll.lng;
            updateItineraire();
            saveItinerary();
        });
        etape.marker = marker;
        etapes.push(etape);
    });
    renumberDays();
    updateEtapesList();
    updateItineraire();
}

// Fonction pour mettre à jour la liste des étapes groupées par jour
function updateEtapesList() {
    etapesList.innerHTML = '';
    const days = {};

    etapes.forEach((etape, index) => {
        if (!days[etape.day]) {
            const section = document.createElement('div');
            section.className = 'day-section';
            const title = document.createElement('h3');
            title.textContent = `Jour ${etape.day}`;
            const ul = document.createElement('ul');
            ul.dataset.day = etape.day;
            section.appendChild(title);
            section.appendChild(ul);
            etapesList.appendChild(section);
            days[etape.day] = ul;
        }

        const li = document.createElement('li');
        li.className = 'etape';
        li.dataset.index = index;
        li.textContent = `${etape.name} - ${etape.notes || ''}`;

        const del = document.createElement('button');
        del.textContent = 'Supprimer';
        del.className = 'supprimer';
        del.onclick = () => {
            etape.marker.remove();
            etapes.splice(index, 1);
            renumberDays();
            updateEtapesList();
            updateItineraire();
            saveItinerary();
        };

        const prev = document.createElement('button');
        prev.textContent = '<';
        prev.className = 'day-nav';
        prev.onclick = () => {
            etape.day = Math.max(1, etape.day - 1);
            updateEtapesList();
            updateItineraire();
            saveItinerary();
        };

        const next = document.createElement('button');
        next.textContent = '>';
        next.className = 'day-nav';
        next.onclick = () => {
            etape.day += 1;
            updateEtapesList();
            updateItineraire();
            saveItinerary();
        };

        const edit = document.createElement('button');
        edit.textContent = 'Editer';
        edit.className = 'day-nav';
        edit.onclick = () => {
            etape.notes = prompt('Notes date/heure :', etape.notes || '') || '';
            updateEtapesList();
            saveItinerary();
        };

        li.appendChild(edit);
        li.appendChild(prev);
        li.appendChild(next);
        li.appendChild(del);

        days[etape.day].appendChild(li);
    });

    // Activation de Sortable pour chaque jour
    Object.values(days).forEach(ul => {
        new Sortable(ul, {
            animation: 150,
            onEnd: () => {
                const newOrder = [];
                document.querySelectorAll('.day-section ul').forEach(list => {
                    list.querySelectorAll('li').forEach(li => {
                        const idx = parseInt(li.dataset.index, 10);
                        if (!isNaN(idx)) newOrder.push(etapes[idx]);
                    });
                });
                etapes.splice(0, etapes.length, ...newOrder);
                renumberDays();
                updateEtapesList();
                updateItineraire();
                autoOptimize = false;
            }
        });
    });
    saveItinerary();
}

// updateItineraire() avec TA clé ORS
const ORS_API_KEY = '5b3ce3597851110001cf6248d5c0879a1b0640caab762e653170a8f5';
let itineraireLayer = null;

function updateItineraire() {
    if (etapes.length < 2) {
        document.getElementById('itineraire-info').innerHTML = '<p>Ajoutez au moins 2 étapes pour calculer l\u2019itinéraire.</p>';
        detailsDiv.innerHTML = '';
        if (itineraireLayer) {
            map.removeLayer(itineraireLayer);
            itineraireLayer = null;
        }
        return;
    }

    const coordinates = etapes.map(etape => [etape.lon, etape.lat]);

    fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': ORS_API_KEY
        },
        body: JSON.stringify({ coordinates })
    })
    .then(response => response.json())
    .then(data => {
        if (itineraireLayer) {
            map.removeLayer(itineraireLayer);
        }

        itineraireLayer = L.geoJSON(data, {
            style: { color: 'blue', weight: 5 }
        }).addTo(map);

        let distanceKm = 0;
        let dureeMin = 0;

        data.features[0].properties.segments.forEach(segment => {
            distanceKm += segment.distance / 1000;
            dureeMin += segment.duration / 60;
        });

        document.getElementById('itineraire-info').innerHTML = `
            <p><strong>Distance totale :</strong> ${distanceKm.toFixed(1)} km</p>
            <p><strong>Durée totale :</strong> ${Math.round(dureeMin)} min</p>
        `;
        detailsDiv.innerHTML = `
            <h3>Détail par segment :</h3>
            <ul>
                ${data.features[0].properties.segments.map((segment, i) => `
                    <li>Segment ${i + 1} : ${(segment.distance / 1000).toFixed(1)} km, ${Math.round(segment.duration / 60)} min</li>
                `).join('')}
            </ul>
        `;
    })
    .catch(err => {
        console.error('Erreur calcul itinéraire:', err);
        document.getElementById('itineraire-info').innerHTML = '<p>Erreur lors du calcul de l’itinéraire.</p>';
    });
}

// === Autocomplétion Awesomplete (Roadtrippers-like) ===

// Initialisation d'Awesomplete sur le champ #search
const awesomplete = new Awesomplete(searchInput, {
    minChars: 2,
    maxItems: 10,
    autoFirst: true
});

// Fonction de recherche dynamique vers Nominatim (debounce)
let liveSearchTimeout;

searchInput.addEventListener('input', function() {
    clearTimeout(liveSearchTimeout);
    const query = searchInput.value.trim();

    if (query.length < 2) {
        awesomplete.list = [];
        return;
    }

    liveSearchTimeout = setTimeout(() => {
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
            .then(response => response.json())
            .then(results => {
                const suggestions = results.map(place => {
    const parts = place.display_name.split(',').map(p => p.trim());
    const ville = parts[0] || '';
    const region = parts[parts.length - 2] || '';
    const pays = parts[parts.length - 1] || '';
    return `${ville}, ${region}, ${pays}`;
});
                awesomplete.list = suggestions;
            })
            .catch(err => console.error('Erreur autocomplétion Nominatim:', err));
    }, 300);
});

// Quand l'utilisateur sélectionne une suggestion
searchInput.addEventListener('awesomplete-selectcomplete', function(e) {
    const selectedName = e.text.value;

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(selectedName)}`)
        .then(response => response.json())
        .then(results => {
            if (results.length > 0) {
                const place = results[0];
                const lat = parseFloat(place.lat);
                const lon = parseFloat(place.lon);

                const day = etapes.length + 1;
                const notes = prompt('Notes date/heure :', '') || '';

                const etape = {
                    name: place.display_name,
                    lat,
                    lon,
                    day,
                    notes,
                    marker: null
                };

                const marker = L.marker([lat, lon], { draggable: true }).addTo(map)
                    .bindPopup(place.display_name);
                marker.on('dragend', eDrag => {
                    const ll = eDrag.target.getLatLng();
                    etape.lat = ll.lat;
                    etape.lon = ll.lng;
                    updateItineraire();
                    saveItinerary();
                });
                etape.marker = marker;

                etapes.push(etape);
                optimizeItinerary();
                updateEtapesList();
                updateItineraire();
                saveItinerary();

                map.setView([lat, lon], 12);
                marker.openPopup();

                searchInput.value = '';
            } else {
                alert('Lieu non trouv\u00e9.');
            }
        })
        .catch(err => console.error('Erreur ajout \u00e9tape Nominatim:', err));
});

// Bouton reset
resetButton.addEventListener('click', function() {
    etapes.forEach(e => e.marker.remove());
    etapes.length = 0;
    updateEtapesList();
    updateItineraire();
    map.setView([43.6, 3.9], 6);
    resetPOI();
    localStorage.removeItem('roadtrip');
    autoOptimize = true;
});

toggleBtn.addEventListener('click', () => {
    if (detailsDiv.style.display === 'none') {
        detailsDiv.style.display = 'block';
        toggleBtn.textContent = 'Masquer les détails';
    } else {
        detailsDiv.style.display = 'none';
        toggleBtn.textContent = 'Afficher les détails';
    }
});

shareBtn.addEventListener('click', () => {
    const data = etapes.map(({name, lat, lon, day, notes}) => ({name, lat, lon, day, notes}));
    const encoded = btoa(JSON.stringify(data));
    const url = new URL(window.location.href);
    url.searchParams.set('trip', encoded);
    prompt('Copiez ce lien pour partager votre itinéraire :', url.toString());
});

poiToggleBtn.addEventListener('click', () => {
    poiVisible = !poiVisible;
    if (poiVisible) {
        poiMarkers.addTo(map);
        poiToggleBtn.textContent = 'Masquer les POI';
    } else {
        map.removeLayer(poiMarkers);
        poiToggleBtn.textContent = 'Afficher les POI';
    }
});

// Chargement depuis l'URL ou le stockage local
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const tripParam = params.get('trip');
    if (tripParam) {
        try {
            const decoded = JSON.parse(atob(tripParam));
            loadItinerary(decoded);
        } catch (e) {
            console.error('Impossible de charger l\u2019itinéraire partagé:', e);
        }
    } else {
        loadItinerary();
    }
});

