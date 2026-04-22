import { db, auth } from "./firebase.js";
import { 
    collection, 
    getDocs, 
    doc,
    getDoc,
    addDoc,
    deleteDoc,
    query,
    where
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import { 
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

let currentUser = null;
let favorites = [];
let markers = [];
let jobs = [];
let internships = [];
let events = [];
let currentType = "vacancy";
let map = null;
let isMapInitialized = false;
let isJobsLoaded = false;
let pendingJobs = null;

// ========= ТЕГИ / ФИЛЬТРЫ =========
const LEVEL_TAGS = ["Junior", "Middle", "Senior"];
const HOURS_TAGS = ["3-6 часов", "7-9 часов", "10-14 часов"];

const DEFAULT_TECH_TAGS = [
    ".NET", "Angular", "AWS", "Azure", "C#", "C++", "Django", "Docker",
    "FastAPI", "Flask", "GCP", "Git", "Go", "Java", "JavaScript",
    "Kubernetes", "Linux", "MongoDB", "MySQL", "Node.js", "PostgreSQL",
    "Python", "React", "Redis", "Spring", "SQL", "TypeScript", "Vue"
];

let isTagFiltersInitialized = false;

function normalizeTagForCompare(tag) {
    return (tag ?? "").toString().trim().toLowerCase();
}

function mapLevelTag(tag) {
    const t = normalizeTagForCompare(tag);
    if (!t) return null;
    if (t === "junior") return "Junior";
    if (t === "middle") return "Middle";
    if (t === "senior") return "Senior";
    return null;
}

function mapHoursTag(tag) {
    const t = normalizeTagForCompare(tag);
    if (!t) return null;
    if (t.includes("3-6") || t === "3-6 часов" || t === "3-6") return "3-6 часов";
    if (t.includes("7-9") || t === "7-9 часов" || t === "7-9") return "7-9 часов";
    if (t.includes("10-14") || t === "10-14 часов" || t === "10-14") return "10-14 часов";
    return null;
}

function splitOpportunityTags(item) {
    const tags = Array.isArray(item?.tags) ? item.tags : [];
    const techTags = [];
    const levels = [];
    const hours = [];

    for (const rawTag of tags) {
        const level = mapLevelTag(rawTag);
        if (level) {
            if (!levels.includes(level)) levels.push(level);
            continue;
        }
        const hourRange = mapHoursTag(rawTag);
        if (hourRange) {
            if (!hours.includes(hourRange)) hours.push(hourRange);
            continue;
        }
        if (rawTag && !techTags.includes(rawTag)) techTags.push(rawTag);
    }

    return { techTags, levels, hours };
}

function isModerationApproved(item) {
    // ВАЖНО: показываем все вакансии для теста
    // В финальной версии раскомментировать строку ниже и закомментировать return true
    // return !item?.moderation_status || item.moderation_status === "approved";
    return true;
}

function ensureHoverCardElement() {
    if (document.getElementById("hoverCard")) return;

    const el = document.createElement("div");
    el.id = "hoverCard";
    el.style.position = "fixed";
    el.style.zIndex = "10000";
    el.style.display = "none";
    el.style.pointerEvents = "none";
    el.style.maxWidth = "280px";
    el.style.background = "white";
    el.style.border = "1px solid rgba(0,0,0,0.1)";
    el.style.borderRadius = "14px";
    el.style.boxShadow = "0 12px 30px rgba(0,0,0,0.15)";
    el.style.padding = "12px 14px";
    el.style.fontSize = "13px";
    el.style.lineHeight = "1.3";

    document.body.appendChild(el);
}

function showHoverCard(item, e) {
    const card = document.getElementById("hoverCard");
    if (!card) return;
    if (!e || !e.latlng || !map) return;

    const point = map.latLngToContainerPoint(e.latlng);
    
    const { techTags, levels, hours } = splitOpportunityTags(item);
    
    let tagsHtml = "";
    if (techTags.length > 0 || levels.length > 0 || hours.length > 0) {
        const allTags = [...techTags.slice(0, 4), ...levels.slice(0, 1), ...hours.slice(0, 1)];
        tagsHtml = `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom: 8px;">${allTags.map(t => `<span class="tag-pill">${escapeHtmlForCard(t)}</span>`).join("")}</div>`;
    }
    
    let addressText = "";
    if (item.formatted_address) {
        addressText = item.formatted_address;
    } else if (item.city) {
        addressText = item.city;
        if (item.street) addressText += `, ${item.street}`;
        if (item.house) addressText += `, ${item.house}`;
    }
    
    let salaryText = "";
    if (item.salary && item.type !== "event") {
        salaryText = `<div style="margin-bottom: 6px;">Зарплата: ${item.salary.toLocaleString()} ₽</div>`;
    } else if (item.type === "event") {
        salaryText = `<div style="margin-bottom: 6px;">Участие: бесплатное</div>`;
    }
    
    let formatText = "";
    if (item.format) {
        formatText = `<div style="margin-bottom: 6px;">Формат: ${escapeHtmlForCard(item.format)}</div>`;
    }
    
    let dateText = "";
    if (item.created_at) {
        const formattedDate = formatDate(item.created_at);
        if (formattedDate) {
            dateText = `<div style="margin-bottom: 6px; color: #777;">Дата публикации: ${formattedDate}</div>`;
        }
    }
    
    let deadlineText = "";
    if (item.end_date && item.type !== "event") {
        const formattedDeadline = formatDate(item.end_date);
        if (formattedDeadline) {
            deadlineText = `<div style="margin-bottom: 6px; color: #777;">Срок: ${formattedDeadline}</div>`;
        }
    }
    
    let eventDateText = "";
    if (item.type === "event" && item.start_date) {
        const startDate = formatDate(item.start_date);
        const endDate = formatDate(item.end_date);
        if (startDate) {
            eventDateText = `<div style="margin-bottom: 6px; color: #777;">Дата проведения: ${startDate}${endDate ? ` - ${endDate}` : ""}</div>`;
        }
        if (item.start_time || item.end_time) {
            eventDateText += `<div style="margin-bottom: 6px; color: #777;">Время: ${item.start_time || ""}${item.end_time ? ` - ${item.end_time}` : ""}</div>`;
        }
    }
    
    const isFav = favorites && favorites.includes(item.id);
    const favText = isFav ? `<div style="margin-top: 8px; color: #dc3545;">В избранном</div>` : "";
    
    const companyName = item.company_name || "Организатор";
    const companyId = item.company_id;
    
    card.innerHTML = `
        <div style="font-weight: 700; color: #1f6aa5; margin-bottom: 4px;">
            ${escapeHtmlForCard(item.title || "Без названия")}
        </div>
        ${tagsHtml}
        <div style="color: #1f6aa5; margin-bottom: 4px; cursor: pointer; text-decoration: underline;" onclick="showCompanyInfo('${companyId}')">
            ${escapeHtmlForCard(companyName)}
        </div>
        ${addressText ? `<div style="color: #666; margin-bottom: 4px;">${escapeHtmlForCard(addressText)}</div>` : ""}
        ${salaryText}
        ${formatText}
        ${dateText}
        ${deadlineText}
        ${eventDateText}
        ${favText}
    `;

    card.style.left = `${point.x + 14}px`;
    card.style.top = `${point.y + 14}px`;
    card.style.display = "block";
}

function hideHoverCard() {
    const card = document.getElementById("hoverCard");
    if (!card) return;
    card.style.display = "none";
}

window.showCompanyInfo = async function(companyId) {
    if (!companyId) {
        alert("Информация о компании не найдена");
        return;
    }
    
    try {
        const companyDoc = await getDoc(doc(db, "companies", companyId));
        if (!companyDoc.exists()) {
            alert("Информация о компании не найдена");
            return;
        }
        
        const company = companyDoc.data();
        
        const userDoc = await getDoc(doc(db, "users", companyId));
        const userData = userDoc.exists() ? userDoc.data() : {};
        
        const jobsSnap = await getDocs(
            query(collection(db, "opportunity"), where("company_id", "==", companyId))
        );
        const jobsCount = jobsSnap.size;
        
        const foundedYear = company.founded_year || "Не указан";
        const employeeCount = company.employee_count || "Не указано";
        const officeLocations = company.office_locations || "Не указано";
        
        const existingModal = document.getElementById("companyInfoModal");
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement("div");
        modal.id = "companyInfoModal";
        modal.style.position = "fixed";
        modal.style.top = "0";
        modal.style.left = "0";
        modal.style.width = "100%";
        modal.style.height = "100%";
        modal.style.backgroundColor = "rgba(0,0,0,0.5)";
        modal.style.display = "flex";
        modal.style.alignItems = "center";
        modal.style.justifyContent = "center";
        modal.style.zIndex = "10000";
        
        let logoHtml = "";
        if (company.logo_url) {
            logoHtml = `<img src="${company.logo_url}" alt="Логотип компании" style="width: 80px; height: 80px; object-fit: cover; border-radius: 12px; margin-right: 20px;">`;
        } else {
            logoHtml = `<div style="width: 80px; height: 80px; background: #f0f2f5; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-right: 20px; font-size: 32px; color: #999;">🏢</div>`;
        }
        
        let videoHtml = "";
        if (company.video_url) {
            let embedUrl = company.video_url;
            if (company.video_url.includes("youtube.com/watch?v=")) {
                const videoId = company.video_url.split("v=")[1].split("&")[0];
                embedUrl = `https://www.youtube.com/embed/${videoId}`;
            } else if (company.video_url.includes("youtu.be/")) {
                const videoId = company.video_url.split("youtu.be/")[1].split("?")[0];
                embedUrl = `https://www.youtube.com/embed/${videoId}`;
            }
            videoHtml = `
                <div style="margin-top: 20px;">
                    <h4 style="color: #1f6aa5; margin-bottom: 10px;">Видео-презентация</h4>
                    <iframe src="${embedUrl}" frameborder="0" allowfullscreen style="width: 100%; height: 315px; border-radius: 12px;"></iframe>
                </div>
            `;
        }
        
        modal.innerHTML = `
            <div style="background: white; border-radius: 24px; max-width: 550px; width: 90%; max-height: 85vh; overflow-y: auto; position: relative;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #e9ecef;">
                    <h2 style="margin: 0; color: #1f6aa5;">О компании</h2>
                    <button onclick="closeCompanyInfoModal()" style="background: none; border: none; font-size: 28px; cursor: pointer; color: #666;">&times;</button>
                </div>
                <div style="padding: 24px;">
                    <div style="display: flex; align-items: center; margin-bottom: 20px;">
                        ${logoHtml}
                        <div>
                            <h3 style="margin: 0 0 5px 0; font-size: 22px;">${escapeHtmlForCard(company.name || "Без названия")}</h3>
                            <p style="margin: 0; color: #666;">${escapeHtmlForCard(company.field || "Сфера деятельности не указана")}</p>
                        </div>
                    </div>
                    
                    <div style="background: #f8f9fa; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
                        <p style="margin: 0 0 8px 0;"><strong>Описание:</strong> ${escapeHtmlForCard(company.description || "Описание отсутствует")}</p>
                        ${company.site ? `<p style="margin: 0 0 8px 0;"><strong>Сайт:</strong> <a href="${company.site}" target="_blank" style="color: #1f6aa5;">${company.site}</a></p>` : ""}
                        ${company.social ? `<p style="margin: 0 0 8px 0;"><strong>Соцсети:</strong> ${escapeHtmlForCard(company.social)}</p>` : ""}
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                        <div style="background: #f8f9fa; border-radius: 12px; padding: 12px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #1f6aa5;">${employeeCount}</div>
                            <div style="font-size: 12px; color: #666;">Сотрудников</div>
                        </div>
                        <div style="background: #f8f9fa; border-radius: 12px; padding: 12px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #1f6aa5;">${foundedYear}</div>
                            <div style="font-size: 12px; color: #666;">Год основания</div>
                        </div>
                        <div style="background: #f8f9fa; border-radius: 12px; padding: 12px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #1f6aa5;">${officeLocations}</div>
                            <div style="font-size: 12px; color: #666;">Офисов</div>
                        </div>
                        <div style="background: #f8f9fa; border-radius: 12px; padding: 12px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #1f6aa5;">${jobsCount}</div>
                            <div style="font-size: 12px; color: #666;">Вакансий</div>
                        </div>
                    </div>
                    
                    ${videoHtml}
                </div>
            </div>
        `;
        
        modal.addEventListener("click", function(e) {
            if (e.target === modal) {
                closeCompanyInfoModal();
            }
        });
        
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error("Ошибка загрузки информации о компании:", error);
        alert("Ошибка при загрузке информации о компании");
    }
};

window.closeCompanyInfoModal = function() {
    const modal = document.getElementById("companyInfoModal");
    if (modal) modal.remove();
};

function escapeHtmlForCard(text) {
    return (text ?? "").toString()
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#039;");
}

function initTagFilters(items) {
    const techEl = document.getElementById("techTagFilter");
    const levelEl = document.getElementById("levelTagFilter");
    const hoursEl = document.getElementById("hoursTagFilter");
    if (!techEl || !levelEl || !hoursEl) return;
    if (isTagFiltersInitialized) return;

    const { techTags, levels, hours } = (items || []).reduce((acc, item) => {
        const split = splitOpportunityTags(item);
        split.techTags.forEach(t => acc.techTags.add(t));
        split.levels.forEach(l => acc.levels.add(l));
        split.hours.forEach(h => acc.hours.add(h));
        return acc;
    }, { techTags: new Set(), levels: new Set(), hours: new Set() });

    DEFAULT_TECH_TAGS.forEach(t => techTags.add(t));
    LEVEL_TAGS.forEach(l => levels.add(l));
    HOURS_TAGS.forEach(h => hours.add(h));

    const sortedTech = [...techTags].sort((a, b) => a.localeCompare(b, "ru"));
    const sortedLevels = [...levels].sort((a, b) => a.localeCompare(b, "ru"));
    const sortedHours = [...hours].sort((a, b) => a.localeCompare(b, "ru"));

    techEl.innerHTML = `<option value="">Любые навыки</option>` + sortedTech.map(t => `<option value="${escapeHtmlForCard(t)}">${escapeHtmlForCard(t)}</option>`).join("");
    levelEl.innerHTML = `<option value="">Любой уровень</option>` + sortedLevels.map(l => `<option value="${escapeHtmlForCard(l)}">${escapeHtmlForCard(l)}</option>`).join("");
    hoursEl.innerHTML = `<option value="">Часы работы</option>` + sortedHours.map(h => `<option value="${escapeHtmlForCard(h)}">${escapeHtmlForCard(h)}</option>`).join("");

    isTagFiltersInitialized = true;
}

const defaultIcon = L.icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const favoriteIcon = L.icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const internshipIcon = L.icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const eventIcon = L.icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const isHomePage = document.getElementById("map") !== null;

if (!isHomePage) {
    console.log("Не главная страница, пропускаем инициализацию карты");
}

function initMap() {
    if (map || !document.getElementById("map")) return;
    
    console.log("Инициализация карты...");
    map = L.map('map').setView([56.0153, 92.8932], 12);
    ensureHoverCardElement();
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: '© OpenStreetMap' 
    }).addTo(map);
    isMapInitialized = true;
    
    if (pendingJobs && pendingJobs.length > 0) {
        console.log("Отображаем ожидающие данные на карте");
        renderMap(pendingJobs);
        pendingJobs = null;
    }
}

window.switchType = function(type) {
    currentType = type;
    
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`type${type.charAt(0).toUpperCase() + type.slice(1)}`).classList.add('active');
    
    applyFilters();
};

onAuthStateChanged(auth, async (user) => {
    console.log("Auth state changed, user:", user ? user.email : "null");
    currentUser = user || null;
    updateUI(!!user);
    
    if (isHomePage && !map) {
        initMap();
    }
    
    loadFavoritesFromLocal();
    if (user) {
        await syncFavoritesWithFirebase();
    }
    
    if (!isJobsLoaded) {
        isJobsLoaded = true;
        await loadAllData();
    }
});

async function syncFavoritesWithFirebase() {
    if (!currentUser) return;
    
    try {
        const q = query(collection(db, "favorites"), where("user_id", "==", currentUser.uid));
        const snapshot = await getDocs(q);
        const firebaseFavorites = [];
        const firebaseDocIds = {};
        
        snapshot.docs.forEach(doc => {
            const jobId = doc.data().job_id;
            firebaseFavorites.push(jobId);
            firebaseDocIds[jobId] = doc.id;
        });
        
        const localFavorites = JSON.parse(localStorage.getItem("favorites")) || [];
        
        for (const jobId of firebaseFavorites) {
            if (!localFavorites.includes(jobId)) {
                const docId = firebaseDocIds[jobId];
                if (docId) {
                    await deleteDoc(doc(db, "favorites", docId));
                    console.log(`Удалено из Firebase: ${jobId}`);
                }
            }
        }
        
        for (const jobId of localFavorites) {
            if (!firebaseFavorites.includes(jobId)) {
                await addDoc(collection(db, "favorites"), {
                    user_id: currentUser.uid,
                    job_id: jobId,
                    created_at: new Date()
                });
                console.log(`Добавлено в Firebase: ${jobId}`);
            }
        }
        
        favorites = [...localFavorites];
        
        console.log("Избранное синхронизировано:", favorites.length);
        
    } catch (error) {
        console.error("Ошибка синхронизации избранного:", error);
    }
}

function loadFavoritesFromLocal() {
    favorites = JSON.parse(localStorage.getItem("favorites")) || [];
}

async function addFavorite(jobId) {
    if (!currentUser) {
        let favs = JSON.parse(localStorage.getItem("favorites")) || [];
        if (!favs.includes(jobId)) {
            favs.push(jobId);
            localStorage.setItem("favorites", JSON.stringify(favs));
        }
        favorites = favs;
        return true;
    }
    
    try {
        const q = query(collection(db, "favorites"), 
            where("user_id", "==", currentUser.uid),
            where("job_id", "==", jobId)
        );
        const existing = await getDocs(q);
        
        if (existing.empty) {
            await addDoc(collection(db, "favorites"), {
                user_id: currentUser.uid,
                job_id: jobId,
                created_at: new Date()
            });
            if (!favorites.includes(jobId)) {
                favorites.push(jobId);
                localStorage.setItem("favorites", JSON.stringify(favorites));
            }
        }
        return true;
    } catch (error) {
        console.error("Ошибка добавления в избранное:", error);
        return false;
    }
}

async function removeFavorite(jobId) {
    if (!currentUser) {
        favorites = favorites.filter(id => id !== jobId);
        localStorage.setItem("favorites", JSON.stringify(favorites));
        return true;
    }
    
    try {
        const q = query(collection(db, "favorites"), 
            where("user_id", "==", currentUser.uid),
            where("job_id", "==", jobId)
        );
        const snapshot = await getDocs(q);
        
        const deletePromises = [];
        snapshot.forEach(doc => {
            deletePromises.push(deleteDoc(doc.ref));
        });
        await Promise.all(deletePromises);
        
        favorites = favorites.filter(id => id !== jobId);
        localStorage.setItem("favorites", JSON.stringify(favorites));
        return true;
    } catch (error) {
        console.error("Ошибка удаления из избранного:", error);
        return false;
    }
}

window.toggleFavorite = async function(event, jobId) {
    event.stopPropagation();

    const isFav = favorites.includes(jobId);
    
    if (isFav) {
        await removeFavorite(jobId);
        showToast("Удалено из избранного", "info");
    } else {
        await addFavorite(jobId);
        showToast("Добавлено в избранное", "success");
    }
    
    applyFilters();
};

async function updateUI(isLogged) {
    const authButtons = document.querySelector(".auth-buttons");
    if (!authButtons) return;

    if (isLogged && currentUser) {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        let role = "student";

        if (userDoc.exists()) {
            role = userDoc.data().role;
        }

        let cabinetLink = "student.html";
        if (role === "employer") cabinetLink = "employer.html";
        if (role === "curator") cabinetLink = "curator.html";

        authButtons.innerHTML = `
            <button onclick="window.location.href='favorites.html'">Избранное</button>
            <button onclick="window.location.href='${cabinetLink}'">Личный кабинет</button>
            <button onclick="logout()">Выйти</button>
        `;
    } else {
        authButtons.innerHTML = `
            <button onclick="window.location.href='favorites.html'">Избранное</button>
            <button onclick="window.location.href='login.html'">Войти</button>
            <button class="primary" onclick="window.location.href='register.html'">Регистрация</button>
        `;
    }
}

window.logout = async function() {
    await signOut(auth);
    favorites = [];
    isJobsLoaded = false;
    window.location.href = "index.html";
};

function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.padding = "12px 20px";
    toast.style.borderRadius = "8px";
    toast.style.backgroundColor = type === "success" ? "#28a745" : "#1f6aa5";
    toast.style.color = "white";
    toast.style.zIndex = "9999";
    toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    toast.style.animation = "slideIn 0.3s ease";
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = "slideOut 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

const style = document.createElement("style");
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }

    .tag-pill {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: 999px;
        background: #eef6fb;
        color: #1f6aa5;
        font-size: 11px;
        font-weight: 500;
        white-space: nowrap;
    }
`;
document.head.appendChild(style);

function getTimestamp(dateValue) {
    if (!dateValue) return 0;
    
    try {
        if (typeof dateValue === 'object' && dateValue !== null && 'seconds' in dateValue) {
            return dateValue.seconds * 1000;
        }
        else if (typeof dateValue === 'string') {
            const timestamp = new Date(dateValue).getTime();
            return isNaN(timestamp) ? 0 : timestamp;
        }
        else if (dateValue instanceof Date) {
            const timestamp = dateValue.getTime();
            return isNaN(timestamp) ? 0 : timestamp;
        }
        else if (typeof dateValue === 'number') {
            return dateValue;
        }
        else {
            return 0;
        }
    } catch (e) {
        return 0;
    }
}

function formatDate(dateValue) {
    if (!dateValue) return null;
    
    try {
        let date;
        
        if (typeof dateValue === 'object' && dateValue !== null && 'seconds' in dateValue) {
            date = new Date(dateValue.seconds * 1000);
        }
        else if (typeof dateValue === 'string') {
            date = new Date(dateValue);
        }
        else if (dateValue instanceof Date) {
            date = dateValue;
        }
        else if (typeof dateValue === 'number') {
            date = new Date(dateValue);
        }
        else {
            return null;
        }
        
        if (isNaN(date.getTime())) {
            return null;
        }
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        
        return `${day}.${month}.${year}`;
    } catch (e) {
        return null;
    }
}

function sortItems(itemsArray, sortType) {
    const sorted = [...itemsArray];
    
    if (sortType === "newest") {
        sorted.sort((a, b) => {
            const timestampA = getTimestamp(a.created_at);
            const timestampB = getTimestamp(b.created_at);
            return timestampB - timestampA;
        });
    } else if (sortType === "oldest") {
        sorted.sort((a, b) => {
            const timestampA = getTimestamp(a.created_at);
            const timestampB = getTimestamp(b.created_at);
            return timestampA - timestampB;
        });
    }
    
    return sorted;
}

function renderMap(data) {
    if (!map) {
        console.log("Карта не инициализирована");
        return;
    }
    
    markers.forEach(m => {
        try {
            if (m && map.removeLayer) map.removeLayer(m);
        } catch(e) {
            console.log("Ошибка удаления маркера:", e);
        }
    });
    markers = [];

    if (!data || data.length === 0) {
        console.log("Нет данных для отображения");
        return;
    }

    data.forEach(item => {
        if (item.map && item.map.latitude && item.map.longitude) {
            const isFav = favorites && favorites.includes(item.id);
            
            let icon = defaultIcon;
            if (isFav) {
                icon = favoriteIcon;
            } else if (item.type === "internship") {
                icon = internshipIcon;
            } else if (item.type === "event") {
                icon = eventIcon;
            }
            
            let marker;
            try {
                marker = L.marker([item.map.latitude, item.map.longitude], { icon: icon });
                marker.addTo(map);
            } catch(e) {
                console.log("Ошибка создания маркера:", e);
                return;
            }

            const formattedDate = formatDate(item.created_at);
            const dateText = formattedDate ? `<br>Дата создания: ${formattedDate}` : "";
            
            const salaryText = item.salary ? `<br>Зарплата: ${item.salary.toLocaleString()} ₽` : "";
            const formatText = item.format ? `<br>Формат: ${item.format}` : "";

            let scheduleText = "";
            if (item.type === "event" && item.start_date) {
                const startDate = formatDate(item.start_date);
                const endDate = formatDate(item.end_date);
                scheduleText = `<br>Дата проведения: ${startDate || "—"}${endDate ? ` - ${endDate}` : ""}`;
            } else if (item.end_date) {
                scheduleText = `<br>Действует до: ${formatDate(item.end_date) || "—"}`;
            }

            const { techTags, levels, hours } = splitOpportunityTags(item);
            const tagsPreview = techTags.slice(0, 3).map(t => `<span class="tag-pill">${escapeHtmlForCard(t)}</span>`).join("");
            const levelPreview = levels[0] ? `<span class="tag-pill">${escapeHtmlForCard(levels[0])}</span>` : "";
            const hoursPreview = hours[0] ? `<span class="tag-pill">${escapeHtmlForCard(hours[0])}</span>` : "";
            
            const popupContent = `
                <div style="min-width: 180px;">
                    <b>${item.title || "Без названия"}</b><br>
                    <span style="color: #1f6aa5; cursor: pointer; text-decoration: underline;" onclick="showCompanyInfo('${item.company_id}')">${item.company_name || "Организатор"}</span>
                    ${salaryText}
                    ${formatText}
                    <br>Город: ${item.city || "Город не указан"}${dateText}
                    ${scheduleText}
                    <div style="margin-top: 8px; display:flex; flex-wrap:wrap; gap:6px;">${tagsPreview}${levelPreview}${hoursPreview}</div>
                    ${isFav ? '<br><span style="color: #dc3545;">В избранном</span>' : ''}
                </div>
            `;
            marker.bindPopup(popupContent);

            marker.on("click", () => {
                const card = document.getElementById("item-" + item.id);
                if (card) {
                    card.scrollIntoView({ behavior: "smooth", block: "center" });
                    document.querySelectorAll(".card").forEach(c => c.classList.remove("active"));
                    card.classList.add("active");
                }
            });

            marker.on("mouseover", (ev) => showHoverCard(item, ev));
            marker.on("mouseout", hideHoverCard);

            item.marker = marker;
            markers.push(marker);
        }
    });
    
    const favoritesCount = data.filter(i => favorites && favorites.includes(i.id)).length;
    console.log(`Отображено ${markers.length} маркеров на карте (избранных: ${favoritesCount})`);
}

function renderList(data) {
    const list = document.getElementById("list");
    if (!list) {
        console.log("Элемент #list не найден");
        return;
    }

    list.innerHTML = "";

    if (!data || data.length === 0) {
        list.innerHTML = "<p style='text-align:center; padding: 20px;'>Нет данных</p>";
        return;
    }

    data.forEach(item => {
        const isFav = favorites.includes(item.id);
        
        const formattedDate = formatDate(item.created_at);
        const dateText = formattedDate ? `<p style="font-size: 11px; color: #999; margin-top: 5px;">Дата добавления: ${formattedDate}</p>` : "";
        
        let addressText = "";
        if (item.formatted_address) {
            addressText = item.formatted_address;
        } else if (item.city) {
            addressText = item.city;
            if (item.street) addressText += `, ${item.street}`;
            if (item.house) addressText += `, ${item.house}`;
        } else {
            addressText = "Адрес не указан";
        }
        
        let dateInfoText = "";
        if (item.type === "event" && item.start_date) {
            const startDate = formatDate(item.start_date);
            const endDate = formatDate(item.end_date);
            dateInfoText = `<p>Дата проведения: ${startDate || "—"}${endDate ? ` - ${endDate}` : ""}</p>`;
        } else if (item.end_date) {
            dateInfoText = `<p>Срок действия: ${formatDate(item.end_date) || "—"}</p>`;
        }
        
        let durationText = "";
        if (item.duration) {
            durationText = `<p>Длительность: ${item.duration}</p>`;
        }

        const { techTags, levels, hours } = splitOpportunityTags(item);
        const tagsPreview = techTags.slice(0, 5).map(t => `<span class="tag-pill">${escapeHtmlForCard(t)}</span>`).join("");
        const levelPreview = levels[0] ? `<span class="tag-pill">${escapeHtmlForCard(levels[0])}</span>` : "";
        const hoursPreview = hours[0] ? `<span class="tag-pill">${escapeHtmlForCard(hours[0])}</span>` : "";

        const div = document.createElement("div");
        div.className = "card";
        div.id = "item-" + item.id;

        div.innerHTML = `
            <div class="favorite" onclick="toggleFavorite(event, '${item.id}')">
                ${isFav ? "❤️" : "🤍"}
            </div>
            <h3>${item.title || "Без названия"}</h3>
            <p><strong style="cursor: pointer; color: #1f6aa5;" onclick="showCompanyInfo('${item.company_id}')">${item.company_name || "Организатор"}</strong></p>
            ${item.salary ? `<p>Условия: ${item.salary.toLocaleString()} ₽</p>` : ""}
            <p>Формат: ${item.format || "—"}</p>
            <p>Адрес: ${addressText}</p>
            ${dateInfoText}
            ${durationText}
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top: 8px;">${tagsPreview}${levelPreview}${hoursPreview}</div>
            ${item.description ? `<p style="font-size: 12px; color: #666; margin-top: 8px;">${item.description.substring(0, 100)}${item.description.length > 100 ? "..." : ""}</p>` : ""}
            ${dateText}
            <div style="margin-top: 10px;">
                <button onclick="viewItemDetails('${item.id}')" style="background: #1f6aa5; padding: 6px 12px; font-size: 12px;">Подробнее</button>
            </div>
        `;

        div.onclick = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            if (item.marker) {
                map.flyTo(item.marker.getLatLng(), 14);
                document.querySelectorAll(".card").forEach(c => c.classList.remove("active"));
                div.classList.add("active");
            }
        };

        list.appendChild(div);
    });
}

window.viewItemDetails = function(itemId) {
    window.location.href = `item-detail.html?id=${itemId}`;
};

// Замените функцию applyFilters на эту версию (находится примерно в строке 700-750)

window.applyFilters = function() {
    const search = document.getElementById("searchInput")?.value.toLowerCase() || "";
    const salary = document.getElementById("salaryFilter")?.value || "";
    const format = document.getElementById("formatFilter")?.value || "";
    const sortType = document.getElementById("sortFilter")?.value || "newest";

    let currentData = [];
    if (currentType === "vacancy") currentData = jobs;
    else if (currentType === "internship") currentData = internships;
    else currentData = events;

    let filtered = currentData.filter(item => {
        let ok = true;
        
        if (search) {
            const titleText = item.title?.toLowerCase() || "";
            const descText = item.description?.toLowerCase() || "";
            const cityText = item.city?.toLowerCase() || "";
            ok = titleText.includes(search) || descText.includes(search) || cityText.includes(search);
        }
        
        if (salary === "low") ok = ok && (item.salary && item.salary < 50000);
        if (salary === "mid") ok = ok && (item.salary && item.salary >= 50000 && item.salary <= 150000);
        if (salary === "high") ok = ok && (item.salary && item.salary > 150000);
        
        if (format) {
            const itemFormat = item.format || "";
            if (format === "remote") ok = ok && itemFormat.includes("Удалён");
            if (format === "office") ok = ok && itemFormat.includes("Офис");
            if (format === "hybrid") ok = ok && itemFormat.includes("Гибрид");
        }
        
        return ok;
    });
    
    filtered = sortItems(filtered, sortType);
    
    renderMap(filtered);
    renderList(filtered);
};

async function loadAllData() {
    try {
        console.log("Загрузка всех данных...");
        
        const querySnapshot = await getDocs(collection(db, "opportunity"));
        jobs = [];
        internships = [];
        events = [];

        for (const docSnap of querySnapshot.docs) {
            const item = { id: docSnap.id, ...docSnap.data() };
            
            console.log(`Загружена вакансия: ${item.title}, статус модерации: ${item.moderation_status || "undefined"}, наличие карты: ${!!item.map}`);
            
            if (!isModerationApproved(item)) {
                console.log(`  - Пропущена (не одобрена): ${item.title}`);
                continue;
            }

            if (item.company_id) {
                try {
                    const companyDoc = await getDoc(doc(db, "companies", item.company_id));
                    if (companyDoc.exists()) {
                        item.company_name = companyDoc.data().name;
                        item.company_logo = companyDoc.data().logo_url || null;
                    } else {
                        item.company_name = "Организатор";
                    }
                } catch (e) {
                    item.company_name = "Организатор";
                }
            }

            if (item.type === "internship") {
                internships.push(item);
            } else if (item.type === "event") {
                events.push(item);
            } else {
                jobs.push(item);
            }
        }

        console.log(`Загружено: вакансий ${jobs.length}, стажировок ${internships.length}, мероприятий ${events.length}`);
        console.log(`Вакансии с картой: ${jobs.filter(j => j.map && j.map.latitude).length}`);

        initTagFilters([...jobs, ...internships, ...events]);

        let currentData = [];
        if (currentType === "vacancy") currentData = jobs;
        else if (currentType === "internship") currentData = internships;
        else currentData = events;
        
        const sortedData = sortItems(currentData, "newest");
        
        if (isMapInitialized || map) {
            renderMap(sortedData);
        } else {
            pendingJobs = sortedData;
        }
        renderList(sortedData);

    } catch (error) {
        console.error("Ошибка загрузки:", error);
        
        const list = document.getElementById("list");
        if (list) {
            list.innerHTML = "<p style='text-align:center; padding: 20px; color: red;'>Ошибка загрузки данных. Проверьте подключение к интернету.</p>";
        }
    }
}

if (isHomePage) {
    if (document.readyState === 'loading') {
        document.addEventListener("DOMContentLoaded", () => {
            initMap();
        });
    } else {
        initMap();
    }
}