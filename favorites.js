import { db, auth } from "./firebase.js";
import { 
    collection, 
    getDocs, 
    doc,
    getDoc,
    query,
    where,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { 
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

let currentUser = null;
let favoriteJobs = [];

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    await loadFavorites();
});

window.logout = async function() {
    await signOut(auth);
    window.location.href = "index.html";
};

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

function renderList(data) {
    const list = document.getElementById("list");
    if (!list) return;

    list.innerHTML = "";

    if (data.length === 0) {
        list.innerHTML = "<p style='text-align:center; padding: 20px;'>У вас пока нет избранных вакансий</p><p style='text-align:center;'><button onclick=\"window.location.href='index.html'\">Перейти к вакансиям</button></p>";
        return;
    }

    data.forEach(job => {
        const formattedDate = formatDate(job.created_at);
        const dateText = formattedDate ? `<p style="font-size: 11px; color: #999; margin-top: 5px;">Дата добавления: ${formattedDate}</p>` : "";
        
        let addressText = "";
        if (job.formatted_address) {
            addressText = job.formatted_address;
        } else if (job.city) {
            addressText = job.city;
            if (job.street) addressText += `, ${job.street}`;
            if (job.house) addressText += `, ${job.house}`;
        } else {
            addressText = "Адрес не указан";
        }

        const div = document.createElement("div");
        div.className = "card";
        div.id = "job-" + job.id;

        div.innerHTML = `
            <div class="favorite" onclick="removeFromFavorites(event, '${job.id}')">
                ❤️
            </div>
            <h3>${escapeHtml(job.title || "Без названия")}</h3>
            <p><strong>${escapeHtml(job.company_name || "Компания")}</strong></p>
            <p>Зарплата: ${job.salary ? job.salary.toLocaleString() : "—"} ₽</p>
            <p>Формат работы: ${escapeHtml(job.format || "—")}</p>
            <p>Адрес: ${escapeHtml(addressText)}</p>
            ${job.description ? `<p style="font-size: 12px; color: #666; margin-top: 8px;">${escapeHtml(job.description.substring(0, 100))}${job.description.length > 100 ? "..." : ""}</p>` : ""}
            ${dateText}
            <div style="margin-top: 10px;">
                <button onclick="viewJobDetails('${job.id}')" style="background: #1f6aa5; padding: 6px 12px; font-size: 12px;">Просмотреть вакансию</button>
            </div>
        `;

        list.appendChild(div);
    });
}

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.viewJobDetails = function(jobId) {
    window.location.href = `item-detail.html?id=${jobId}`;
};

async function loadFavorites() {
    // Загружаем избранное из localStorage
    const localFavorites = JSON.parse(localStorage.getItem("favorites")) || [];
    
    // Если пользователь авторизован, синхронизируем с Firestore
    let favoriteIds = [...localFavorites];
    
    if (currentUser) {
        try {
            const q = query(collection(db, "favorites"), where("user_id", "==", currentUser.uid));
            const snapshot = await getDocs(q);
            const firebaseFavorites = snapshot.docs.map(doc => doc.data().job_id);
            
            favoriteIds = [...new Set([...localFavorites, ...firebaseFavorites])];
            
            localStorage.setItem("favorites", JSON.stringify(favoriteIds));
        } catch (error) {
            console.error("Ошибка загрузки избранного из Firebase:", error);
        }
    }
    
    if (favoriteIds.length === 0) {
        renderList([]);
        return;
    }
    
    try {
        const querySnapshot = await getDocs(collection(db, "opportunity"));
        favoriteJobs = [];

        for (const docSnap of querySnapshot.docs) {
            const job = { id: docSnap.id, ...docSnap.data() };
            
            if (favoriteIds.includes(job.id)) {
                if (job.company_id) {
                    try {
                        const companyDoc = await getDoc(doc(db, "companies", job.company_id));
                        if (companyDoc.exists()) {
                            job.company_name = companyDoc.data().name;
                        } else {
                            job.company_name = "Компания";
                        }
                    } catch(e) {
                        job.company_name = "Компания";
                    }
                } else {
                    job.company_name = "Компания";
                }
                favoriteJobs.push(job);
            }
        }
        
        favoriteJobs.sort((a, b) => {
            const timestampA = getTimestamp(a.created_at);
            const timestampB = getTimestamp(b.created_at);
            return timestampB - timestampA;
        });
        
        renderList(favoriteJobs);
        
    } catch (error) {
        console.error("Ошибка загрузки избранных:", error);
        renderList([]);
    }
}

window.removeFromFavorites = async function(event, jobId) {
    event.stopPropagation();
    
    let favorites = JSON.parse(localStorage.getItem("favorites")) || [];
    favorites = favorites.filter(f => f !== jobId);
    localStorage.setItem("favorites", JSON.stringify(favorites));
    
    if (currentUser) {
        try {
            const q = query(
                collection(db, "favorites"), 
                where("user_id", "==", currentUser.uid),
                where("job_id", "==", jobId)
            );
            const snapshot = await getDocs(q);
            
            const deletePromises = [];
            snapshot.forEach(doc => {
                deletePromises.push(deleteDoc(doc.ref));
            });
            await Promise.all(deletePromises);
            
            console.log(`Удалено из Firebase избранное: ${jobId}`);
        } catch (error) {
            console.error("Ошибка удаления из Firebase:", error);
        }
    }
    
    favoriteJobs = favoriteJobs.filter(job => job.id !== jobId);
    renderList(favoriteJobs);
    
    window.dispatchEvent(new StorageEvent('storage', {
        key: 'favorites',
        newValue: JSON.stringify(favorites),
        oldValue: JSON.stringify([...favorites, jobId])
    }));
    
    alert("Вакансия удалена из избранного");
};

window.addEventListener('storage', function(e) {
    if (e.key === 'favorites') {
        loadFavorites();
    }
});

export { loadFavorites };