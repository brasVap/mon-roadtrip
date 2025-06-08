// Ta clé API OpenRouteService → ta clé intégrée
const ORS_API_KEY = '5b3ce3597851110001cf6248d5c0879a1b0640caab762e653170a8f5';

// Initialiser la carte centrée sur le Portugal
var map = L.map('map').setView([39.5, -8.0], 6);

// Fond de carte OSM
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Charger étapes depuis localStorage
var etapes = JSON.parse(localStorage.getItem('etapes')) || [];
var markers = [];
var routeLayer = null;

// Historique des recherches
var historiqueRecherche = JSON.parse(localStorage.getItem('historiqueRecherche')) || [];

// Initialiser Awesomplete
var inputSearch = document.getElementById("search");
var awesomplete = new Awesomplete(inputSearch, {
    minChars: 1,
    maxItems: 10,
    autoFirst: true
});
awesomplete.sort = false; // Historique en premier

// Debounce
function debounce(func, delay) {
    let debounceTimer;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(context, args), delay);
    };
}

// Recherche intelligente → PHOTON !
inputSearch.addEventListener("input", debounce(function() {
    var query = inputSearch.value.trim();

    var suggestions = historiqueRecherche.filter(item => item.toLowerCase().includes(query.toLowerCase()));

    if (query.length >= 2) {
        fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=fr`)
        .then(response => response.json())
        .then(data => {
            var liveResults = data.features.map(item => item.properties.name + (item.properties.city ? ", " + item.properties.city : "") + (item.properties.country ? ", " + item.properties.country : ""));
            var allSuggestions = [...suggestions, ...liveResults.filter(item => !suggestions.includes(item))];
            awesomplete.list = allSuggestions;
        })
        .catch(error => {
            console.error('Erreur Photon:', error);
        });
    } else {
        awesomplete.list = suggestions;
    }
}, 300));

// Quand on valide une recherche → PHOTON
inputSearch.addEventListener("awesomplete-selectcomplete", function(evt) {
    var selectedLabel = evt.text.value;

    // Rechercher les coordonnées avec Photon
    fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(selectedLabel)}&limit=1&lang=fr`)
    .then(response => response.json())
    .then(data => {
        if (data.features.length > 0) {
            var result = data.features[0];
            var lat = result.geometry.coordinates[1];
            var lon = result.geometry.coordinates[0];

            // ✅ Nom propre
            var nomSimple = result.properties.name;

            if (result.properties.city) {
                nomSimple += ", " + result.properties.city;
            } else if (result.properties.country) {
                nomSimple += ", " + result.properties.country;
            }

            var etape = {
                nom: nomSimple,
                coord: [lat, lon]
            };
            etapes.push(etape);
            localStorage.setItem('etapes', JSON.stringify(etapes));
            afficherEtapes();

            // ✅ Centrer sur la nouvelle étape
            map.setView([lat, lon], 10);

            // Historique
            historiqueRecherche = historiqueRecherche.filter(item => item !== selectedLabel);
            historiqueRecherche.unshift(selectedLabel);
            if (historiqueRecherche.length > 10) {
                historiqueRecherche.pop();
            }
            localStorage.setItem('historiqueRecherche', JSON.stringify(historiqueRecherche));

            inputSearch.value = '';
        }
    });
});

// Fonction afficher étapes (inchangé)
function afficherEtapes() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    etapes.forEach((etape, index) => {
        var marker = L.marker(etape.coord).addTo(map);
        markers.push(marker);
    });

    var list = document.getElementById('etapes-list');
    list.innerHTML = '';
    etapes.forEach((etape, index) => {
        var li = document.createElement('li');
        li.setAttribute('data-index', index);

        li.innerHTML = `
            ${etape.nom}
            <button class="supprimer">🗑️</button>
        `;

        list.appendChild(li);
    });

    document.querySelectorAll('.supprimer').forEach(button => {
        button.addEventListener('click', function(e) {
            var index = e.target.parentElement.getAttribute('data-index');
            etapes.splice(index, 1);
            localStorage.setItem('etapes', JSON.stringify(etapes));
            afficherEtapes();
            calculerItineraire();
        });
    });

    calculerItineraire();
}

// Calcul itinéraire (inchangé)
function calculerItineraire() {
    if (routeLayer) {
        map.removeLayer(routeLayer);
    }

    document.getElementById('itineraire-info').innerHTML = '';
    document.getElementById('details-segments').innerHTML = '';

    if (etapes.length < 2) {
        return;
    }

    const coords = etapes.map(e => [e.coord[1], e.coord[0]]);

    fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
        method: 'POST',
        headers: {
            'Authorization': ORS_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            coordinates: coords
        })
    })
    .then(response => response.json())
    .then(data => {
        routeLayer = L.geoJSON(data, {
            style: {
                color: 'red',
                weight: 5
            }
        }).addTo(map);

        map.fitBounds(routeLayer.getBounds());

        const summary = data.features[0].properties.summary;
        const distance_km = (summary.distance / 1000).toFixed(1);
        const duree_sec = summary.duration;

        const heures = Math.floor(duree_sec / 3600);
        const minutes = Math.floor((duree_sec % 3600) / 60);

        document.getElementById('itineraire-info').innerHTML = `
            🚗 <b>Distance totale :</b> ${distance_km} km <br>
            ⏱️ <b>Temps estimé :</b> ${heures} h ${minutes} min
        `;

        const segments = data.features[0].properties.segments;
        let detailsHTML = '';

        segments.forEach((seg, index) => {
            const dist_seg_km = (seg.distance / 1000).toFixed(1);
            const duree_seg_sec = seg.duration;
            const h_seg = Math.floor(duree_seg_sec / 3600);
            const min_seg = Math.floor((duree_seg_sec % 3600) / 60);

            const depart = etapes[index].nom;
            const arrivee = etapes[index + 1].nom;

            detailsHTML += `
                <b>${depart} → ${arrivee}</b> : ${dist_seg_km} km - ${h_seg} h ${min_seg} min <br>
            `;
        });

        document.getElementById('details-segments').innerHTML = detailsHTML;

        const popupContent = `
            ⏱️ ${heures} h ${minutes} min <br>
            🚗 ${distance_km} km
        `;

        markers[markers.length - 1]
            .bindPopup(popupContent)
            .openPopup();

    })
    .catch(error => {
        console.error('Erreur calcul itinéraire:', error);
        alert('Erreur lors du calcul de l\'itinéraire.');
    });
}

// Réinitialiser
document.getElementById('reset').addEventListener('click', function() {
    if (confirm("Voulez-vous réinitialiser toutes les étapes ?")) {
        etapes = [];
        localStorage.removeItem('etapes');

        // ✅ Supprimer la route
        if (routeLayer) {
            map.removeLayer(routeLayer);
            routeLayer = null;
        }

        // ✅ Supprimer les markers
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];

        afficherEtapes();
    }
});

// Initialisation
afficherEtapes();

// Drag & Drop
new Sortable(document.getElementById('etapes-list'), {
    animation: 150,
    onEnd: function (evt) {
        const oldIndex = evt.oldIndex;
        const newIndex = evt.newIndex;
        const item = etapes.splice(oldIndex, 1)[0];
        etapes.splice(newIndex, 0, item);
        localStorage.setItem('etapes', JSON.stringify(etapes));
        afficherEtapes();
    }
});

// Toggle détails
document.getElementById('toggle-details').addEventListener('click', function() {
    const detailsDiv = document.getElementById('details-segments');
    if (detailsDiv.style.display === 'none') {
        detailsDiv.style.display = 'block';
        this.textContent = 'Masquer les détails';
    } else {
        detailsDiv.style.display = 'none';
        this.textContent = 'Afficher les détails';
    }
});

// ✅ Charger les POI (poi.geojson)
fetch('poi.geojson')
    .then(response => response.json())
    .then(poiData => {
        L.geoJSON(poiData, {
            pointToLayer: function (feature, latlng) {
                return L.marker(latlng, {
                    icon: L.icon({
                        iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
                        iconSize: [25, 25],
                        iconAnchor: [12, 24]
                    })
                }).bindPopup(`<b>${feature.properties.name}</b>`);
            }
        }).addTo(map);
    });

// ✅ Charger les National Parks (comme Roadtrippers)
fetch('poi_nationalparks.geojson')
    .then(response => response.json())
    .then(poiData => {
        L.geoJSON(poiData, {
            pointToLayer: function (feature, latlng) {
                return L.marker(latlng, {
                    icon: L.icon({
                        iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448610.png', // Icône Parc
                        iconSize: [25, 25],
                        iconAnchor: [12, 24]
                    })
                }).bindPopup(`<b>${feature.properties.name}</b>`);
            }
        }).addTo(map);
    });

