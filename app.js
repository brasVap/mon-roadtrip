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
const shareButton = document.getElementById('share');
const poiMarkers = L.layerGroup().addTo(map);

function saveEtapes() {
    localStorage.setItem('etapes', JSON.stringify(etapes));
}

function loadEtapesFromStorage() {
    const data = localStorage.getItem('etapes');
    if (data) {
        try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
                etapes.push(...parsed);
            }
        } catch (e) {
            console.error('Erreur lecture localStorage:', e);
        }
    }
}

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
            saveEtapes();
        };

        li.appendChild(btn);
        etapesList.appendChild(li);
    });
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
                saveEtapes();

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
    saveEtapes();
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
        saveEtapes();
    }
});

function loadFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const data = params.get('data');
    if (data) {
        try {
            const json = decodeURIComponent(atob(data));
            const parsed = JSON.parse(json);
            if (Array.isArray(parsed)) {
                etapes.push(...parsed);
                return true;
            }
        } catch (e) {
            console.error('Erreur lecture URL:', e);
        }
    }
    return false;
}

document.addEventListener('DOMContentLoaded', () => {
    const loaded = loadFromQuery();
    if (!loaded) {
        loadEtapesFromStorage();
    }
    if (etapes.length > 0) {
        updateEtapesList();
        updateItineraire();
        saveEtapes();
    }
});

shareButton.addEventListener('click', () => {
    const encoded = btoa(encodeURIComponent(JSON.stringify(etapes)));
    window.location.search = `?data=${encoded}`;
});
