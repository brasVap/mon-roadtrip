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

// Calculer l'itinéraire
function calculateRoute() {
    if (etapes.length < 2) return;

    const coordinates = etapes.map(e => [e.lon, e.lat]);

    fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
        method: 'POST',
        headers: {
            'Authorization': '5b3ce3597851110001cf6248d5c0879a1b0640caab762e653170a8f5',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            coordinates: coordinates
        })
    })
    .then(response => response.json())
    .then(data => {
        if (routeLine) map.removeLayer(routeLine);

        routeLine = L.geoJSON(data, {
            style: { color: 'red', weight: 5 }
        }).addTo(map);

        // Zoom sur l'itinéraire
        map.fitBounds(routeLine.getBounds());

        // Affichage distance + temps
        const summary = data.features[0].properties.summary;
        const distanceKm = (summary.distance / 1000).toFixed(1);
        const durationMin = Math.round(summary.duration / 60);

        const popupContent = `⏱️ ${Math.floor(durationMin / 60)} h ${durationMin % 60} min<br>🚗 ${distanceKm} km`;

        if (routePopup) map.closePopup(routePopup);
        routePopup = L.popup()
            .setLatLng(routeLine.getBounds().getCenter())
            .setContent(popupContent)
            .openOn(map);
    })
    .catch(() => {
        alert('Erreur lors du calcul de l\'itinéraire.');
    });
}

// Recherche avec OpenCage
var searchInput = document.getElementById('search');
var awesomplete = new Awesomplete(searchInput);

searchInput.addEventListener('input', function () {
    if (this.value.length < 3) return;

    fetch(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(this.value)}&key=62fab8999c0f444d9ab79076aead5a15&limit=5&countrycode=us`)
        .then(response => response.json())
        .then(data => {
            const suggestions = data.results.map(result => ({
                label: `${result.components.city || result.components.town || result.components.village || ''}, ${result.components.state || ''}, ${result.components.country || ''}`,
                value: result.formatted,
                lat: result.geometry.lat,
                lon: result.geometry.lng
            }));

            awesomplete.list = suggestions.map(s => s.label);

            awesomplete._suggestions = suggestions; // on garde pour sélectionner
        });
});

searchInput.addEventListener('awesomplete-selectcomplete', function () {
    const selected = awesomplete._suggestions.find(s => s.label === this.value);
    if (selected) {
        map.setView([selected.lat, selected.lon], 10);
        addEtape(selected.lat, selected.lon, selected.value);
        this.value = '';
    }
});

// Afficher / cacher les détails
document.getElementById('toggle-details').addEventListener('click', () => {
    const details = document.getElementById('details-segments');
    if (details.style.display === 'none') {
        details.style.display = 'block';
    } else {
        details.style.display = 'none';
    }
});

// ✅ Charger les POI (National Parks + Monuments + Scenic Points)
fetch('poi_nationalparks.geojson')
    .then(response => response.json())
    .then(poiData => {
        L.geoJSON(poiData, {
            pointToLayer: function (feature, latlng) {
                return L.marker(latlng, {
                    icon: L.icon({
                        iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448610.png',
                        iconSize: [25, 25],
                        iconAnchor: [12, 24]
                    })
                }).bindPopup(`<b>${feature.properties.name}</b>`);
            }
        }).addTo(map);
    });

