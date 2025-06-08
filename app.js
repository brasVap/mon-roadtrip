// Initialisation de la carte
var map = L.map('map').setView([46.5, 2], 6);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Variables
var etapes = [];
var routeLine = null;
var routePopup = null;

// Ajouter une étape
function addEtape(lat, lon, name) {
    etapes.push({ lat, lon, name });
    updateEtapesList();
}

// Supprimer une étape
function removeEtape(index) {
    etapes.splice(index, 1);
    updateEtapesList();
}

// Réinitialiser
document.getElementById('reset').addEventListener('click', () => {
    etapes = [];
    updateEtapesList();

    if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
    }

    if (routePopup) {
        map.closePopup(routePopup);
        routePopup = null;
    }
});

// Mettre à jour liste étapes + recalculer itinéraire
function updateEtapesList() {
    const list = document.getElementById('etapes-list');
    list.innerHTML = '';

    etapes.forEach((etape, index) => {
        const li = document.createElement('li');
        li.className = 'etape';
        li.innerHTML = `${etape.name} <button class="supprimer" onclick="removeEtape(${index})">🗑️</button>`;
        list.appendChild(li);
    });

    calculateRoute();
}

// Sauvegarder Roadtrip
document.getElementById('save-roadtrip').addEventListener('click', () => {
    const json = JSON.stringify(etapes, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'roadtrip.json';
    a.click();
    URL.revokeObjectURL(url);
});

// Charger Roadtrip
document.getElementById('load-roadtrip-button').addEventListener('click', () => {
    document.getElementById('load-roadtrip').click();
});

document.getElementById('load-roadtrip').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const loadedEtapes = JSON.parse(e.target.result);
            etapes = loadedEtapes;
            updateEtapesList();
        } catch (error) {
            alert('Erreur lors du chargement du fichier : ' + error.message);
        }
    };
    reader.readAsText(file);
});

// Clic sur la carte → ajouter une étape
map.on('click', function(e) {
    const name = prompt('Nom de l\'étape :');
    if (name) {
        addEtape(e.latlng.lat, e.latlng.lng, name);
    }
});

// Clé API ORS et OpenCage
const apiKeyORS = '5b3ce3597851110001cf6248d5c0879a1b0640caab762e653170a8f5';
const apiKeyOpenCage = '62fab8999c0f444d9ab79076aead5a15';

// Calculer l'itinéraire
function calculateRoute() {
    if (etapes.length < 2) {
        if (routeLine) {
            map.removeLayer(routeLine);
            routeLine = null;
        }

        document.getElementById('itineraire-info').innerHTML = '';
        document.getElementById('details-segments').innerHTML = '';

        return;
    }

    const url = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

    const body = {
        coordinates: etapes.map(etape => [etape.lon, etape.lat])
    };

    fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': apiKeyORS,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    })
    .then(response => response.json())
    .then(data => {
        const coords = data.features[0].geometry.coordinates.map(c => [c[1], c[0]]);

        if (routeLine) {
            map.removeLayer(routeLine);
        }

        routeLine = L.polyline(coords, { color: 'blue', weight: 5 }).addTo(map);
        map.fitBounds(routeLine.getBounds());

        const summary = data.features[0].properties.summary;
        const distanceKm = (summary.distance / 1000).toFixed(1);
        const dureeMin = Math.round(summary.duration / 60);

        document.getElementById('itineraire-info').innerHTML = `
            <p>Distance totale : ${distanceKm} km</p>
            <p>Durée estimée : ${dureeMin} min</p>
        `;

        const segments = data.features[0].properties.segments[0].steps;
        document.getElementById('details-segments').innerHTML = segments.map(step => `
            <p>${step.instruction} - ${step.distance.toFixed(0)} m</p>
        `).join('');
    })
    .catch(err => console.error('Erreur API ORS:', err));
}

// Recherche ville avec Autocomplete (Awesomplete)
var searchInput = document.getElementById('search');
var awesomplete = new Awesomplete(searchInput, {
    minChars: 2,
    maxItems: 5,
    autoFirst: true
});

searchInput.addEventListener('input', function() {
    const query = this.value;
    if (query.length < 2) return;

    fetch(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=${apiKeyOpenCage}&limit=5`)
    .then(response => response.json())
    .then(data => {
        if (data.results.length > 0) {
            const list = data.results.map(result => result.formatted);
            awesomplete.list = list;
        }
    })
    .catch(err => console.error('Erreur API OpenCage:', err));
});

// Quand l'utilisateur sélectionne une suggestion → ajouter l'étape
searchInput.addEventListener('awesomplete-selectcomplete', function(event) {
    const selectedPlace = event.text.value || event.text;

    fetch(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(selectedPlace)}&key=${apiKeyOpenCage}`)
    .then(response => response.json())
    .then(data => {
        if (data.results.length > 0) {
            const result = data.results[0];
            const lat = result.geometry.lat;
            const lon = result.geometry.lng;
            const name = result.formatted;

            addEtape(lat, lon, name);
            map.setView([lat, lon], 10);
        }
    })
    .catch(err => console.error('Erreur API OpenCage:', err));
});

// POI
fetch('poi.geojson')
    .then(response => response.json())
    .then(data => {
        L.geoJSON(data, {
            pointToLayer: (feature, latlng) => L.marker(latlng).bindPopup(feature.properties.name)
        }).addTo(map);
    });

fetch('poi_nationalparks.geojson')
    .then(response => response.json())
    .then(data => {
        L.geoJSON(data, {
            pointToLayer: (feature, latlng) => L.marker(latlng).bindPopup(feature.properties.name)
        }).addTo(map);
    });
