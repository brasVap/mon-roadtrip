// app.js complet avec autocomplétion Awesomplete (Roadtrippers-like)

// Initialisation de la carte
const map = L.map('map').setView([43.6, 3.9], 6);

// Fond de carte OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Variables globales
const etapes = [];
const etapesList = document.getElementById('etapes-list');
const searchInput = document.getElementById('search');
const resetButton = document.getElementById('reset');
const poiMarkers = L.layerGroup().addTo(map);
const poiList = document.getElementById('poi-list');
const toggleHotels = document.getElementById('toggle-hotels');
const toggleRestaurants = document.getElementById('toggle-restaurants');
const toggleAttractions = document.getElementById('toggle-attractions');

const hotelsLayer = L.layerGroup();
const restaurantsLayer = L.layerGroup();
const attractionsLayer = L.layerGroup();

if (toggleHotels && toggleHotels.checked) hotelsLayer.addTo(map);
if (toggleRestaurants && toggleRestaurants.checked) restaurantsLayer.addTo(map);
if (toggleAttractions && toggleAttractions.checked) attractionsLayer.addTo(map);

function updateLayerToggle(layer, checkbox) {
    checkbox.addEventListener('change', e => {
        if (e.target.checked) {
            layer.addTo(map);
        } else {
            map.removeLayer(layer);
        }
    });
}

if (toggleHotels) updateLayerToggle(hotelsLayer, toggleHotels);
if (toggleRestaurants) updateLayerToggle(restaurantsLayer, toggleRestaurants);
if (toggleAttractions) updateLayerToggle(attractionsLayer, toggleAttractions);

// Fonction utilitaire pour charger des POI
function loadPOI(url) {
    fetch(url)
        .then(response => response.json())
        .then(data => {
            L.geoJSON(data, {
                pointToLayer: (feature, latlng) => {
                    return L.marker(latlng)
                        .bindPopup(feature.properties.name || 'POI');
                }
            }).addTo(poiMarkers);
        })
        .catch(err => console.error(`Erreur chargement ${url}:`, err));
}

// Fonction reset POI
function resetPOI() {
    poiMarkers.clearLayers();
    hotelsLayer.clearLayers();
    restaurantsLayer.clearLayers();
    attractionsLayer.clearLayers();
    if (poiList) poiList.innerHTML = '';
    loadPOI('poi.geojson');
    loadPOI('poi_nationalparks.geojson');
}

// Chargement initial des POI
resetPOI();

// Fonction pour mettre à jour la liste des étapes
function updateEtapesList() {
    etapesList.innerHTML = '';
    etapes.forEach((etape, index) => {
        const li = document.createElement('li');
        li.className = 'etape';
        li.textContent = etape.name;

        const btn = document.createElement('button');
        btn.textContent = 'Supprimer';
        btn.className = 'supprimer';
        btn.onclick = () => {
            etapes.splice(index, 1);
            updateEtapesList();
            updateItineraire();
        };

        li.appendChild(btn);
        etapesList.appendChild(li);
    });
}

function addPOIToList(name, lat, lon) {
    if (!poiList) return;
    const li = document.createElement('li');
    li.textContent = name;
    const btn = document.createElement('button');
    btn.textContent = 'Ajouter à l\u2019itin\u00e9raire';
    btn.onclick = () => {
        const etape = { name, lat, lon };
        etapes.push(etape);
        updateEtapesList();
        updateItineraire();
    };
    li.appendChild(btn);
    poiList.appendChild(li);
}

function fetchCategoryPOI(key, value, bbox, layer) {
    const query = `[out:json][timeout:25];(node["${key}"="${value}"](${bbox});way["${key}"="${value}"](${bbox});relation["${key}"="${value}"](${bbox}););out center;`;
    fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query
    })
    .then(r => r.json())
    .then(data => {
        layer.clearLayers();
        data.elements.forEach(el => {
            const lat = el.lat || (el.center && el.center.lat);
            const lon = el.lon || (el.center && el.center.lon);
            if (lat && lon) {
                const nom = (el.tags && el.tags.name) ? el.tags.name : value;
                L.marker([lat, lon]).addTo(layer).bindPopup(nom);
                addPOIToList(nom, lat, lon);
            }
        });
    })
    .catch(err => console.error('Erreur chargement POI', value, err));
}

function fetchPOIsForRoute(geometry) {
    if (!geometry || !geometry.coordinates) return;
    if (poiList) poiList.innerHTML = '';
    let minLat = 90, minLon = 180, maxLat = -90, maxLon = -180;
    geometry.coordinates.forEach(coord => {
        const [lon, lat] = coord;
        if (lat < minLat) minLat = lat;
        if (lon < minLon) minLon = lon;
        if (lat > maxLat) maxLat = lat;
        if (lon > maxLon) maxLon = lon;
    });
    const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;
    fetchCategoryPOI('tourism', 'hotel', bbox, hotelsLayer);
    fetchCategoryPOI('amenity', 'restaurant', bbox, restaurantsLayer);
    fetchCategoryPOI('tourism', 'attraction', bbox, attractionsLayer);
}

// updateItineraire() avec TA clé ORS
const ORS_API_KEY = '5b3ce3597851110001cf6248d5c0879a1b0640caab762e653170a8f5';
let itineraireLayer = null;

function updateItineraire() {
    if (etapes.length < 2) {
        document.getElementById('itineraire-info').innerHTML = '<p>Ajoutez au moins 2 étapes pour calculer l’itinéraire.</p>';
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
            <h3>Détail par segment :</h3>
            <ul>
                ${data.features[0].properties.segments.map((segment, i) => `
                    <li>Segment ${i + 1} : ${(segment.distance / 1000).toFixed(1)} km, ${Math.round(segment.duration / 60)} min</li>
                `).join('')}
            </ul>
        `;

        fetchPOIsForRoute(data.features[0].geometry);
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

                const etape = {
                    name: place.display_name,
                    lat,
                    lon
                };

                etapes.push(etape);
                updateEtapesList();
                updateItineraire();

                map.setView([lat, lon], 12);
                L.marker([lat, lon]).addTo(map).bindPopup(place.display_name).openPopup();

                searchInput.value = '';
            } else {
                alert('Lieu non trouvé.');
            }
        })
        .catch(err => console.error('Erreur ajout étape Nominatim:', err));
});

// Bouton reset
resetButton.addEventListener('click', function() {
    etapes.length = 0;
    updateEtapesList();
    updateItineraire();
    map.setView([43.6, 3.9], 6);
    resetPOI();
});

// Initialisation de Sortable pour la liste des étapes
new Sortable(etapesList, {
    animation: 150,
    onEnd: () => {
        const newOrder = [];
        etapesList.querySelectorAll('li').forEach(li => {
            const name = li.firstChild.textContent;
            const etape = etapes.find(e => e.name === name);
            if (etape) newOrder.push(etape);
        });
        etapes.splice(0, etapes.length, ...newOrder);
        updateItineraire();
    }
});