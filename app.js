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
            updateEtapesList();
            updateItineraire();
        };

        const prev = document.createElement('button');
        prev.textContent = '<';
        prev.className = 'day-nav';
        prev.onclick = () => {
            etape.day = Math.max(1, etape.day - 1);
            updateEtapesList();
            updateItineraire();
        };

        const next = document.createElement('button');
        next.textContent = '>';
        next.className = 'day-nav';
        next.onclick = () => {
            etape.day += 1;
            updateEtapesList();
            updateItineraire();
        };

        const edit = document.createElement('button');
        edit.textContent = 'Editer';
        edit.className = 'day-nav';
        edit.onclick = () => {
            etape.notes = prompt('Notes date/heure :', etape.notes || '') || '';
            updateEtapesList();
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
                updateEtapesList();
                updateItineraire();
            }
        });
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

                const day = parseInt(prompt('Jour de l\'\u00e9tape ?', '1'), 10) || 1;
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
                });
                etape.marker = marker;

                etapes.push(etape);
                updateEtapesList();
                updateItineraire();

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
});

