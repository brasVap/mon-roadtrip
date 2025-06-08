// Initialiser la carte
var map = L.map('map').setView([37.8, -96], 5);

// Fond de carte
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Liste des étapes
var etapes = [];
var routeLine = null;
var routePopup = null;

// Fonction pour actualiser l'affichage des étapes
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

// Sauvegarde Roadtrip
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

// Chargement Roadtrip
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

// Clic sur la carte pour ajouter une étape
map.on('click', function(e) {
    const name = prompt('Nom de l\'étape :');
    if (name) {
        addEtape(e.latlng.lat, e.latlng.lng, name);
    }
});

// Calcul de l'itinéraire (OpenRouteService)
function calculateRoute() {
    if (etapes.length < 2) {
        // Pas assez d’étapes pour tracer une route
        if (routeLine) {
            map.removeLayer(routeLine);
            routeLine = null;
        }

        document.getElementById('itineraire-info').innerHTML = '';
        document.getElementById('details-segments').innerHTML = '';

        return;
    }

    const apiKey = '5b3ce3597851110001cf6248xxxxxxxxxxxxxxxxxxxxxxxx'; // 🔑 Mets ta clé OpenRouteService ici !
    const url = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

    const body = {
        coordinates: etapes.map(etape => [etape.lon, etape.lat])
    };

    fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    })
    .then(response => response.json())
    .then(data => {
        const coords = data.features[0].geometry.coordinates.map(c => [c[1], c[0]]);

        // Supprimer ancienne route
        if (routeLine) {
            map.removeLayer(routeLine);
        }

        // Afficher nouvelle route
        routeLine = L.polyline(coords, { color: 'blue', weight: 5 }).addTo(map);
        map.fitBounds(routeLine.getBounds());

        // Afficher résumé
        const summary = data.features[0].properties.summary;
        const distanceKm = (summary.distance / 1000).toFixed(1);
        const dureeMin = Math.round(summary.duration / 60);

        document.getElementById('itineraire-info').innerHTML = `
            <p>Distance totale : ${distanceKm} km</p>
            <p>Durée estimée : ${dureeMin} min</p>
        `;

        // Afficher détails des segments
        const segments = data.features[0].properties.segments[0].steps;
        document.getElementById('details-segments').innerHTML = segments.map(step => `
            <p>${step.instruction} - ${step.distance.toFixed(0)} m</p>
        `).join('');
    })
    .catch(err => console.error('Erreur API ORS:', err));
}

// Chargement des POI
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
