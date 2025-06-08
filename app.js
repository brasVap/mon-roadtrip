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

// --- À compléter : calcul de route (placeholder pour l'instant)
function calculateRoute() {
    // Ici tu mettras ton code de calcul d'itinéraire
    // Exemple : appel API OpenRouteService
    console.log('Calcul de l\'itinéraire avec', etapes.length, 'étapes');
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
