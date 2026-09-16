console.log("Weather app loaded");

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const geoBtn = document.getElementById("geoBtn");

const currentWeatherDiv = document.getElementById("currentWeather");
const favoritesList = document.getElementById("favoritesList");

const unitButtons = document.querySelectorAll("[data-unit]");
let currentUnit = "c";
let favorites = JSON.parse(localStorage.getItem("favorites")) || [];

// API keys
const API_KEY = "89a77781c1b862b8b385431b6a21f24d";
const GEO_URL = "https://api.openweathermap.org/geo/1.0/direct";
const BASE_URL = "https://api.openweathermap.org/data/2.5";

const WAPI_KEY = "9d20ac7f5a21456785a152859263008";
const WAPI_URL = "https://api.weatherapi.com/v1/forecast.json";


// -----------------------------
// 1) Fetch coordinates by city
// -----------------------------
async function fetchCityCoordinates(city) {
    const url = `${GEO_URL}?q=${city}&limit=1&appid=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data || data.length === 0) {
        currentWeatherDiv.innerHTML = `<p class="text-danger">City not found.</p>`;
        throw new Error("City not found");
    }

    return data[0];
}


// -----------------------------
// 2) Fetch current weather
// -----------------------------
async function fetchWeatherByCoords(lat, lon) {
    const url = `${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
    const res = await fetch(url);
    const data = await res.json();
    renderCurrentWeather(data);
}


// -----------------------------
// 3) Fetch weather by city
// -----------------------------
async function fetchCurrentWeather(city) {
    try {
        const loc = await fetchCityCoordinates(city);
        await fetchWeatherByCoords(loc.lat, loc.lon);
        await fetchForecast(loc.lat, loc.lon);
    } catch (err) {
        console.error(err);
    }
}


// -----------------------------
// 4) Fetch Forecast (WAPI + OW)
// -----------------------------
async function fetchForecast(lat, lon) {
    try {
        // WeatherAPI 24h
        const wurl1 = `${WAPI_URL}?key=${WAPI_KEY}&q=${lat},${lon}&days=1&aqi=no&alerts=no`;
        const wres1 = await fetch(wurl1);
        const wdata1 = await wres1.json();

        const wHours = wdata1.forecast.forecastday[0].hour;

        // Current hour
        const now = new Date();
        const currentHour = now.getHours();

        // WAPI to time from now
        const hourlyWAPI = wHours.map((h, i) => {
            const date = new Date(h.time.replace(" ", "T"));
            const hourReal = (currentHour + i) % 24;
            return {
                hour: hourReal,
                temp: h.temp_c
            };
        });

        // OpenWeather 24h - 8 points per 3h
        const hourlyOW = await fetchForecastOW(lat, lon);

        // WeatherAPI 7-day
        const wurl2 = `${WAPI_URL}?key=${WAPI_KEY}&q=${lat},${lon}&days=7&aqi=no&alerts=no`;
        const wres2 = await fetch(wurl2);
        const wdata2 = await wres2.json();

        const dailyWAPI = wdata2.forecast.forecastday;

        render24hChartDual(hourlyWAPI, hourlyOW);
        render7dChart(dailyWAPI);

    } catch (err) {
        console.error("Forecast error:", err);
    }
}


// -----------------------------
// 5) Fetch OpenWeather Forecast
// -----------------------------
async function fetchForecastOW(lat, lon) {
    const url = `${BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
    const res = await fetch(url);
    const data = await res.json();

    const hours = data.list.slice(0, 8); // 8 intervals * 3h

    return hours.map(h => {
        const date = new Date(h.dt_txt);
        const hour = date.getHours(); // get hour
        return {
            hour,
            temp: h.main.temp
        };
    });
}


// -----------------------------
// 6) Render 24h Dual Chart (WAPI line + OW dots)
// -----------------------------
function render24hChartDual(wapiHourly, owRaw) {
    // label x-axis time from now
    const labels = wapiHourly.map(h =>
        h.hour.toString().padStart(2, "0") + ":00"
    );

    // WeatherAPI line
    const tempsWAPI = wapiHourly.map(h =>
        Math.round(convertTemp(h.temp))
    );

    // OpenWeather DOT ONLY
    const tempsOWdots = wapiHourly.map(h => {
        const found = owRaw.find(p => p.hour === h.hour);
        return found ? Math.round(convertTemp(found.temp)) : "";
    });

    new frappe.Chart("#chart24h", {
        title: "Next 24 hours (2 sources)",
        data: {
            labels,
            datasets: [
                {
                    name: "WeatherAPI",
                    values: tempsWAPI,
                    chartType: "line"
                },
                {
                    name: "OpenWeather",
                    values: tempsOWdots,
                    chartType: "scatter",
                    dotSize: 10
                }
            ]
        },
        type: "line",
        height: 250,
        colors: ["#00aaff", "#ffaa00"]
    });
}


// -----------------------------
// 7) Render 7-day Chart
// -----------------------------
function render7dChart(dailyData) {
    const labels = dailyData.map(d => {
        const date = new Date(d.date);
        return date.toLocaleDateString("en-US", { weekday: "short" });
    });

    const temps = dailyData.map(d => Math.round(convertTemp(d.day.avgtemp_c)));

    new frappe.Chart("#chart7d", {
        title: "Next 7 days",
        data: {
            labels,
            datasets: [{ name: "Day temperature", values: temps }]
        },
        type: "line",
        height: 250,
        colors: ["#ff7b00"]
    });
}


// -----------------------------
// 8) UI + Favorites + Units
// -----------------------------
function renderCurrentWeather(data) {
    const tempC = data.main.temp;
    const temp = Math.round(convertTemp(tempC));
    const desc = data.weather[0].description;
    const icon = data.weather[0].icon;

    updateBackground(tempC);

    let unitLabel = "";
    if (currentUnit === "c") unitLabel = "°C";
    if (currentUnit === "f") unitLabel = "°F";
    if (currentUnit === "k") unitLabel = "K";

    currentWeatherDiv.innerHTML = `
        <div class="d-flex align-items-center gap-3">
            <img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="">
            <div>
                <h3>${temp}${unitLabel}</h3>
                <p class="m-0 text-capitalize">${desc}</p>
                <p class="m-0">${data.name}, ${data.sys.country}</p>
            </div>
        </div>
    `;
}

searchBtn.addEventListener("click", () => {
    const city = searchInput.value.trim();
    if (city) fetchCurrentWeather(city);
});

geoBtn.addEventListener("click", () => {
    navigator.geolocation.getCurrentPosition(async pos => {
        const { latitude, longitude } = pos.coords;

        const url = `https://api.openweathermap.org/geo/1.0/reverse?lat=${latitude}&lon=${longitude}&limit=1&appid=${API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        const cityName = data[0].name;

        searchInput.value = cityName;

        await fetchWeatherByCoords(latitude, longitude);
        await fetchForecast(latitude, longitude);
    });
});

unitButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        currentUnit = btn.dataset.unit;

        updateUnitButtonsUI();

        const city = searchInput.value.trim();
        if (city) fetchCurrentWeather(city);
    });
});

function convertTemp(tempC) {
    if (currentUnit === "c") return tempC;
    if (currentUnit === "f") return tempC * 9/5 + 32;
    if (currentUnit === "k") return tempC + 273.15;
}

function updateBackground(tempC) {
    let color = "#333";
    if (tempC <= 0) color = "#4a90e2";
    else if (tempC <= 15) color = "#6ec6ff";
    else if (tempC <= 25) color = "#ffe08a";
    else if (tempC <= 35) color = "#ff9f43";
    else color = "#ff5e57";
    document.body.style.setProperty("--weather-bg", color);
}

// -----------------------------
// Favorite render
// -----------------------------

function addFavorite(city) {
    if (!city) return;

    if (!favorites.includes(city)) {
        favorites.push(city);
        localStorage.setItem("favorites", JSON.stringify(favorites));
        renderFavorites();
    }
}

function renderFavorites() {
    if (!favoritesList) return;

    favoritesList.innerHTML = "";

    favorites.forEach(city => {
        const li = document.createElement("li");
        li.className = "list-group-item bg-secondary text-light";
        li.style.cursor = "pointer";
        li.textContent = city;

        li.addEventListener("click", () => {
            searchInput.value = city;
            fetchCurrentWeather(city);
        });

        favoritesList.appendChild(li);
    });
}

// Render favorites on startup
document.addEventListener("DOMContentLoaded", () => {
    renderFavorites();
});

// Add favorite button
document.getElementById("addFavoriteBtn").addEventListener("click", () => {
    const city = searchInput.value.trim();
    addFavorite(city);
});

// Clear favorites button
document.getElementById("clearFavoritesBtn").addEventListener("click", () => {
    favorites = [];
    localStorage.removeItem("favorites");
    renderFavorites();
});

// Update Unit Buttons When Clicked
function updateUnitButtonsUI() {
    unitButtons.forEach(btn => {
        if (btn.dataset.unit === currentUnit) {
            btn.classList.add("unit-active");
        } else {
            btn.classList.remove("unit-active");
        }
    });
}
