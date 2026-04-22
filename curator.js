import { db, auth } from "./firebase.js";
import { 
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    EmailAuthProvider,
    reauthenticateWithCredential,
    deleteUser
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { 
    collection, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    getDoc,
    setDoc,
    addDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { 
    onAuthStateChanged,
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

let currentUser = null;
let allCompanies = [];
let allUsers = [];
let allJobs = [];
let pendingJobs = [];
let currentCompanyFilter = "all";
let isAdmin = false;
let currentUserData = null;

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateValue) {
    if (!dateValue) return "—";
    
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
        else {
            return "—";
        }
        
        if (isNaN(date.getTime())) return "—";
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${day}.${month}.${year} ${hours}:${minutes}`;
    } catch (e) {
        return "—";
    }
}

function formatDateShort(dateValue) {
    if (!dateValue) return "—";
    
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
        else {
            return "—";
        }
        
        if (isNaN(date.getTime())) return "—";
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        
        return `${day}.${month}.${year}`;
    } catch (e) {
        return "—";
    }
}

function renderCompanies() {
    const container = document.getElementById("companiesList");
    if (!container) return;
    
    let filtered = [...allCompanies];
    
    if (currentCompanyFilter === "pending") {
        filtered = filtered.filter(c => c.verification_requested === true && c.verified !== true);
    } else if (currentCompanyFilter === "verified") {
        filtered = filtered.filter(c => c.verified === true);
    }
    
    const searchTerm = document.getElementById("companySearch")?.value.toLowerCase() || "";
    if (searchTerm) {
        filtered = filtered.filter(c => 
            (c.name?.toLowerCase() || "").includes(searchTerm) ||
            (c.owner_email?.toLowerCase() || "").includes(searchTerm) ||
            (c.site?.toLowerCase() || "").includes(searchTerm) ||
            (c.field?.toLowerCase() || "").includes(searchTerm)
        );
    }
    
    if (filtered.length === 0) {
        if (currentCompanyFilter === "pending") {
            container.innerHTML = '<div class="empty-state">Нет активных заявок на верификацию</div>';
        } else {
            container.innerHTML = '<div class="empty-state">Нет компаний для отображения</div>';
        }
        return;
    }
    
    container.innerHTML = "";
    
    filtered.forEach(company => {
        const isVerified = company.verified === true;
        const hasRequest = company.verification_requested === true && !isVerified;
        
        const div = document.createElement("div");
        div.className = `company-card ${isVerified ? 'verified' : hasRequest ? 'pending' : ''}`;
        
        const requestDate = company.verification_requested_at ? formatDate(company.verification_requested_at) : "—";
        
        div.innerHTML = `
            <div class="company-header">
                <h3 class="company-name">${escapeHtml(company.name) || "Без названия"}</h3>
                <span class="company-status ${isVerified ? 'status-verified' : hasRequest ? 'status-pending' : ''}">
                    ${isVerified ? 'Верифицирована' : hasRequest ? 'Ожидает верификации' : 'Не верифицирована'}
                </span>
            </div>
            
            ${hasRequest ? `
                <div style="background: #fff3cd; padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; font-size: 13px;">
                    Заявка на верификацию от ${requestDate}
                </div>
                ${company.verification_data ? `
                    <div style="background: #e7f3ff; padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; font-size: 13px;">
                        <strong>Корпоративная почта для верификации:</strong> ${escapeHtml(company.verification_data.corp_email) || "—"}
                    </div>
                ` : ''}
            ` : ''}
            
            <div class="company-info">
                <p><strong>Владелец:</strong> ${escapeHtml(company.owner_name) || "—"}</p>
                <p><strong>Email:</strong> ${escapeHtml(company.owner_email) || "—"}</p>
                <p><strong>Сайт:</strong> ${escapeHtml(company.site) || "—"}</p>
                <p><strong>Сфера деятельности:</strong> ${escapeHtml(company.field) || "—"}</p>
                <p><strong>Описание:</strong> ${escapeHtml(company.description) || "—"}</p>
                <p><strong>Соцсети:</strong> ${escapeHtml(company.social) || "—"}</p>
            </div>
            
            <div class="company-actions">
                ${hasRequest ? `
                    <button class="btn-verify" onclick="openVerifyCompanyModal('${company.id}')">Подтвердить верификацию</button>
                    <button class="btn-reject" onclick="rejectVerification('${company.id}')">Отклонить</button>
                    <button class="btn-view" onclick="editCompanyData('${company.id}')">Редактировать компанию</button>
                ` : isVerified ? `
                    <button class="btn-reject" onclick="revokeVerification('${company.id}')">Снять верификацию</button>
                    <button class="btn-view" onclick="viewCompanyJobs('${company.id}')">Вакансии компании</button>
                    <button class="btn-view" onclick="editCompanyData('${company.id}')">Редактировать компанию</button>
                ` : `
                    <button class="btn-verify" onclick="forceVerify('${company.id}')">Верифицировать (без заявки)</button>
                    <button class="btn-view" onclick="viewCompanyJobs('${company.id}')">Вакансии компании</button>
                    <button class="btn-view" onclick="editCompanyData('${company.id}')">Редактировать компанию</button>
                `}
            </div>
        `;
        
        container.appendChild(div);
    });
}

function updateStats() {
    const total = allCompanies.length;
    const verified = allCompanies.filter(c => c.verified === true).length;
    const pending = allCompanies.filter(c => c.verification_requested === true && c.verified !== true).length;
    
    const totalEl = document.getElementById("totalCompanies");
    const verifiedEl = document.getElementById("verifiedCompanies");
    const pendingEl = document.getElementById("pendingCompanies");
    
    if (totalEl) totalEl.textContent = total;
    if (verifiedEl) verifiedEl.textContent = verified;
    if (pendingEl) pendingEl.textContent = pending;
}

async function loadAllCompanies() {
    try {
        console.log("Загрузка компаний...");
        const companiesSnap = await getDocs(collection(db, "companies"));
        allCompanies = [];
        
        for (const docSnap of companiesSnap.docs) {
            const company = { id: docSnap.id, ...docSnap.data() };
            
            try {
                const userDoc = await getDoc(doc(db, "users", company.id));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    company.owner = userData;
                    company.owner_email = userData.email;
                    company.owner_name = `${userData.firstName || ""} ${userData.lastName || ""}`.trim() || "Не указан";
                    company.verified = userData.company_verified === true;
                    company.verification_requested = userData.verification_requested === true;
                    company.verification_requested_at = userData.verification_requested_at;
                    company.verification_data = userData.verification_data;
                } else {
                    company.verified = false;
                    company.verification_requested = false;
                    company.owner_email = "Не найден";
                    company.owner_name = "Не найден";
                }
            } catch (err) {
                console.error("Ошибка загрузки пользователя для компании", company.id, err);
                company.verified = false;
                company.verification_requested = false;
                company.owner_email = "Ошибка загрузки";
                company.owner_name = "Ошибка загрузки";
            }
            
            allCompanies.push(company);
        }
        
        console.log(`Загружено ${allCompanies.length} компаний`);
        updateStats();
        renderCompanies();
        
    } catch (error) {
        console.error("Ошибка загрузки компаний:", error);
        const container = document.getElementById("companiesList");
        if (container) {
            container.innerHTML = '<div class="empty-state" style="color: red;">Ошибка загрузки компаний. Проверьте подключение к интернету.</div>';
        }
    }
}

async function loadAllUsers() {
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        allUsers = [];
        const container = document.getElementById("usersList");
        if (!container) return;
        container.innerHTML = "";
        
        for (const docSnap of usersSnap.docs) {
            const user = docSnap.data();
            const userId = docSnap.id;
            
            allUsers.push({ id: userId, ...user });
            
            const div = document.createElement("div");
            div.className = "card";
            
            let companyName = "";
            if (user.role === "employer") {
                const companyDoc = await getDoc(doc(db, "companies", userId));
                if (companyDoc.exists()) {
                    companyName = companyDoc.data().name;
                }
            }
            
            div.innerHTML = `
                <h3>${escapeHtml(user.firstName) || ""} ${escapeHtml(user.lastName) || ""}</h3>
                <p>Email: ${escapeHtml(user.email) || ""}</p>
                <p>Роль: ${user.role === "student" ? "Студент" : user.role === "employer" ? "Работодатель" : "Куратор"} ${user.isAdmin ? " (Администратор)" : ""}</p>
                ${user.role === "employer" ? `<p>Компания: ${escapeHtml(companyName) || "Не заполнена"}</p>` : ""}
                ${user.role === "employer" ? `<p>Верифицирована: ${user.company_verified ? "Да" : user.verification_requested ? "Заявка отправлена" : "Нет"}</p>` : ""}
                <div style="display: flex; gap: 8px; margin-top: 10px;">
                    <button onclick="editUserData('${userId}')" style="background: #ffc107; color: #333;">Редактировать</button>
                    <button onclick="deleteUser('${userId}')" class="delete-btn">Удалить пользователя</button>
                </div>
            `;
            container.appendChild(div);
        }
    } catch (error) {
        console.error("Ошибка загрузки пользователей:", error);
    }
}

async function loadAllJobs() {
    try {
        const jobsSnap = await getDocs(collection(db, "opportunity"));
        const container = document.getElementById("allJobsList");
        if (!container) return;
        container.innerHTML = "";
        allJobs = [];
        pendingJobs = [];
        
        for (const docSnap of jobsSnap.docs) {
            const job = docSnap.data();
            const jobId = docSnap.id;
            
            let companyName = "Компания не найдена";
            let companyId = null;
            if (job.company_id) {
                companyId = job.company_id;
                try {
                    const companyDoc = await getDoc(doc(db, "companies", job.company_id));
                    if (companyDoc.exists()) {
                        companyName = companyDoc.data().name || companyDoc.data().owner_email || "Компания";
                    }
                } catch (err) {
                    console.error("Ошибка загрузки компании:", err);
                }
            }
            
            const jobWithId = { id: jobId, ...job, company_name: companyName };
            allJobs.push(jobWithId);
            
            if (job.moderation_status === "pending") {
                pendingJobs.push(jobWithId);
            }
            
            const div = document.createElement("div");
            div.className = "card";
            
            let typeText = "";
            if (job.type === "internship") typeText = "Стажировка";
            else if (job.type === "event") typeText = "Мероприятие";
            else typeText = "Вакансия";

            const moderationStatus = job.moderation_status || "approved";
            const moderationText = moderationStatus === "pending" ? "На рассмотрении" :
                                    moderationStatus === "rejected" ? "Отклонена" :
                                    "Одобрена";
            
            let rejectionHtml = "";
            if (moderationStatus === "rejected" && job.moderation_rejection_reason) {
                rejectionHtml = `<div class="rejection-reason"><strong>Причина отклонения:</strong> ${escapeHtml(job.moderation_rejection_reason)}</div>`;
            }
            
            div.innerHTML = `
                <h3>${escapeHtml(job.title) || "Без названия"} <span style="font-size: 12px; color: #666;">(${typeText})</span>
                    <span class="moderation-badge ${moderationStatus === 'pending' ? 'moderation-pending' : moderationStatus === 'rejected' ? 'moderation-rejected' : 'moderation-approved'}">
                        ${moderationText}
                    </span>
                </h3>
                <p><strong>Компания:</strong> ${escapeHtml(companyName)}</p>
                <p><strong>Зарплата:</strong> ${job.salary ? job.salary.toLocaleString() : "—"} ₽</p>
                <p><strong>Город:</strong> ${job.city || "Город не указан"}</p>
                <p><strong>Формат:</strong> ${job.format || "—"}</p>
                <p><strong>Статус:</strong> ${job.status === "active" ? "Активная" : job.status === "planned" ? "Запланированная" : "Закрытая"}</p>
                ${rejectionHtml}
                ${job.description ? `<p><strong>Описание:</strong> ${escapeHtml(job.description.substring(0, 100))}${job.description.length > 100 ? "..." : ""}</p>` : ""}
                <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
                    <button onclick="viewJobDetails('${jobId}')" style="background: #1f6aa5;">Просмотр</button>
                    <button onclick="editJobAsCurator('${jobId}')" style="background: #ffc107; color: #333;">Редактировать</button>
                    <button onclick="openRejectJobModal('${jobId}', '${escapeHtml(job.title).replace(/'/g, "\\'")}')" style="background: #dc3545;">Отклонить</button>
                    ${moderationStatus === "pending" ? `<button onclick="approveOpportunity('${jobId}')" style="background: #28a745; color: white;">Одобрить</button>` : ``}
                    <button onclick="deleteJob('${jobId}')" style="background: #6c757d;">Удалить</button>
                    <button onclick="viewModerationHistory('${jobId}')" style="background: #17a2b8;">История</button>
                </div>
            `;
            container.appendChild(div);
        }
        
        renderPendingJobsList();
        
    } catch (error) {
        console.error("Ошибка загрузки вакансий:", error);
        const container = document.getElementById("allJobsList");
        if (container) {
            container.innerHTML = '<div class="empty-state">Ошибка загрузки вакансий</div>';
        }
    }
}

function renderPendingJobsList() {
    const container = document.getElementById("pendingJobsList");
    if (!container) return;
    
    if (pendingJobs.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет вакансий, ожидающих модерации</div>';
        return;
    }
    
    container.innerHTML = "";
    
    pendingJobs.forEach(job => {
        const div = document.createElement("div");
        div.className = "card";
        
        let typeText = "";
        if (job.type === "internship") typeText = "Стажировка";
        else if (job.type === "event") typeText = "Мероприятие";
        else typeText = "Вакансия";
        
        div.innerHTML = `
            <h3>${escapeHtml(job.title) || "Без названия"} <span style="font-size: 12px; color: #666;">(${typeText})</span>
                <span class="moderation-badge moderation-pending">На рассмотрении</span>
            </h3>
            <p><strong>Компания:</strong> ${escapeHtml(job.company_name)}</p>
            <p><strong>Зарплата:</strong> ${job.salary ? job.salary.toLocaleString() : "—"} ₽</p>
            <p><strong>Город:</strong> ${job.city || "Город не указан"}</p>
            <p><strong>Формат:</strong> ${job.format || "—"}</p>
            <p><strong>Описание:</strong> ${job.description ? escapeHtml(job.description.substring(0, 100)) + (job.description.length > 100 ? "..." : "") : "Описание отсутствует"}</p>
            <div style="display: flex; gap: 8px; margin-top: 12px;">
                <button onclick="viewJobDetails('${job.id}')" style="background: #1f6aa5;">Просмотр</button>
                <button onclick="editJobAsCurator('${job.id}')" style="background: #ffc107; color: #333;">Редактировать</button>
                <button onclick="approveOpportunity('${job.id}')" style="background: #28a745;">Одобрить</button>
                <button onclick="openRejectJobModal('${job.id}', '${escapeHtml(job.title).replace(/'/g, "\\'")}')" style="background: #dc3545;">Отклонить</button>
            </div>
        `;
        container.appendChild(div);
    });
}

async function loadAllCurators() {
    if (!isAdmin) return;
    
    try {
        const usersSnap = await getDocs(
            query(collection(db, "users"), where("role", "==", "curator"))
        );
        
        const container = document.getElementById("curatorsList");
        if (!container) return;
        
        if (usersSnap.empty) {
            container.innerHTML = '<div class="empty-state">Нет кураторов</div>';
            return;
        }
        
        container.innerHTML = "";
        
        for (const docSnap of usersSnap.docs) {
            const curator = docSnap.data();
            const curatorId = docSnap.id;
            const isThisAdmin = curator.isAdmin === true;
            const isCurrentUser = curatorId === currentUser?.uid;
            
            const div = document.createElement("div");
            div.className = "curator-item";
            div.innerHTML = `
                <div class="curator-info">
                    <h4>${escapeHtml(curator.firstName)} ${escapeHtml(curator.lastName)} 
                        ${isThisAdmin ? '<span class="admin-badge">Администратор</span>' : ''}
                    </h4>
                    <p>Email: ${escapeHtml(curator.email)}</p>
                    <p>Создан: ${formatDate(curator.created_at)}</p>
                </div>
                ${!isThisAdmin && !isCurrentUser ? `
                    <div style="display: flex; gap: 8px;">
                        <button class="delete-curator-btn" onclick="editUserData('${curatorId}')" style="background: #ffc107; color: #333;">Редактировать</button>
                        <button class="delete-curator-btn" onclick="deleteCurator('${curatorId}')">Удалить</button>
                    </div>
                ` : ''}
                ${isCurrentUser && !isThisAdmin ? `
                    <button class="delete-curator-btn" onclick="makeAdmin('${curatorId}')" style="background: #ffc107; color: #333;">Сделать админом</button>
                ` : ''}
            `;
            container.appendChild(div);
        }
        
    } catch (error) {
        console.error("Ошибка загрузки кураторов:", error);
    }
}

// ========== РЕДАКТИРОВАНИЕ ПОЛЬЗОВАТЕЛЯ ==========
window.editUserData = async function(userId) {
    try {
        const userDoc = await getDoc(doc(db, "users", userId));
        if (!userDoc.exists()) {
            alert("Пользователь не найден");
            return;
        }
        
        const userData = userDoc.data();
        
        if (typeof openEditUserModal === 'function') {
            openEditUserModal(userId, userData);
        } else {
            alert("Ошибка: функция редактирования не найдена");
        }
    } catch (error) {
        console.error("Ошибка загрузки пользователя:", error);
        alert("Ошибка при загрузке данных пользователя");
    }
};

window.saveEditedUser = async function() {
    const userId = document.getElementById("editUserId").value;
    const role = document.getElementById("editUserRole").value;
    
    const userData = {
        firstName: document.getElementById("editUserFirstName").value,
        lastName: document.getElementById("editUserLastName").value,
        email: document.getElementById("editUserEmail").value,
        phone: document.getElementById("editUserPhone").value,
        updated_at: new Date(),
        updated_by: currentUser?.uid
    };
    
    if (role === "student") {
        userData.university = document.getElementById("editUserUniversity").value;
        userData.course = document.getElementById("editUserCourse").value;
        userData.speciality = document.getElementById("editUserSpeciality").value;
        const skillsText = document.getElementById("editUserSkills").value;
        userData.skills = skillsText.split(",").map(s => s.trim()).filter(s => s);
    }
    
    try {
        await updateDoc(doc(db, "users", userId), userData);
        
        await addDoc(collection(db, "moderation_logs"), {
            action: "user_edit",
            user_id: userId,
            moderator_id: currentUser?.uid,
            moderator_name: `${currentUserData?.firstName || ""} ${currentUserData?.lastName || ""}`,
            changes: userData,
            created_at: new Date()
        });
        
        alert("Данные пользователя обновлены");
        closeEditUserModal();
        await loadAllUsers();
        await loadAllCompanies();
        if (isAdmin) {
            await loadAllCurators();
        }
    } catch (error) {
        console.error("Ошибка сохранения:", error);
        alert("Ошибка при сохранении: " + error.message);
    }
};

// ========== РЕДАКТИРОВАНИЕ КОМПАНИИ ==========
window.editCompanyData = async function(companyId) {
    try {
        const companyDoc = await getDoc(doc(db, "companies", companyId));
        if (!companyDoc.exists()) {
            alert("Компания не найдена");
            return;
        }
        
        const companyData = companyDoc.data();
        
        if (typeof openEditCompanyModal === 'function') {
            openEditCompanyModal(companyId, companyData);
        } else {
            alert("Ошибка: функция редактирования не найдена");
        }
    } catch (error) {
        console.error("Ошибка загрузки компании:", error);
        alert("Ошибка при загрузке данных компании");
    }
};

window.saveEditedCompany = async function() {
    const companyId = document.getElementById("editCompanyId").value;
    
    const companyData = {
        name: document.getElementById("editCompanyName").value,
        field: document.getElementById("editCompanyField").value,
        site: document.getElementById("editCompanySite").value,
        social: document.getElementById("editCompanySocial").value,
        description: document.getElementById("editCompanyDesc").value,
        updated_at: new Date(),
        updated_by: currentUser?.uid
    };
    
    try {
        await updateDoc(doc(db, "companies", companyId), companyData);
        
        await addDoc(collection(db, "moderation_logs"), {
            action: "company_edit",
            company_id: companyId,
            moderator_id: currentUser?.uid,
            moderator_name: `${currentUserData?.firstName || ""} ${currentUserData?.lastName || ""}`,
            changes: companyData,
            created_at: new Date()
        });
        
        alert("Данные компании обновлены");
        closeEditCompanyModal();
        await loadAllCompanies();
    } catch (error) {
        console.error("Ошибка сохранения:", error);
        alert("Ошибка при сохранении: " + error.message);
    }
};

// ========== МОДАЛЬНОЕ ОКНО ДЛЯ ПОДТВЕРЖДЕНИЯ ВЕРИФИКАЦИИ ==========
window.confirmVerifyCompany = async function() {
    const companyId = document.getElementById("verifyCompanyId").value;
    const emailChecked = document.getElementById("verifyEmailCheck").checked;
    const domainChecked = document.getElementById("verifyDomainCheck").checked;
    const infoChecked = document.getElementById("verifyInfoCheck").checked;
    
    if (!emailChecked || !domainChecked || !infoChecked) {
        alert("Пожалуйста, подтвердите все пункты проверки");
        return;
    }
    
    if (!confirm("Подтвердить верификацию компании?")) return;
    
    try {
        const userRef = doc(db, "users", companyId);
        const companyRef = doc(db, "companies", companyId);
        
        await updateDoc(userRef, { 
            company_verified: true,
            verified: true,
            verified_at: new Date(),
            verified_by: currentUser?.uid,
            verification_requested: false,
            verification_approved_at: new Date(),
            verification_approved_by: currentUser?.uid,
            verification_completed: true
        });
        
        await updateDoc(companyRef, {
            verified: true,
            verified_at: new Date(),
            verified_by: currentUser?.uid
        });
        
        await addDoc(collection(db, "moderation_logs"), {
            action: "company_verified",
            company_id: companyId,
            moderator_id: currentUser?.uid,
            moderator_name: `${currentUserData?.firstName || ""} ${currentUserData?.lastName || ""}`,
            verification_confirmed: true,
            created_at: new Date()
        });
        
        alert("Компания успешно верифицирована");
        closeVerifyCompanyModal();
        await loadAllCompanies();
        
    } catch (error) {
        console.error("Ошибка верификации:", error);
        alert("Ошибка при верификации компании: " + error.message);
    }
};

// ========== ФУНКЦИИ МОДЕРАЦИИ ==========

window.viewJobDetails = function(jobId) {
    window.open(`item-detail.html?id=${jobId}`, '_blank');
};

let editingJobData = null;

window.editJobAsCurator = async function(jobId) {
    try {
        const jobDoc = await getDoc(doc(db, "opportunity", jobId));
        if (!jobDoc.exists()) {
            alert("Вакансия не найдена");
            return;
        }
        
        const job = jobDoc.data();
        editingJobData = { id: jobId, ...job };
        
        document.getElementById('editJobId').value = jobId;
        document.getElementById('editTitle').value = job.title || '';
        document.getElementById('editType').value = job.type || 'vacancy';
        document.getElementById('editSalary').value = job.salary || '';
        document.getElementById('editCity').value = job.city || '';
        document.getElementById('editFormat').value = job.format || 'Удалённая';
        document.getElementById('editStatus').value = job.status || 'active';
        document.getElementById('editTags').value = (job.tags || []).join(', ');
        document.getElementById('editDescription').value = job.description || '';

        const toInputDate = (dateVal) => {
            if (!dateVal) return "";
            try {
                let d = dateVal;
                if (typeof d === "object" && d !== null && "seconds" in d) {
                    d = new Date(d.seconds * 1000);
                } else {
                    d = new Date(d);
                }
                return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
            } catch (e) {
                return "";
            }
        };

        const deadlineEl = document.getElementById("editDeadlineDate");
        const durationEl = document.getElementById("editDuration");
        const mentorEl = document.getElementById("editMentor");
        const requirementsEl = document.getElementById("editRequirements");
        const eventStartDateEl = document.getElementById("editEventStartDate");
        const eventEndDateEl = document.getElementById("editEventEndDate");
        const startTimeEl = document.getElementById("editStartTime");
        const endTimeEl = document.getElementById("editEndTime");
        const speakerEl = document.getElementById("editSpeaker");

        if (job.type === "event") {
            if (deadlineEl) deadlineEl.value = "";
            if (durationEl) durationEl.value = "";
            if (mentorEl) mentorEl.value = "";
            if (requirementsEl) requirementsEl.value = "";

            if (eventStartDateEl) eventStartDateEl.value = toInputDate(job.start_date);
            if (eventEndDateEl) eventEndDateEl.value = toInputDate(job.end_date);
            if (startTimeEl) startTimeEl.value = job.start_time || "";
            if (endTimeEl) endTimeEl.value = job.end_time || "";
            if (speakerEl) speakerEl.value = job.speaker || "";
        } else if (job.type === "internship") {
            if (deadlineEl) deadlineEl.value = toInputDate(job.end_date);
            if (durationEl) durationEl.value = job.duration || "";
            if (mentorEl) mentorEl.value = job.mentor || "";
            if (requirementsEl) requirementsEl.value = job.requirements || "";

            if (eventStartDateEl) eventStartDateEl.value = "";
            if (eventEndDateEl) eventEndDateEl.value = "";
            if (startTimeEl) startTimeEl.value = "";
            if (endTimeEl) endTimeEl.value = "";
            if (speakerEl) speakerEl.value = "";
        } else {
            if (deadlineEl) deadlineEl.value = toInputDate(job.end_date);
            if (durationEl) durationEl.value = "";
            if (mentorEl) mentorEl.value = "";
            if (requirementsEl) requirementsEl.value = "";

            if (eventStartDateEl) eventStartDateEl.value = "";
            if (eventEndDateEl) eventEndDateEl.value = "";
            if (startTimeEl) startTimeEl.value = "";
            if (endTimeEl) endTimeEl.value = "";
            if (speakerEl) speakerEl.value = "";
        }
        
        document.getElementById('editJobModal').style.display = 'flex';
        
    } catch (error) {
        console.error("Ошибка загрузки вакансии для редактирования:", error);
        alert("Ошибка при загрузке вакансии: " + error.message);
    }
};

window.saveEditedJob = async function() {
    const jobId = document.getElementById('editJobId').value;
    
    if (!jobId) {
        alert("Ошибка: ID вакансии не найден");
        return;
    }
    
    const title = document.getElementById('editTitle').value.trim();
    if (!title) {
        alert("Пожалуйста, укажите название вакансии");
        return;
    }
    
    const jobData = {
        title: title,
        type: document.getElementById('editType').value,
        salary: Number(document.getElementById('editSalary').value) || 0,
        city: document.getElementById('editCity').value,
        format: document.getElementById('editFormat').value,
        status: document.getElementById('editStatus').value,
        tags: document.getElementById('editTags').value.split(',').map(t => t.trim()).filter(t => t),
        description: document.getElementById('editDescription').value,
        moderated_by: currentUser?.uid,
        moderated_at: new Date(),
        moderated_action: 'edited'
    };

    const type = document.getElementById('editType').value;
    const parseInputDate = (raw) => raw ? new Date(raw) : null;

    const deadlineRaw = document.getElementById('editDeadlineDate')?.value;
    const eventStartRaw = document.getElementById('editEventStartDate')?.value;
    const eventEndRaw = document.getElementById('editEventEndDate')?.value;
    const startTimeRaw = document.getElementById('editStartTime')?.value;
    const endTimeRaw = document.getElementById('editEndTime')?.value;
    const speakerRaw = document.getElementById('editSpeaker')?.value;

    if (type === 'event') {
        jobData.start_date = parseInputDate(eventStartRaw);
        jobData.end_date = parseInputDate(eventEndRaw);
        jobData.start_time = startTimeRaw || null;
        jobData.end_time = endTimeRaw || null;
        jobData.speaker = speakerRaw || null;

        jobData.duration = null;
        jobData.mentor = null;
        jobData.requirements = null;
    } else {
        jobData.end_date = parseInputDate(deadlineRaw);
        jobData.start_date = null;
        jobData.start_time = null;
        jobData.end_time = null;
        jobData.speaker = null;

        if (type === 'internship') {
            jobData.duration = document.getElementById('editDuration')?.value || null;
            jobData.mentor = document.getElementById('editMentor')?.value || null;
            jobData.requirements = document.getElementById('editRequirements')?.value || null;
        } else {
            jobData.duration = null;
            jobData.mentor = null;
            jobData.requirements = null;
        }
    }
    
    try {
        await updateDoc(doc(db, "opportunity", jobId), jobData);
        
        await addDoc(collection(db, "moderation_logs"), {
            job_id: jobId,
            action: "edit",
            moderator_id: currentUser?.uid,
            moderator_name: `${currentUserData?.firstName || ""} ${currentUserData?.lastName || ""}`,
            changes: jobData,
            created_at: new Date()
        });
        
        alert("Вакансия успешно отредактирована");
        
        closeEditJobModal();
        await loadAllJobs();
        
        editingJobData = null;
        
    } catch (error) {
        console.error("Ошибка редактирования:", error);
        alert("Ошибка при редактировании: " + error.message);
    }
};

window.submitRejectJob = async function() {
    const jobId = document.getElementById('rejectJobId').value;
    const jobTitle = document.getElementById('rejectJobTitle').value;
    const reason = document.getElementById('rejectReason').value.trim();
    
    if (!reason) {
        alert("Пожалуйста, укажите причину отклонения");
        return;
    }
    
    if (!confirm(`Отклонить вакансию "${jobTitle}"?\n\nПричина: ${reason}`)) return;
    
    try {
        await updateDoc(doc(db, "opportunity", jobId), {
            moderation_status: "rejected",
            moderation_rejected_at: new Date(),
            moderation_rejected_by: currentUser?.uid,
            moderation_rejection_reason: reason
        });
        
        await addDoc(collection(db, "rejected_jobs"), {
            job_id: jobId,
            job_title: jobTitle,
            rejection_reason: reason,
            rejected_by: currentUser?.uid,
            rejected_by_name: `${currentUserData?.firstName || ""} ${currentUserData?.lastName || ""}`,
            rejected_at: new Date()
        });
        
        await addDoc(collection(db, "moderation_logs"), {
            job_id: jobId,
            job_title: jobTitle,
            action: "rejected",
            reason: reason,
            moderator_id: currentUser?.uid,
            moderator_name: `${currentUserData?.firstName || ""} ${currentUserData?.lastName || ""}`,
            created_at: new Date()
        });
        
        alert(`Вакансия "${jobTitle}" отклонена\nПричина: ${reason}`);
        closeRejectJobModal();
        await loadAllJobs();
        
    } catch (error) {
        console.error("Ошибка отклонения:", error);
        alert("Ошибка при отклонении вакансии: " + error.message);
    }
};

window.approveOpportunity = async function(jobId) {
    const jobTitle = prompt("Название публикации для подтверждения (можно оставить пустым):", "");
    const finalTitle = jobTitle && jobTitle.trim() ? jobTitle.trim() : "публикация";

    if (!confirm(`Одобрить публикацию "${finalTitle}"?\n\nПосле одобрения она появится на главной странице.`)) return;

    try {
        const jobDoc = await getDoc(doc(db, "opportunity", jobId));
        const jobData = jobDoc.exists() ? jobDoc.data() : {};
        const actualTitle = jobData.title || finalTitle;

        await updateDoc(doc(db, "opportunity", jobId), {
            moderation_status: "approved",
            moderation_approved_at: new Date(),
            moderation_approved_by: currentUser?.uid,
            moderation_rejection_reason: null
        });

        await addDoc(collection(db, "moderation_logs"), {
            job_id: jobId,
            job_title: actualTitle,
            action: "approved",
            moderator_id: currentUser?.uid,
            moderator_name: `${currentUserData?.firstName || ""} ${currentUserData?.lastName || ""}`.trim(),
            created_at: new Date()
        });

        alert(`Публикация "${actualTitle}" одобрена`);
        await loadAllJobs();
    } catch (error) {
        console.error("Ошибка одобрения:", error);
        alert("Ошибка при одобрении: " + error.message);
    }
};

window.viewModerationHistory = async function(jobId) {
    try {
        const logsSnap = await getDocs(
            query(collection(db, "moderation_logs"), where("job_id", "==", jobId))
        );
        
        if (logsSnap.empty) {
            alert("Нет записей о модерации этой вакансии");
            return;
        }
        
        let logsHtml = "";
        logsSnap.forEach(doc => {
            const log = doc.data();
            const actionText = log.action === "edit" ? "Редактирование" : log.action === "rejected" ? "Отклонение" : log.action;
            logsHtml += `
                <div style="background: #f8f9fa; padding: 10px; margin-bottom: 8px; border-radius: 8px;">
                    <strong>${actionText}</strong> - ${formatDate(log.created_at)}<br>
                    Модератор: ${escapeHtml(log.moderator_name) || "—"}<br>
                    ${log.reason ? `Причина: ${escapeHtml(log.reason)}<br>` : ''}
                </div>
            `;
        });
        
        const modal = document.createElement("div");
        modal.style.position = "fixed";
        modal.style.top = "0";
        modal.style.left = "0";
        modal.style.width = "100%";
        modal.style.height = "100%";
        modal.style.backgroundColor = "rgba(0,0,0,0.5)";
        modal.style.display = "flex";
        modal.style.alignItems = "center";
        modal.style.justifyContent = "center";
        modal.style.zIndex = "1000";
        
        modal.innerHTML = `
            <div style="background: white; border-radius: 20px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; padding: 25px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #1f6aa5;">История модерации</h2>
                    <button onclick="this.closest('div[style*=\\'position: fixed\\']').remove()" style="background: none; border: none; font-size: 28px; cursor: pointer;">&times;</button>
                </div>
                <div id="moderationLogs">
                    ${logsHtml || "<p>Нет записей</p>"}
                </div>
            </div>
        `;
        
        modal.addEventListener("click", function(event) {
            if (event.target === modal) {
                modal.remove();
            }
        });
        
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error("Ошибка загрузки истории:", error);
        alert("Ошибка при загрузке истории модерации");
    }
};

// ========== ФУНКЦИИ УПРАВЛЕНИЯ ВЕРИФИКАЦИЕЙ ==========

window.viewVerificationDetails = async function(companyId) {
    try {
        const userDoc = await getDoc(doc(db, "users", companyId));
        if (!userDoc.exists()) {
            alert("Данные пользователя не найдены");
            return;
        }
        
        const userData = userDoc.data();
        const verificationData = userData.verification_data || {};
        const companyDoc = await getDoc(doc(db, "companies", companyId));
        const company = companyDoc.exists() ? companyDoc.data() : {};
        
        const modal = document.createElement("div");
        modal.style.position = "fixed";
        modal.style.top = "0";
        modal.style.left = "0";
        modal.style.width = "100%";
        modal.style.height = "100%";
        modal.style.backgroundColor = "rgba(0,0,0,0.5)";
        modal.style.display = "flex";
        modal.style.alignItems = "center";
        modal.style.justifyContent = "center";
        modal.style.zIndex = "1000";
        
        modal.innerHTML = `
            <div style="background: white; border-radius: 20px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; padding: 25px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #1f6aa5;">Детали заявки на верификацию</h2>
                    <button onclick="this.closest('div[style*=\\'position: fixed\\']').remove()" style="background: none; border: none; font-size: 28px; cursor: pointer;">&times;</button>
                </div>
                
                <div style="background: #f8f9fa; padding: 15px; border-radius: 12px; margin-bottom: 15px;">
                    <h3 style="margin: 0 0 10px 0; color: #1f6aa5;">Информация о компании</h3>
                    <p><strong>Название:</strong> ${escapeHtml(company.name) || "—"}</p>
                    <p><strong>Сфера деятельности:</strong> ${escapeHtml(company.field) || "—"}</p>
                    <p><strong>Сайт:</strong> ${escapeHtml(company.site) || "—"}</p>
                    <p><strong>Соцсети:</strong> ${escapeHtml(company.social) || "—"}</p>
                    <p><strong>Описание:</strong> ${escapeHtml(company.description) || "—"}</p>
                </div>
                
                <div style="background: #fff3cd; padding: 15px; border-radius: 12px; margin-bottom: 15px;">
                    <h3 style="margin: 0 0 10px 0; color: #856404;">Данные для верификации</h3>
                    <p><strong>Корпоративная почта:</strong> ${escapeHtml(verificationData.corp_email) || "—"}</p>
                    <p><strong>Домен почты:</strong> ${escapeHtml(verificationData.email_domain) || "—"}</p>
                    <p><strong>Дата подачи заявки:</strong> ${formatDate(userData.verification_requested_at)}</p>
                </div>
                
                <div style="margin-top: 20px;">
                    <p style="background: #e7f3ff; padding: 10px; border-radius: 8px; font-size: 13px;">
                        <strong>Как проверить:</strong><br>
                        1. Убедитесь, что домен почты соответствует домену сайта компании<br>
                        2. При необходимости отправьте тестовое письмо на указанную почту<br>
                        3. Если всё корректно - подтвердите верификацию
                    </p>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button onclick="openVerifyCompanyModal('${companyId}')" style="flex: 1; background: #28a745; padding: 12px;">Подтвердить верификацию</button>
                    <button onclick="rejectVerificationWithReason('${companyId}')" style="flex: 1; background: #dc3545; padding: 12px;">Отклонить заявку</button>
                </div>
            </div>
        `;
        
        modal.addEventListener("click", function(event) {
            if (event.target === modal) {
                modal.remove();
            }
        });
        
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error("Ошибка загрузки деталей:", error);
        alert("Ошибка при загрузке данных: " + error.message);
    }
};

window.rejectVerificationWithReason = async function(companyId) {
    const reason = prompt("Укажите причину отклонения (будет отправлена компании):\n\nПримеры причин:\n- Домен почты не соответствует сайту компании\n- Не удалось подтвердить корпоративную почту\n- Отсутствует необходимая информация");
    if (reason === null) return;
    
    if (!confirm(`Отклонить заявку на верификацию?\n\nПричина: ${reason}`)) return;
    
    try {
        const userRef = doc(db, "users", companyId);
        
        await updateDoc(userRef, { 
            verification_requested: false,
            verification_rejected: true,
            verification_rejected_at: new Date(),
            verification_rejected_by: currentUser?.uid,
            verification_rejection_reason: reason
        });
        
        await addDoc(collection(db, "moderation_logs"), {
            action: "verification_rejected",
            company_id: companyId,
            reason: reason,
            moderator_id: currentUser?.uid,
            moderator_name: `${currentUserData?.firstName || ""} ${currentUserData?.lastName || ""}`,
            created_at: new Date()
        });
        
        alert("Заявка на верификацию отклонена");
        
        const modal = document.querySelector('div[style*="position: fixed"]');
        if (modal) modal.remove();
        
        await loadAllCompanies();
        
    } catch (error) {
        console.error("Ошибка отклонения заявки:", error);
        alert("Ошибка при отклонении заявки: " + error.message);
    }
};

window.rejectVerification = async function(companyId) {
    const reason = prompt("Укажите причину отклонения (будет отправлена компании):");
    if (reason === null) return;
    
    if (!confirm(`Отклонить заявку на верификацию?${reason ? `\nПричина: ${reason}` : ""}`)) return;
    
    try {
        const userRef = doc(db, "users", companyId);
        
        await updateDoc(userRef, { 
            verification_requested: false,
            verification_rejected: true,
            verification_rejected_at: new Date(),
            verification_rejected_by: currentUser?.uid,
            verification_rejection_reason: reason || "Не указана"
        });
        
        alert("Заявка на верификацию отклонена");
        await loadAllCompanies();
        
    } catch (error) {
        console.error("Ошибка отклонения заявки:", error);
        alert("Ошибка при отклонении заявки: " + error.message);
    }
};

window.forceVerify = async function(companyId) {
    if (!confirm("Верифицировать компанию без заявки? Это действие доступно только для администраторов.")) return;
    
    try {
        const userRef = doc(db, "users", companyId);
        const companyRef = doc(db, "companies", companyId);
        
        await updateDoc(userRef, { 
            company_verified: true,
            verified: true,
            verified_at: new Date(),
            verified_by: currentUser?.uid,
            force_verified: true,
            verification_requested: false
        });
        
        await updateDoc(companyRef, {
            verified: true,
            verified_at: new Date(),
            verified_by: currentUser?.uid
        });
        
        alert("Компания верифицирована (принудительно)");
        await loadAllCompanies();
        
    } catch (error) {
        console.error("Ошибка принудительной верификации:", error);
        alert("Ошибка: " + error.message);
    }
};

window.revokeVerification = async function(companyId) {
    if (!confirm("Снять верификацию с компании? Компания потеряет возможность создавать новые публикации.")) return;
    
    try {
        const userRef = doc(db, "users", companyId);
        const companyRef = doc(db, "companies", companyId);
        
        await updateDoc(userRef, { 
            company_verified: false,
            verified: false,
            verification_revoked_at: new Date(),
            verification_revoked_by: currentUser?.uid
        });
        
        await updateDoc(companyRef, {
            verified: false,
            verification_revoked_at: new Date(),
            verification_revoked_by: currentUser?.uid
        });
        
        alert("Верификация компании снята");
        await loadAllCompanies();
        
    } catch (error) {
        console.error("Ошибка снятия верификации:", error);
        alert("Ошибка при снятии верификации: " + error.message);
    }
};

window.viewCompanyJobs = async function(companyId) {
    try {
        const jobsSnap = await getDocs(
            query(collection(db, "opportunity"), where("company_id", "==", companyId))
        );
        
        const company = allCompanies.find(c => c.id === companyId);
        const companyName = company?.name || "Компания";
        
        if (jobsSnap.empty) {
            alert(`У компании "${companyName}" пока нет вакансий`);
            return;
        }
        
        let jobsList = "";
        jobsSnap.forEach(doc => {
            const job = doc.data();
            jobsList += `
                <div style="background: #f8f9fa; padding: 12px; margin-bottom: 8px; border-radius: 8px;">
                    <strong>${escapeHtml(job.title)}</strong><br>
                    Зарплата: ${job.salary ? job.salary.toLocaleString() : "—"} ₽ | 
                    Формат: ${job.format || "—"} | 
                    Статус: ${job.status === "active" ? "Активная" : job.status === "planned" ? "Запланированная" : "Закрытая"}
                </div>
            `;
        });
        
        const modal = document.createElement("div");
        modal.style.position = "fixed";
        modal.style.top = "0";
        modal.style.left = "0";
        modal.style.width = "100%";
        modal.style.height = "100%";
        modal.style.backgroundColor = "rgba(0,0,0,0.5)";
        modal.style.display = "flex";
        modal.style.alignItems = "center";
        modal.style.justifyContent = "center";
        modal.style.zIndex = "1000";
        
        modal.innerHTML = `
            <div style="background: white; border-radius: 20px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0;">Вакансии компании "${escapeHtml(companyName)}"</h2>
                    <button onclick="this.closest('div[style*=\\'position: fixed\\']').remove()" style="background: none; border: none; font-size: 28px; cursor: pointer;">&times;</button>
                </div>
                <div id="companyJobsList">
                    ${jobsList || "<p>Нет вакансий</p>"}
                </div>
            </div>
        `;
        
        modal.addEventListener("click", function(event) {
            if (event.target === modal) {
                modal.remove();
            }
        });
        
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error("Ошибка загрузки вакансий:", error);
        alert("Ошибка при загрузке вакансий");
    }
};

// ========== ФУНКЦИИ УПРАВЛЕНИЯ КУРАТОРАМИ ==========

window.createCurator = async function() {
    if (!isAdmin) {
        alert("Только администратор может создавать новых кураторов");
        return;
    }
    
    const firstName = document.getElementById("curatorFirstName").value.trim();
    const lastName = document.getElementById("curatorLastName").value.trim();
    const email = document.getElementById("curatorEmail").value.trim();
    const password = document.getElementById("curatorPassword").value.trim();
    
    if (!firstName || !lastName || !email || !password) {
        alert("Пожалуйста, заполните все поля");
        return;
    }
    
    if (password.length < 6) {
        alert("Пароль должен содержать минимум 6 символов");
        return;
    }
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUser = userCredential.user;
        
        await setDoc(doc(db, "users", newUser.uid), {
            firstName: firstName,
            lastName: lastName,
            email: email,
            role: "curator",
            isAdmin: false,
            created_by: currentUser.uid,
            created_at: new Date(),
            verified: true
        });
        
        alert("Куратор " + firstName + " " + lastName + " успешно создан");
        
        document.getElementById("curatorFirstName").value = "";
        document.getElementById("curatorLastName").value = "";
        document.getElementById("curatorEmail").value = "";
        document.getElementById("curatorPassword").value = "";
        
        loadAllCurators();
        
    } catch (error) {
        console.error("Ошибка создания куратора:", error);
        if (error.code === 'auth/email-already-in-use') {
            alert("Пользователь с таким email уже существует");
        } else {
            alert("Ошибка при создании куратора: " + error.message);
        }
    }
};

window.makeAdmin = async function(curatorId) {
    if (!isAdmin) {
        alert("Только администратор может назначать других администраторов");
        return;
    }
    
    if (!confirm("Назначить этого пользователя администратором?")) return;
    
    try {
        await updateDoc(doc(db, "users", curatorId), {
            isAdmin: true
        });
        
        alert("Пользователь назначен администратором");
        loadAllCurators();
        
    } catch (error) {
        console.error("Ошибка назначения администратора:", error);
        alert("Ошибка: " + error.message);
    }
};

window.deleteCurator = async function(curatorId) {
    if (!isAdmin) {
        alert("Только администратор может удалять кураторов");
        return;
    }
    
    if (!confirm("Удалить куратора? Это действие необратимо.")) return;
    
    try {
        await deleteDoc(doc(db, "users", curatorId));
        
        alert("Куратор удален");
        loadAllCurators();
        loadAllUsers();
        
    } catch (error) {
        console.error("Ошибка удаления куратора:", error);
        alert("Ошибка при удалении куратора: " + error.message);
    }
};

// ========== ФУНКЦИИ УДАЛЕНИЯ ==========

window.deleteJob = async function(jobId) {
    if (!confirm("Удалить вакансию?")) return;
    
    try {
        await deleteDoc(doc(db, "opportunity", jobId));
        alert("Вакансия удалена");
        loadAllJobs();
    } catch (error) {
        console.error("Ошибка удаления:", error);
        alert("Ошибка при удалении вакансии");
    }
};

window.deleteUser = async function(userId) {
    if (!confirm("Удалить пользователя? Это действие необратимо.")) return;
    
    try {
        await deleteDoc(doc(db, "users", userId));
        
        const companyDoc = await getDoc(doc(db, "companies", userId));
        if (companyDoc.exists()) {
            await deleteDoc(doc(db, "companies", userId));
        }
        
        const jobsSnap = await getDocs(query(collection(db, "opportunity"), where("company_id", "==", userId)));
        const deletePromises = [];
        jobsSnap.forEach(doc => deletePromises.push(deleteDoc(doc.ref)));
        await Promise.all(deletePromises);
        
        const contactsSnap = await getDocs(query(collection(db, "contacts"), where("userId", "==", userId)));
        contactsSnap.forEach(doc => deletePromises.push(deleteDoc(doc.ref)));
        
        const contactsSnap2 = await getDocs(query(collection(db, "contacts"), where("contactId", "==", userId)));
        contactsSnap2.forEach(doc => deletePromises.push(deleteDoc(doc.ref)));
        
        await Promise.all(deletePromises);
        
        alert("Пользователь удален");
        
        loadAllUsers();
        loadAllCompanies();
        loadAllJobs();
        if (isAdmin) {
            loadAllCurators();
        }
        
    } catch (error) {
        console.error("Ошибка удаления:", error);
        alert("Ошибка при удалении пользователя");
    }
};

// ========== ФИЛЬТРАЦИЯ ==========

window.filterCompanies = function(filter) {
    currentCompanyFilter = filter;
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    renderCompanies();
};

window.searchCompanies = function() {
    renderCompanies();
};

// ========== ИНИЦИАЛИЗАЦИЯ ==========

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    currentUser = user;
    
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists() || userDoc.data().role !== "curator") {
        alert("Доступ запрещен. Только для кураторов.");
        window.location.href = "index.html";
        return;
    }
    
    const userData = userDoc.data();
    currentUserData = userData;
    isAdmin = userData.isAdmin === true;
    
    if (isAdmin) {
        const curatorsTabBtn = document.getElementById("curatorsTabBtn");
        if (curatorsTabBtn) {
            curatorsTabBtn.style.display = "flex";
        }
    }
    
    if (!isAdmin) {
        const allCurators = await getDocs(query(collection(db, "users"), where("role", "==", "curator")));
        if (allCurators.size === 1) {
            isAdmin = true;
            await updateDoc(doc(db, "users", user.uid), { isAdmin: true });
            console.log("Пользователь автоматически назначен администратором (единственный куратор)");
        }
    }
    
    await loadAllCompanies();
    loadAllUsers();
    loadAllJobs();
    if (isAdmin) {
        loadAllCurators();
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const modalButtons = document.querySelectorAll('#editJobModal button');
    modalButtons.forEach(btn => {
        if (btn.textContent.includes('Сохранить') || btn.innerHTML.includes('💾')) {
            btn.onclick = function(e) {
                e.preventDefault();
                saveEditedJob();
            };
        }
    });
    
    const editJobForm = document.getElementById('editJobForm');
    if (editJobForm) {
        editJobForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveEditedJob();
        });
    }
    
    const editUserForm = document.getElementById('editUserForm');
    if (editUserForm) {
        editUserForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveEditedUser();
        });
    }
    
    const editCompanyForm = document.getElementById('editCompanyForm');
    if (editCompanyForm) {
        editCompanyForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveEditedCompany();
        });
    }
    
    console.log("Обработчики редактирования добавлены");
});

window.goHome = () => window.location.href = "index.html";
window.logout = async () => {
    await auth.signOut();
    window.location.href = "index.html";
};

window.closeEditUserModal = function() {
    const modal = document.getElementById('editUserModal');
    if (modal) modal.style.display = 'none';
};

window.closeEditCompanyModal = function() {
    const modal = document.getElementById('editCompanyModal');
    if (modal) modal.style.display = 'none';
};

window.saveEditedUser = saveEditedUser;
window.saveEditedCompany = saveEditedCompany;

window.deleteAccount = async function() {
    const password = prompt("Для удаления аккаунта введите ваш пароль для подтверждения:");
    if (!password) return;
    
    if (!confirm("ВНИМАНИЕ! Удаление аккаунта куратора приведет к безвозвратной потере данных. Вы уверены?")) {
        return;
    }
    
    if (!confirm("ПОСЛЕДНЕЕ ПРЕДУПРЕЖДЕНИЕ! Продолжить?")) {
        return;
    }
    
    try {
        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);
        
        const curatorsSnap = await getDocs(
            query(collection(db, "users"), where("role", "==", "curator"))
        );
        
        if (curatorsSnap.size === 1) {
            if (!confirm("ВНИМАНИЕ! Вы последний куратор в системе. После удаления некому будет модерировать контент. Все равно удалить?")) {
                return;
            }
        }
        
        await deleteDoc(doc(db, "users", currentUser.uid));
        
        await deleteUser(currentUser);
        
        localStorage.clear();
        
        alert("Аккаунт успешно удален");
        window.location.href = "index.html";
        
    } catch (error) {
        console.error("Ошибка:", error);
        if (error.code === 'auth/wrong-password') {
            alert("Неверный пароль");
        } else {
            alert("Ошибка: " + error.message);
        }
    }
};