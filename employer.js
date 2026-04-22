import { auth, db } from "./firebase.js";
import { 
    onAuthStateChanged,
    EmailAuthProvider,
    reauthenticateWithCredential,
    deleteUser
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

let currentUser = null;
let editingJobId = null;
let jobs = [];
let isVerified = false;
let currentSelectedType = "vacancy";
let allApplications = [];
let currentApplicationsFilter = "all";
let currentUserData = null;
let currentCompanyData = {};
let currentEditingItem = null;

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
        console.error("Ошибка форматирования даты:", e);
        return null;
    }
}

function parseDateToInput(dateValue) {
    if (!dateValue) return "";
    try {
        let date;
        if (typeof dateValue === "object" && dateValue !== null && "seconds" in dateValue) {
            date = new Date(dateValue.seconds * 1000);
        } else {
            date = new Date(dateValue);
        }
        return !isNaN(date.getTime()) ? date.toISOString().split("T")[0] : "";
    } catch (e) {
        return "";
    }
}

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getYouTubeEmbedUrl(url) {
    if (!url) return "";
    
    let match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
    if (match) {
        return `https://www.youtube.com/embed/${match[1]}`;
    }
    
    match = url.match(/vk\.com\/video(-?\d+)_(\d+)/);
    if (match) {
        return `https://vk.com/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2`;
    }
    
    return url;
}

async function checkVerification() {
    if (!currentUser) return false;
    
    try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            isVerified = userData.company_verified === true;
            currentUserData = userData;
            return isVerified;
        }
        return false;
    } catch (error) {
        console.error("Ошибка проверки верификации:", error);
        return false;
    }
}

function getCurrentDateTime() {
    return new Date();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
  
  await checkVerification();
  
  await loadCompany();
  await loadJobs();
  await loadApplications();
  
  if (typeof renderTabContent === 'function') {
    renderTabContent('company');
  }
});

async function loadCompany() {
  const ref = doc(db, "companies", currentUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    currentCompanyData = snap.data();
  } else {
    currentCompanyData = {};
  }
}

async function saveCompanyData(companyData) {
  await updateDoc(doc(db, "companies", currentUser.uid), companyData);
  currentCompanyData = { ...currentCompanyData, ...companyData };
}

window.saveCompany = async function () {
  const companyName = document.getElementById("companyName")?.value.trim();
  if (!companyName) {
    alert("Пожалуйста, укажите название компании");
    return;
  }
  
  const currentData = currentCompanyData || {};
  
  const companyData = {
    name: companyName,
    field: document.getElementById("companyField")?.value || "",
    description: document.getElementById("companyDesc")?.value || "",
    site: document.getElementById("companySite")?.value || "",
    social: document.getElementById("companySocial")?.value || "",
    updated_at: new Date()
  };
  
  if (currentData.logo_url) {
    companyData.logo_url = currentData.logo_url;
  }
  if (currentData.video_url) {
    companyData.video_url = currentData.video_url;
  }
  if (currentData.employee_count) {
    companyData.employee_count = currentData.employee_count;
  }
  if (currentData.founded_year) {
    companyData.founded_year = currentData.founded_year;
  }
  if (currentData.office_locations) {
    companyData.office_locations = currentData.office_locations;
  }
  if (currentData.created_at) {
    companyData.created_at = currentData.created_at;
  }
  if (currentData.owner_id) {
    companyData.owner_id = currentData.owner_id;
  }
  if (currentData.owner_email) {
    companyData.owner_email = currentData.owner_email;
  }
  if (currentData.owner_name) {
    companyData.owner_name = currentData.owner_name;
  }
  
  await saveCompanyData(companyData);
  
  alert("Информация о компании сохранена");
  
  await checkVerification();
  if (typeof renderTabContent === 'function') {
    renderTabContent('company');
  }
};

window.submitVerificationRequest = async function(event) {
    if (event) event.preventDefault();
    
    if (isVerified) {
        alert("Ваша компания уже верифицирована");
        closeVerificationModal();
        return;
    }
    
    if (currentUserData?.verification_requested === true) {
        alert("Заявка на верификацию уже отправлена. Ожидайте рассмотрения куратором.");
        closeVerificationModal();
        return;
    }
    
    const companyName = currentCompanyData?.name;
    if (!companyName || companyName.trim() === "") {
        alert("Пожалуйста, сначала заполните информацию о компании (название, сфера деятельности, описание)");
        closeVerificationModal();
        return;
    }
    
    const corpEmail = document.getElementById("corpEmail")?.value.trim();
    
    if (!corpEmail) {
        alert("Пожалуйста, укажите корпоративную почту");
        return;
    }
    
    const emailRegex = /^[^\s@]+@([^\s@]+)$/;
    const match = corpEmail.match(emailRegex);
    if (!match) {
        alert("Введите корректный email адрес");
        return;
    }
    
    const emailDomain = match[1];
    const companySite = currentCompanyData?.site;
    
    if (companySite) {
        try {
            let siteDomain = companySite.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
            
            if (!emailDomain.toLowerCase().includes(siteDomain.toLowerCase()) && 
                !siteDomain.toLowerCase().includes(emailDomain.toLowerCase())) {
                if (!confirm(`Внимание! Домен корпоративной почты (${emailDomain}) не совпадает с доменом сайта компании (${siteDomain}). Продолжить отправку заявки?`)) {
                    return;
                }
            }
        } catch(e) {
            console.log("Ошибка проверки домена:", e);
        }
    }
    
    try {
        const submitBtn = event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = "Отправка...";
        submitBtn.disabled = true;
        
        await updateDoc(doc(db, "users", currentUser.uid), {
            verification_requested: true,
            verification_requested_at: new Date(),
            verification_data: {
                corp_email: corpEmail,
                email_domain: emailDomain,
                company_name: currentCompanyData.name,
                company_field: currentCompanyData.field,
                company_site: currentCompanyData.site,
                requested_by: currentUser.uid,
                requested_at: new Date()
            }
        });
        
        currentUserData.verification_requested = true;
        currentUserData.verification_data = {
            corp_email: corpEmail,
            email_domain: emailDomain
        };
        
        alert("Заявка на верификацию успешно отправлена! Куратор проверит корпоративную почту и подтвердит верификацию.");
        
        closeVerificationModal();
        
        if (typeof renderTabContent === 'function') {
            renderTabContent('company');
        }
        
    } catch (error) {
        console.error("Ошибка отправки заявки:", error);
        alert("Ошибка при отправке заявки: " + error.message);
    } finally {
        const btn = event.target.querySelector('button[type="submit"]');
        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
};

window.requestVerification = async function() {
    if (isVerified) {
        alert("Ваша компания уже верифицирована");
        return;
    }
    
    if (currentUserData?.verification_requested === true) {
        alert("Заявка на верификацию уже отправлена. Ожидайте рассмотрения куратором.");
        return;
    }
    
    const companyName = currentCompanyData?.name;
    if (!companyName || companyName.trim() === "") {
        alert("Пожалуйста, сначала заполните информацию о компании (название, сфера деятельности, описание)");
        return;
    }
    
    if (typeof openVerificationModal === 'function') {
        openVerificationModal();
    } else {
        alert("Ошибка: не удалось открыть форму верификации");
    }
};

async function geocodeAddress(city, street, house) {
  if (!city) return null;
  
  let searchQuery = "";
  if (street && house) {
    searchQuery = `${city}, ${street} ${house}`;
  } else if (street) {
    searchQuery = `${city}, ${street}`;
  } else {
    searchQuery = city;
  }
  
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&addressdetails=1`);
    const data = await res.json();

    if (data.length > 0) {
      const location = data[0];
      const addressDetails = location.address || {};
      
      let formattedAddr = "";
      if (addressDetails.city || addressDetails.town || addressDetails.village) {
        const cityName = addressDetails.city || addressDetails.town || addressDetails.village;
        formattedAddr += cityName;
      } else {
        formattedAddr += city;
      }
      
      if (addressDetails.road) {
        formattedAddr += formattedAddr ? `, ${addressDetails.road}` : addressDetails.road;
      } else if (street) {
        formattedAddr += formattedAddr ? `, ${street}` : street;
      }
      
      if (addressDetails.house_number) {
        formattedAddr += `, ${addressDetails.house_number}`;
      } else if (house) {
        formattedAddr += formattedAddr ? `, ${house}` : house;
      }
      
      if (!formattedAddr) {
        formattedAddr = city;
        if (street) formattedAddr += `, ${street}`;
        if (house) formattedAddr += `, ${house}`;
      }
      
      return {
        latitude: parseFloat(location.lat),
        longitude: parseFloat(location.lon),
        full_address: location.display_name,
        formatted_address: formattedAddr
      };
    }
  } catch (e) {
    console.log("Geocoding error", e);
  }
  
  return null;
}

window.createOrUpdateItem = async function () {
  if (!isVerified) {
    alert("Ваша компания не верифицирована. Дождитесь подтверждения от куратора.");
    return;
  }
  
  const type = currentSelectedType;
  let city = document.getElementById("city")?.value;
  const street = document.getElementById("street")?.value;
  const house = document.getElementById("house")?.value;
  const postcode = document.getElementById("postcode")?.value;

  const title = document.getElementById("title")?.value.trim();
  if (!title) {
    alert("Пожалуйста, укажите название");
    return;
  }

  if (city && city.trim()) {
    city = city.trim().charAt(0).toUpperCase() + city.trim().slice(1).toLowerCase();
  }

  let mapPoint = null;
  let fullAddress = "";
  let formattedAddress = "";
  
  // Загружаем старую вакансию если редактируем
  let oldJobData = null;
  if (editingJobId) {
    try {
      const oldJobDoc = await getDoc(doc(db, "opportunity", editingJobId));
      if (oldJobDoc.exists()) {
        oldJobData = oldJobDoc.data();
        console.log("Загружена старая вакансия для редактирования:", oldJobData.title);
      }
    } catch (e) {
      console.error("Ошибка загрузки старой вакансии:", e);
    }
  }
  
  if (city) {
    const addressChanged = editingJobId && oldJobData && (
        city !== oldJobData.city ||
        street !== oldJobData.street ||
        house !== oldJobData.house
    );
    
    if (editingJobId && !addressChanged && oldJobData?.map && oldJobData.map.latitude && oldJobData.map.longitude) {
        console.log("Адрес не изменился, используем старые координаты");
        mapPoint = oldJobData.map;
        fullAddress = oldJobData.full_address || "";
        formattedAddress = oldJobData.formatted_address || "";
    } else {
        console.log("Выполняем геокодирование...");
        const geoResult = await geocodeAddress(city, street, house);
        if (geoResult) {
            mapPoint = {
                latitude: geoResult.latitude,
                longitude: geoResult.longitude
            };
            fullAddress = geoResult.full_address;
            formattedAddress = geoResult.formatted_address;
        } else {
            formattedAddress = city;
            if (street) formattedAddress += `, ${street}`;
            if (house) formattedAddress += `, ${house}`;
        }
    }
  }

  const workHours = document.getElementById("workHours")?.value;
  const jobLevel = document.getElementById("jobLevel")?.value;

  let moderationStatus = "pending";
  if (editingJobId && oldJobData) {
    if (oldJobData.moderation_status === "approved") {
      moderationStatus = "approved";
      console.log("Сохраняем статус approved");
    } else {
      moderationStatus = "pending";
      console.log("Отправляем на повторную модерацию");
    }
  } else {
    moderationStatus = "pending";
    console.log("Новая вакансия, отправляем на модерацию");
  }

  const itemData = {
    title: title,
    type: type,
    city: city,
    street: street,
    house: house,
    postcode: postcode,
    full_address: fullAddress,
    formatted_address: formattedAddress,
    format: document.getElementById("format")?.value,
    status: document.getElementById("status")?.value,
    tags: document.getElementById("tags")?.value.split(",").map(t => t.trim()).filter(t => t),
    description: document.getElementById("description")?.value,
    company_id: currentUser.uid,
    map: mapPoint,
    created_at: editingJobId && oldJobData?.created_at ? oldJobData.created_at : getCurrentDateTime(),
    updated_at: new Date(),
    work_hours: workHours ? parseInt(workHours) : null,
    level: jobLevel || null,
    moderation_status: moderationStatus
  };
  
  if (type !== "event") {
    itemData.salary = Number(document.getElementById("salary")?.value) || 0;
    const deadlineDate = document.getElementById("deadlineDate")?.value;
    itemData.end_date = deadlineDate ? new Date(deadlineDate) : null;
  } else {
    itemData.salary = null;
    itemData.end_date = null;
  }
  
  if (type === "internship") {
    itemData.duration = document.getElementById("duration")?.value;
    itemData.mentor = document.getElementById("mentor")?.value;
    itemData.requirements = document.getElementById("requirements")?.value;
  } else {
    itemData.duration = null;
    itemData.mentor = null;
    itemData.requirements = null;
  }
  
  if (type === "event") {
    const startDate = document.getElementById("startDate")?.value;
    const endDate = document.getElementById("endDate")?.value;
    const startTime = document.getElementById("startTime")?.value;
    const endTime = document.getElementById("endTime")?.value;
    itemData.start_date = startDate ? new Date(startDate) : null;
    itemData.end_date = endDate ? new Date(endDate) : null;
    itemData.start_time = startTime;
    itemData.end_time = endTime;
    itemData.speaker = document.getElementById("speaker")?.value;
  } else {
    itemData.start_date = null;
    itemData.start_time = null;
    itemData.end_time = null;
    itemData.speaker = null;
  }

  try {
    if (editingJobId) {
      await updateDoc(doc(db, "opportunity", editingJobId), itemData);
      alert("Публикация обновлена");
      editingJobId = null;
      currentEditingItem = null;
    } else {
      await addDoc(collection(db, "opportunity"), itemData);
      alert("Публикация создана");
    }

    clearForm();
    await loadJobs();
    if (typeof renderTabContent === 'function') {
      renderTabContent('jobs');
    }
  } catch (error) {
    console.error("Ошибка сохранения:", error);
    alert("Ошибка при сохранении: " + error.message);
  }
};

async function loadJobs() {
  const q = query(collection(db, "opportunity"), where("company_id", "==", currentUser.uid));
  const snap = await getDocs(q);

  jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function getFilteredJobs() {
  const typeFilter = document.getElementById("typeFilter")?.value || "all";
  const statusFilter = document.getElementById("statusFilter")?.value || "all";
  const search = document.getElementById("jobSearch")?.value.toLowerCase() || "";

  let filtered = jobs.filter(job => {
    let ok = true;

    if (typeFilter !== "all") {
      ok = job.type === typeFilter;
    }
    
    if (statusFilter !== "all" && ok) {
      ok = job.status === statusFilter;
    }
    
    if (search && ok) {
      ok = job.title?.toLowerCase().includes(search);
    }

    return ok;
  });
  
  filtered.sort((a, b) => {
    let dateA = 0, dateB = 0;
    
    if (a.created_at) {
      if (typeof a.created_at === 'object' && a.created_at.seconds) {
        dateA = a.created_at.seconds * 1000;
      } else {
        dateA = new Date(a.created_at).getTime();
      }
    }
    
    if (b.created_at) {
      if (typeof b.created_at === 'object' && b.created_at.seconds) {
        dateB = b.created_at.seconds * 1000;
      } else {
        dateB = new Date(b.created_at).getTime();
      }
    }
    
    return dateB - dateA;
  });
  
  return filtered;
}

function renderJobs() {
  const container = document.getElementById("jobsListContainer");
  if (!container) return;
  
  const filtered = getFilteredJobs();

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">У вас пока нет публикаций. Создайте первую в разделе "Создать публикацию"</div>';
    return;
  }

  container.innerHTML = "";

  filtered.forEach(job => {
    const formattedDate = formatDate(job.created_at);
    const dateText = formattedDate ? `<span>Дата: ${formattedDate}</span>` : "";
    
    let addressText = job.formatted_address || job.city || "—";
    if (job.street && !job.formatted_address) addressText += `, ${job.street}`;
    if (job.house && !job.formatted_address) addressText += `, ${job.house}`;
    
    let typeText = "";
    if (job.type === "internship") typeText = "Стажировка";
    else if (job.type === "event") typeText = "Мероприятие";
    else typeText = "Вакансия";
    
    let salaryText = "";
    if (job.type !== "event" && job.salary) {
      salaryText = `<span>Зарплата: ${job.salary.toLocaleString()} ₽</span>`;
    }
    
    let statusClass = "";
    if (job.status === "active") statusClass = "";
    else if (job.status === "planned") statusClass = "planned";
    else if (job.status === "closed") statusClass = "closed";
    
    let statusText = "";
    if (job.status === "active") statusText = "Активное";
    else if (job.status === "planned") statusText = "Запланированное";
    else if (job.status === "closed") statusText = "Закрытое";

    let rejectionReasonHtml = "";
    if (job.moderation_status === "rejected" && job.moderation_rejection_reason) {
        rejectionReasonHtml = `
            <div style="background: #f8d7da; padding: 8px; border-radius: 8px; margin-top: 10px; font-size: 12px; color: #721c24;">
                <strong>Вакансия отклонена куратором</strong><br>
                Причина: ${escapeHtml(job.moderation_rejection_reason)}
            </div>
        `;
    }
    
    let detailsHtml = "";
    const hoursText = job.work_hours ? `${job.work_hours} ч/день` : "";
    const levelText = job.level ? `Уровень: ${job.level}` : "";
    if (hoursText || levelText) {
        detailsHtml = `
            <div style="margin-top: 8px; display: flex; gap: 15px; font-size: 12px; color: #666;">
                ${hoursText ? `<span>⏱️ ${hoursText}</span>` : ""}
                ${levelText ? `<span>📊 ${levelText}</span>` : ""}
            </div>
        `;
    }
    
    let internshipDetailsHtml = "";
    if (job.type === "internship") {
        const durationText = job.duration ? `Длительность: ${job.duration}` : "";
        const mentorText = job.mentor ? `Наставник: ${job.mentor}` : "";
        if (durationText || mentorText) {
            internshipDetailsHtml = `
                <div style="margin-top: 8px; display: flex; gap: 15px; font-size: 12px; color: #666;">
                    ${durationText ? `<span>📅 ${durationText}</span>` : ""}
                    ${mentorText ? `<span>👨‍🏫 ${mentorText}</span>` : ""}
                </div>
            `;
        }
    }

    const div = document.createElement("div");
    div.className = `job-card ${statusClass}`;
    
    div.innerHTML = `
      <h3 class="job-title">${escapeHtml(job.title)} <span style="font-size: 12px; color: #666;">(${typeText})</span></h3>
      <div class="job-meta">
        ${salaryText}
        <span>Адрес: ${escapeHtml(addressText)}</span>
        <span>Формат: ${job.format || "—"}</span>
        <span>Статус: ${statusText}</span>
        ${dateText}
      </div>
      ${detailsHtml}
      ${internshipDetailsHtml}
      <p style="font-size: 13px; color: #555; margin: 10px 0;">${job.description ? escapeHtml(job.description.substring(0, 100)) + (job.description.length > 100 ? "..." : "") : "Описание отсутствует"}</p>
      ${rejectionReasonHtml}
      <div class="job-actions">
        <button onclick="editJob('${job.id}')">Редактировать</button>
        <button onclick="deleteJob('${job.id}')" style="background: #dc3545;">Удалить</button>
      </div>
    `;

    container.appendChild(div);
  });
}

window.editJob = function (id) {
  if (!isVerified) {
    alert("Редактирование доступно только верифицированным компаниям.");
    return;
  }
  
  const job = jobs.find(j => j.id === id);
  if (!job) return;
  
  currentEditingItem = job;

  if (typeof window.switchToCreateTab === 'function') {
    window.switchToCreateTab();
  } else if (typeof window.switchTab === 'function') {
    window.switchTab('create');
  }
  
  setTimeout(() => {
    const titleEl = document.getElementById("title");
    if (titleEl) titleEl.value = job.title || "";
    
    const salaryEl = document.getElementById("salary");
    if (salaryEl) {
      if (job.type !== "event") {
        salaryEl.value = job.salary || "";
        salaryEl.style.display = "block";
      } else {
        salaryEl.style.display = "none";
      }
    }
    
    const cityEl = document.getElementById("city");
    if (cityEl) cityEl.value = job.city || "";
    
    const streetEl = document.getElementById("street");
    if (streetEl) streetEl.value = job.street || "";
    
    const houseEl = document.getElementById("house");
    if (houseEl) houseEl.value = job.house || "";
    
    const postcodeEl = document.getElementById("postcode");
    if (postcodeEl) postcodeEl.value = job.postcode || "";
    
    const formatEl = document.getElementById("format");
    if (formatEl) formatEl.value = job.format || "";
    
    const statusEl = document.getElementById("status");
    if (statusEl) statusEl.value = job.status || "active";

    const deadlineDateEl = document.getElementById("deadlineDate");
    if (deadlineDateEl) {
      deadlineDateEl.value = job.type !== "event" ? parseDateToInput(job.end_date) : "";
    }
    
    const tagsEl = document.getElementById("tags");
    if (tagsEl) tagsEl.value = (job.tags || []).join(", ");
    
    const descEl = document.getElementById("description");
    if (descEl) descEl.value = job.description || "";
    
    const workHoursEl = document.getElementById("workHours");
    if (workHoursEl) workHoursEl.value = job.work_hours || "";
    
    const jobLevelEl = document.getElementById("jobLevel");
    if (jobLevelEl) jobLevelEl.value = job.level || "";
    
    if (job.type === "internship") {
      const durationEl = document.getElementById("duration");
      if (durationEl) durationEl.value = job.duration || "";
      
      const mentorEl = document.getElementById("mentor");
      if (mentorEl) mentorEl.value = job.mentor || "";
      
      const requirementsEl = document.getElementById("requirements");
      if (requirementsEl) requirementsEl.value = job.requirements || "";
    } else if (job.type === "event") {
      const startDateEl = document.getElementById("startDate");
      if (startDateEl) startDateEl.value = parseDateToInput(job.start_date);
      
      const endDateEl = document.getElementById("endDate");
      if (endDateEl) endDateEl.value = parseDateToInput(job.end_date);
      
      const startTimeEl = document.getElementById("startTime");
      if (startTimeEl) startTimeEl.value = job.start_time || "";
      
      const endTimeEl = document.getElementById("endTime");
      if (endTimeEl) endTimeEl.value = job.end_time || "";
      
      const speakerEl = document.getElementById("speaker");
      if (speakerEl) speakerEl.value = job.speaker || "";
    }
    
    if (typeof window.selectType === 'function') {
      window.selectType(job.type || "vacancy");
    }
    
    editingJobId = id;
    
    const createForm = document.getElementById("createForm");
    if (createForm) createForm.scrollIntoView({ behavior: "smooth" });
  }, 100);
};

window.deleteJob = async function (id) {
  if (!confirm("Удалить публикацию? Это действие нельзя отменить.")) return;
  
  try {
    await deleteDoc(doc(db, "opportunity", id));
    alert("Публикация удалена");
    await loadJobs();
    if (typeof renderTabContent === 'function') {
      renderTabContent('jobs');
    }
    await loadApplications();
  } catch (error) {
    console.error("Ошибка удаления:", error);
    alert("Ошибка при удалении: " + error.message);
  }
};

function clearForm() {
  editingJobId = null;
  currentEditingItem = null;
  
  const fields = ["title", "salary", "city", "street", "house", "postcode", "tags", "description", 
                   "duration", "mentor", "requirements", "deadlineDate", "startDate", "endDate", "startTime", "endTime", "speaker", "workHours"];
  fields.forEach(field => {
    const el = document.getElementById(field);
    if (el) el.value = "";
  });
  
  const levelSelect = document.getElementById("jobLevel");
  if (levelSelect) levelSelect.value = "";
  
  const formatSelect = document.getElementById("format");
  if (formatSelect) formatSelect.value = "Удалённая";
  
  const statusSelect = document.getElementById("status");
  if (statusSelect) statusSelect.value = "active";
  
  const internshipFields = document.getElementById("internshipFields");
  const eventFields = document.getElementById("eventFields");
  const vacancyFields = document.getElementById("vacancyFields");
  const salaryField = document.getElementById("salary");
  
  if (internshipFields) internshipFields.classList.remove("show");
  if (eventFields) eventFields.classList.remove("show");
  if (vacancyFields) vacancyFields.classList.remove("show");
  if (salaryField) salaryField.style.display = "block";
  
  if (typeof selectType === 'function') {
    selectType("vacancy");
  }
}

async function loadApplications() {
  const jobsSnap = await getDocs(query(collection(db, "opportunity"), where("company_id", "==", currentUser.uid)));
  const jobIds = jobsSnap.docs.map(d => d.id);

  const appsSnap = await getDocs(collection(db, "applications"));
  allApplications = [];

  for (const appDoc of appsSnap.docs) {
    const app = appDoc.data();

    if (!jobIds.includes(app.opportunity_id)) continue;
    
    const job = jobs.find(j => j.id === app.opportunity_id);
    const jobTitle = job ? job.title : app.opportunity_title || "Публикация";
    
    allApplications.push({
      id: appDoc.id,
      ...app,
      jobTitle: jobTitle
    });
  }
}

function getFilteredApplications() {
  const filter = document.getElementById("applicationsFilter")?.value || "all";
  
  if (filter === "all") return allApplications;
  return allApplications.filter(app => app.status === filter);
}

function renderApplications() {
  const container = document.getElementById("applicationsListContainer");
  if (!container) return;
  
  const filtered = getFilteredApplications();

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет откликов</div>';
    return;
  }

  container.innerHTML = "";

  filtered.forEach(app => {
    const studentData = app.student_data || {};
    
    let statusText = "";
    let statusClass = "";
    if (app.status === "pending") { statusText = "На рассмотрении"; statusClass = "status-pending"; }
    else if (app.status === "accepted") { statusText = "Принят"; statusClass = "status-accepted"; }
    else if (app.status === "rejected") { statusText = "Отклонен"; statusClass = "status-rejected"; }
    else if (app.status === "reserved") { statusText = "В резерве"; statusClass = "status-reserved"; }

    const div = document.createElement("div");
    div.className = "application-card";

    div.innerHTML = `
      <div class="application-header">
        <span class="application-job">${escapeHtml(app.jobTitle)}</span>
        <span class="status-badge ${statusClass}">${statusText}</span>
      </div>
      <div class="student-info">
        <strong>${escapeHtml(studentData.lastName || "")} ${escapeHtml(studentData.firstName || "")}</strong><br>
        Email: ${escapeHtml(studentData.email || "—")}<br>
        Телефон: ${escapeHtml(studentData.phone || "—")}<br>
        Учебное заведение: ${escapeHtml(studentData.university || "—")}, ${escapeHtml(studentData.course || "—")} курс<br>
        Специальность: ${escapeHtml(studentData.speciality || "—")}
      </div>
      <p style="font-size: 12px; color: #666;">Дата отклика: ${app.applied_at ? new Date(app.applied_at.seconds * 1000).toLocaleDateString('ru-RU') : "—"}</p>
      <div class="application-actions">
        <button onclick="setStatus('${app.id}', 'accepted')" style="background: #28a745;">Принять</button>
        <button onclick="setStatus('${app.id}', 'rejected')" style="background: #dc3545;">Отклонить</button>
        <button onclick="setStatus('${app.id}', 'reserved')" style="background: #ffc107; color: #856404;">В резерв</button>
      </div>
    `;

    container.appendChild(div);
  });
}

window.setStatus = async function (id, status) {
  try {
    await updateDoc(doc(db, "applications", id), { status });
    alert("Статус обновлен");
    await loadApplications();
    if (typeof renderTabContent === 'function') {
      renderTabContent('applications');
    }
  } catch (error) {
    console.error("Ошибка обновления статуса:", error);
    alert("Ошибка при обновлении статуса: " + error.message);
  }
};

window.applyFilters = function() {
  renderJobs();
};

window.filterApplications = function() {
  renderApplications();
};

window.renderTabContent = function(tabName) {
  const mainContent = document.getElementById("mainContent");
  if (!mainContent) return;
  
  switch(tabName) {
    case 'company':
      renderCompanyTab();
      break;
    case 'create':
      renderCreateTab();
      break;
    case 'jobs':
      renderJobsTab();
      break;
    case 'applications':
      renderApplicationsTab();
      break;
  }
};

function renderCompanyTab() {
  const mainContent = document.getElementById("mainContent");
  const company = currentCompanyData || {};
  
  let statusMessage = "";
  let statusClass = "";
  let showRequestButton = false;
  
  if (isVerified) {
    statusMessage = "Ваша компания верифицирована. Вы можете создавать публикации.";
    statusClass = "verified";
    showRequestButton = false;
  } else if (currentUserData?.verification_requested === true) {
    statusMessage = "Заявка на верификацию отправлена и ожидает рассмотрения куратором. Обычно это занимает 1-2 рабочих дня.";
    statusClass = "pending";
    showRequestButton = false;
  } else {
    statusMessage = "Ваша компания не верифицирована. Для создания публикаций необходимо пройти верификацию. Заполните информацию о компании и отправьте заявку.";
    statusClass = "pending";
    showRequestButton = true;
  }
  
  let logoHtml = '';
  if (company.logo_url && company.logo_url !== 'null' && company.logo_url !== 'undefined') {
    logoHtml = `
      <img id="companyLogo" src="${company.logo_url}" alt="Логотип компании" class="company-logo" style="object-fit: cover;">
    `;
  } else {
    logoHtml = `
      <div id="companyLogoPlaceholder" class="company-logo-placeholder">
        <span>📷</span>
        <p>Нет логотипа</p>
      </div>
    `;
  }
  
  mainContent.innerHTML = `
    <div class="verification-banner ${statusClass}">
      <span>${statusMessage}</span>
      ${showRequestButton ? 
        '<button class="request-verify-btn" onclick="requestVerification()">Отправить заявку на верификацию</button>' : ''}
    </div>
    
    <div class="company-stats-section">
      <h3>Статистика компании</h3>
      <div class="stats-cards">
        <div class="stat-card-employer">
          <div class="stat-icon">👥</div>
          <div class="stat-content">
            <div class="stat-number-employer" id="employeeCount">${company.employee_count || "—"}</div>
            <div class="stat-label-employer">Сотрудников</div>
          </div>
          <button class="edit-stat-btn" onclick="editEmployeeCount()">✏️</button>
        </div>
        <div class="stat-card-employer">
          <div class="stat-icon">🏢</div>
          <div class="stat-content">
            <div class="stat-number-employer" id="foundedYear">${company.founded_year || "—"}</div>
            <div class="stat-label-employer">Год основания</div>
          </div>
          <button class="edit-stat-btn" onclick="editFoundedYear()">✏️</button>
        </div>
        <div class="stat-card-employer">
          <div class="stat-icon">📍</div>
          <div class="stat-content">
            <div class="stat-number-employer" id="officeLocations">${company.office_locations || "—"}</div>
            <div class="stat-label-employer">Офисов</div>
          </div>
          <button class="edit-stat-btn" onclick="editOfficeLocations()">✏️</button>
        </div>
      </div>
    </div>
    
    <div class="tab-content">
      <h2>Информация о компании</h2>
      
      <div class="logo-section">
        <h3>Логотип компании</h3>
        <div class="logo-container" id="logoContainer">
          ${logoHtml}
          <div class="logo-upload">
            <input type="file" id="logoFile" accept="image/jpeg,image/png,image/jpg,image/webp" style="display: none">
            <button type="button" onclick="uploadLogo()" class="upload-logo-btn">Загрузить логотип</button>
            ${company.logo_url && company.logo_url !== 'null' && company.logo_url !== 'undefined' ? '<button type="button" onclick="removeLogo()" class="remove-logo-btn">Удалить</button>' : ''}
          </div>
          <small class="logo-hint">Рекомендуемый размер: 200x200px, форматы: JPG, PNG, WEBP (до 2 МБ)</small>
        </div>
      </div>
      
      <div class="video-section">
        <h3>Видео-презентация компании</h3>
        <div class="video-container">
          ${company.video_url ? 
            `<div class="video-wrapper">
              <iframe src="${getYouTubeEmbedUrl(company.video_url)}" frameborder="0" allowfullscreen></iframe>
              <button onclick="removeVideo()" class="remove-video-btn">Удалить видео</button>
            </div>` : 
            `<div class="video-placeholder">
              <span>🎬</span>
              <p>Добавьте видео-презентацию компании</p>
            </div>`
          }
          <div class="video-upload">
            <input type="text" id="videoUrl" placeholder="https://www.youtube.com/watch?v=... или https://youtu.be/..." class="video-url-input">
            <button onclick="addVideo()" class="add-video-btn">Добавить видео</button>
          </div>
          <small class="video-hint">Поддерживаются ссылки YouTube и VK Video</small>
        </div>
      </div>
      
      <div class="form-grid">
        <input id="companyName" placeholder="Название компании *" value="${escapeHtml(company.name || '')}">
        <input id="companyField" placeholder="Сфера деятельности *" value="${escapeHtml(company.field || '')}">
        <textarea id="companyDesc" class="form-full" placeholder="Краткое описание компании *" rows="3">${escapeHtml(company.description || '')}</textarea>
        <input id="companySite" placeholder="Сайт компании" value="${escapeHtml(company.site || '')}">
        <input id="companySocial" placeholder="Соцсети (VK, Telegram и др.)" value="${escapeHtml(company.social || '')}">
        <button class="form-full" onclick="saveCompany()">Сохранить компанию</button>
      </div>
      ${!isVerified && !currentUserData?.verification_requested ? 
        '<p style="font-size: 12px; color: #666; margin-top: 10px;">* После сохранения информации о компании вы сможете отправить заявку на верификацию</p>' : ''}
    </div>
  `;
}

function renderCreateTab() {
  const mainContent = document.getElementById("mainContent");
  
  mainContent.innerHTML = `
    <div class="tab-content">
      <h2>Создать / редактировать</h2>
      
      <div class="type-selector">
        <div class="type-option active" onclick="selectType('vacancy')">Вакансия</div>
        <div class="type-option" onclick="selectType('internship')">Стажировка</div>
        <div class="type-option" onclick="selectType('event')">Мероприятие</div>
      </div>
      
      <div id="createForm" class="form-grid">
        <input id="title" placeholder="Название">
        <input id="salary" placeholder="Зарплата / Стипендия (₽)">
        
        <div class="form-grid form-full address-block">
          <input id="city" placeholder="Город">
          <input id="street" placeholder="Улица">
          <input id="house" placeholder="Дом / номер">
          <input id="postcode" placeholder="Индекс (необязательно)">
        </div>
      
        <select id="format">
          <option value="Удалённая">Удалённая</option>
          <option value="Офис">Офис</option>
          <option value="Гибрид">Гибрид</option>
          <option value="Онлайн">Онлайн</option>
          <option value="Офлайн">Офлайн</option>
        </select>
      
        <select id="status">
          <option value="active">Активное</option>
          <option value="planned">Запланированное</option>
          <option value="closed">Закрытое</option>
        </select>

        <input id="deadlineDate" type="date" class="form-full" placeholder="Срок действия" />
        
        <div class="form-full details-row">
          <input id="workHours" type="number" placeholder="Занятость (часов в день)" step="1" min="1" max="24">
          <select id="jobLevel">
            <option value="">Уровень подготовки</option>
            <option value="Junior">Junior (начинающий)</option>
            <option value="Middle">Middle (средний)</option>
            <option value="Senior">Senior (продвинутый)</option>
          </select>
        </div>
        <small class="form-full" style="color: #666; font-size: 12px; margin-top: -5px;">Укажите желаемую занятость (часов в день) и уровень подготовки</small>
      
        <div id="vacancyFields" class="vacancy-fields">
        </div>
      
        <div id="internshipFields" class="internship-fields">
          <div class="form-grid form-full">
            <input id="duration" placeholder="Длительность (например: 3 месяца)">
            <input id="mentor" placeholder="Наставник">
          </div>
          <textarea id="requirements" class="form-full" placeholder="Требования к стажеру" rows="2"></textarea>
        </div>
      
        <div id="eventFields" class="event-fields">
          <div class="form-grid form-full">
            <input id="startDate" type="date" placeholder="Дата начала">
            <input id="endDate" type="date" placeholder="Дата окончания">
          </div>
          <div class="date-time-row form-full">
            <input id="startTime" type="time" placeholder="Время начала">
            <input id="endTime" type="time" placeholder="Время окончания">
          </div>
          <input id="speaker" class="form-full" placeholder="Спикер(ы)">
        </div>
      
        <input id="tags" class="form-full" placeholder="Теги (через запятую)">
        <textarea id="description" class="form-full" placeholder="Описание" rows="4"></textarea>
      
        <button class="form-full" onclick="createOrUpdateItem()">Сохранить</button>
      </div>
    </div>
  `;
  
  if (typeof selectType === 'function') {
    selectType(currentSelectedType);
  }
}

function renderJobsTab() {
  const mainContent = document.getElementById("mainContent");
  
  const totalJobs = jobs.length;
  const activeJobs = jobs.filter(j => j.status === "active").length;
  const plannedJobs = jobs.filter(j => j.status === "planned").length;
  const closedJobs = jobs.filter(j => j.status === "closed").length;
  
  mainContent.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">${totalJobs}</div>
        <div class="stat-label">Всего публикаций</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${activeJobs}</div>
        <div class="stat-label">Активные</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${plannedJobs}</div>
        <div class="stat-label">Запланированные</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${closedJobs}</div>
        <div class="stat-label">Закрытые</div>
      </div>
    </div>
    
    <div class="tab-content">
      <h2>Мои публикации</h2>
      
      <div class="filters-bar">
        <select id="typeFilter" onchange="applyFilters()">
          <option value="all">Все типы</option>
          <option value="vacancy">Вакансии</option>
          <option value="internship">Стажировки</option>
          <option value="event">Мероприятия</option>
        </select>
        <select id="statusFilter" onchange="applyFilters()">
          <option value="all">Все статусы</option>
          <option value="active">Активные</option>
          <option value="planned">Запланированные</option>
          <option value="closed">Закрытые</option>
        </select>
        <input id="jobSearch" placeholder="Поиск по названию..." oninput="applyFilters()">
      </div>
      
      <div id="jobsListContainer" class="jobs-list"></div>
    </div>
  `;
  
  renderJobs();
}

function renderApplicationsTab() {
  const mainContent = document.getElementById("mainContent");
  
  const pendingCount = allApplications.filter(a => a.status === "pending").length;
  const acceptedCount = allApplications.filter(a => a.status === "accepted").length;
  
  mainContent.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">${allApplications.length}</div>
        <div class="stat-label">Всего откликов</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${pendingCount}</div>
        <div class="stat-label">На рассмотрении</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${acceptedCount}</div>
        <div class="stat-label">Принято</div>
      </div>
    </div>
    
    <div class="tab-content">
      <h2>Отклики</h2>
      
      <div class="filters-bar">
        <select id="applicationsFilter" onchange="filterApplications()">
          <option value="all">Все отклики</option>
          <option value="pending">На рассмотрении</option>
          <option value="accepted">Принятые</option>
          <option value="rejected">Отклоненные</option>
          <option value="reserved">В резерве</option>
        </select>
      </div>
      
      <div id="applicationsListContainer" class="applications-list"></div>
    </div>
  `;
  
  renderApplications();
}

window.selectType = function(type) {
  currentSelectedType = type;
  
  const typeOptions = document.querySelectorAll('.type-option');
  typeOptions.forEach(opt => {
    opt.classList.remove('active');
  });
  
  const activeIndex = type === 'vacancy' ? 0 : type === 'internship' ? 1 : 2;
  if (typeOptions[activeIndex]) {
    typeOptions[activeIndex].classList.add('active');
  }
  
  const vacancyFields = document.getElementById('vacancyFields');
  const internshipFields = document.getElementById('internshipFields');
  const eventFields = document.getElementById('eventFields');
  const salaryField = document.getElementById('salary');
  const formatSelect = document.getElementById('format');
  const deadlineDateEl = document.getElementById('deadlineDate');
  const workHoursEl = document.getElementById('workHours');
  const jobLevelEl = document.getElementById('jobLevel');
  
  if (workHoursEl) workHoursEl.style.display = 'block';
  if (jobLevelEl) jobLevelEl.style.display = 'block';
  
  if (type === 'internship') {
    if (internshipFields) internshipFields.classList.add('show');
    if (vacancyFields) vacancyFields.classList.remove('show');
    if (eventFields) eventFields.classList.remove('show');
    if (salaryField) salaryField.style.display = 'block';
    if (deadlineDateEl) deadlineDateEl.style.display = 'block';
    if (formatSelect) formatSelect.innerHTML = '<option value="Удалённая">Удалённая</option><option value="Офис">Офис</option><option value="Гибрид">Гибрид</option>';
  } else if (type === 'event') {
    if (eventFields) eventFields.classList.add('show');
    if (internshipFields) internshipFields.classList.remove('show');
    if (vacancyFields) vacancyFields.classList.remove('show');
    if (salaryField) salaryField.style.display = 'none';
    if (deadlineDateEl) deadlineDateEl.style.display = 'none';
    if (formatSelect) formatSelect.innerHTML = '<option value="Онлайн">Онлайн</option><option value="Офлайн">Офлайн</option>';
  } else {
    if (vacancyFields) vacancyFields.classList.add('show');
    if (internshipFields) internshipFields.classList.remove('show');
    if (eventFields) eventFields.classList.remove('show');
    if (salaryField) salaryField.style.display = 'block';
    if (deadlineDateEl) deadlineDateEl.style.display = 'block';
    if (formatSelect) formatSelect.innerHTML = '<option value="Удалённая">Удалённая</option><option value="Офис">Офис</option><option value="Гибрид">Гибрид</option>';
  }
};

window.logout = async function () {
  await auth.signOut();
  window.location.href = "index.html";
};

window.goHome = function () {
  window.location.href = "index.html";
};

window.createOrUpdateItem = createOrUpdateItem;
window.saveCompany = saveCompany;
window.requestVerification = requestVerification;
window.submitVerificationRequest = submitVerificationRequest;
window.editJob = editJob;
window.deleteJob = deleteJob;
window.setStatus = setStatus;
window.applyFilters = applyFilters;
window.filterApplications = filterApplications;
window.selectType = selectType;
window.renderTabContent = renderTabContent;

window.editEmployeeCount = function() {
    const currentCount = currentCompanyData?.employee_count || "";
    const newCount = prompt("Укажите количество сотрудников в компании:", currentCount);
    if (newCount !== null && newCount !== "") {
        updateCompanyStat("employee_count", newCount);
    }
};

window.editFoundedYear = function() {
    const currentYear = currentCompanyData?.founded_year || "";
    const newYear = prompt("Укажите год основания компании (например, 2010):", currentYear);
    if (newYear !== null && newYear !== "") {
        if (/^\d{4}$/.test(newYear)) {
            updateCompanyStat("founded_year", newYear);
        } else {
            alert("Пожалуйста, введите корректный год (4 цифры)");
        }
    }
};

window.editOfficeLocations = function() {
    const currentLocations = currentCompanyData?.office_locations || "";
    const newLocations = prompt("Укажите количество офисов:", currentLocations);
    if (newLocations !== null && newLocations !== "") {
        updateCompanyStat("office_locations", newLocations);
    }
};

async function updateCompanyStat(field, value) {
    try {
        const updates = {};
        updates[field] = value;
        await updateDoc(doc(db, "companies", currentUser.uid), updates);
        currentCompanyData[field] = value;
        
        const element = document.getElementById(field === "employee_count" ? "employeeCount" : 
                                                   field === "founded_year" ? "foundedYear" : "officeLocations");
        if (element) element.textContent = value;
        
        alert("Статистика обновлена");
    } catch (error) {
        console.error("Ошибка обновления:", error);
        alert("Ошибка при обновлении");
    }
}

window.uploadLogo = function() {
    const fileInput = document.getElementById("logoFile");
    fileInput.click();
    
    fileInput.onchange = async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!file.type.match(/image\/(jpeg|jpg|png|webp)/)) {
            alert("Пожалуйста, загрузите изображение в формате JPG, PNG или WEBP");
            return;
        }
        
        if (file.size > 2 * 1024 * 1024) {
            alert("Размер файла не должен превышать 2 МБ");
            return;
        }
        
        try {
            const reader = new FileReader();
            reader.onload = async function(event) {
                const base64Image = event.target.result;
                
                await updateDoc(doc(db, "companies", currentUser.uid), {
                    logo_url: base64Image,
                    logo_updated_at: new Date()
                });
                
                currentCompanyData.logo_url = base64Image;
                
                const logoContainer = document.getElementById("logoContainer");
                if (logoContainer) {
                    const oldLogo = document.getElementById("companyLogo");
                    const oldPlaceholder = document.getElementById("companyLogoPlaceholder");
                    
                    if (oldLogo) oldLogo.remove();
                    if (oldPlaceholder) oldPlaceholder.remove();
                    
                    const newLogo = document.createElement("img");
                    newLogo.id = "companyLogo";
                    newLogo.src = base64Image;
                    newLogo.alt = "Логотип компании";
                    newLogo.className = "company-logo";
                    newLogo.style.objectFit = "cover";
                    
                    const logoUploadDiv = logoContainer.querySelector(".logo-upload");
                    logoContainer.insertBefore(newLogo, logoUploadDiv);
                    
                    const removeBtn = logoContainer.querySelector(".remove-logo-btn");
                    if (!removeBtn) {
                        const newRemoveBtn = document.createElement("button");
                        newRemoveBtn.className = "remove-logo-btn";
                        newRemoveBtn.textContent = "Удалить";
                        newRemoveBtn.onclick = () => removeLogo();
                        logoUploadDiv.insertBefore(newRemoveBtn, logoUploadDiv.firstChild);
                    }
                }
                
                alert("Логотип успешно загружен!");
            };
            reader.readAsDataURL(file);
            
        } catch (error) {
            console.error("Ошибка загрузки логотипа:", error);
            alert("Ошибка при загрузке логотипа: " + error.message);
        }
    };
};

window.removeLogo = async function() {
    if (!confirm("Удалить логотип компании?")) return;
    
    try {
        await updateDoc(doc(db, "companies", currentUser.uid), {
            logo_url: null
        });
        
        delete currentCompanyData.logo_url;
        
        const logoContainer = document.getElementById("logoContainer");
        if (logoContainer) {
            const oldLogo = document.getElementById("companyLogo");
            if (oldLogo) oldLogo.remove();
            
            const removeBtn = logoContainer.querySelector(".remove-logo-btn");
            if (removeBtn) removeBtn.remove();
            
            const placeholder = document.createElement("div");
            placeholder.id = "companyLogoPlaceholder";
            placeholder.className = "company-logo-placeholder";
            placeholder.innerHTML = '<span>📷</span><p>Нет логотипа</p>';
            
            const logoUploadDiv = logoContainer.querySelector(".logo-upload");
            logoContainer.insertBefore(placeholder, logoUploadDiv);
        }
        
        alert("Логотип удален");
    } catch (error) {
        console.error("Ошибка удаления логотипа:", error);
        alert("Ошибка при удалении логотипа");
    }
};

window.addVideo = async function() {
    const videoUrl = document.getElementById("videoUrl").value.trim();
    
    if (!videoUrl) {
        alert("Пожалуйста, введите ссылку на видео");
        return;
    }
    
    if (!videoUrl.includes("youtube.com") && !videoUrl.includes("youtu.be") && !videoUrl.includes("vk.com")) {
        alert("Поддерживаются ссылки YouTube и VK Video");
        return;
    }
    
    try {
        await updateDoc(doc(db, "companies", currentUser.uid), {
            video_url: videoUrl,
            video_updated_at: new Date()
        });
        
        currentCompanyData.video_url = videoUrl;
        
        const videoContainer = document.querySelector(".video-container");
        if (videoContainer) {
            const oldVideo = videoContainer.querySelector(".video-wrapper");
            const oldPlaceholder = videoContainer.querySelector(".video-placeholder");
            
            if (oldVideo) oldVideo.remove();
            if (oldPlaceholder) oldPlaceholder.remove();
            
            const embedUrl = getYouTubeEmbedUrl(videoUrl);
            const newVideo = document.createElement("div");
            newVideo.className = "video-wrapper";
            newVideo.innerHTML = `
                <iframe src="${embedUrl}" frameborder="0" allowfullscreen></iframe>
                <button onclick="removeVideo()" class="remove-video-btn">Удалить видео</button>
            `;
            
            const videoUploadDiv = videoContainer.querySelector(".video-upload");
            videoContainer.insertBefore(newVideo, videoUploadDiv);
        }
        
        document.getElementById("videoUrl").value = "";
        alert("Видео добавлено");
        
    } catch (error) {
        console.error("Ошибка добавления видео:", error);
        alert("Ошибка при добавлении видео");
    }
};

window.removeVideo = async function() {
    if (!confirm("Удалить видео-презентацию?")) return;
    
    try {
        await updateDoc(doc(db, "companies", currentUser.uid), {
            video_url: null
        });
        
        delete currentCompanyData.video_url;
        
        const videoContainer = document.querySelector(".video-container");
        if (videoContainer) {
            const oldVideo = videoContainer.querySelector(".video-wrapper");
            if (oldVideo) oldVideo.remove();
            
            const placeholder = document.createElement("div");
            placeholder.className = "video-placeholder";
            placeholder.innerHTML = '<span>🎬</span><p>Добавьте видео-презентацию компании</p>';
            
            const videoUploadDiv = videoContainer.querySelector(".video-upload");
            videoContainer.insertBefore(placeholder, videoUploadDiv);
        }
        
        alert("Видео удалено");
    } catch (error) {
        console.error("Ошибка удаления видео:", error);
        alert("Ошибка при удалении видео");
    }
};

document.addEventListener('DOMContentLoaded', function() {
    const verificationForm = document.getElementById('verificationForm');
    if (verificationForm) {
        verificationForm.addEventListener('submit', window.submitVerificationRequest);
    }
});

window.deleteAccount = async function() {
    const password = prompt("Для удаления аккаунта введите ваш пароль для подтверждения:");
    if (!password) return;
    
    if (!confirm("ВНИМАНИЕ! Удаление аккаунта приведет к безвозвратной потере:\n- Информации о компании\n- Всех опубликованных вакансий\n- Всех откликов на вакансии\n\nВы уверены?")) {
        return;
    }
    
    if (!confirm("ПОСЛЕДНЕЕ ПРЕДУПРЕЖДЕНИЕ! Продолжить?")) {
        return;
    }
    
    try {
        showToast("Удаление аккаунта...", "info");
        
        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);
        
        const userId = currentUser.uid;
        const deletePromises = [];
        
        const jobsSnap = await getDocs(
            query(collection(db, "opportunity"), where("company_id", "==", userId))
        );
        jobsSnap.forEach(doc => deletePromises.push(deleteDoc(doc.ref)));
        
        const appsSnap = await getDocs(collection(db, "applications"));
        for (const appDoc of appsSnap.docs) {
            const app = appDoc.data();
            const jobDoc = await getDoc(doc(db, "opportunity", app.opportunity_id));
            if (jobDoc.exists() && jobDoc.data().company_id === userId) {
                deletePromises.push(deleteDoc(appDoc.ref));
            }
        }
        
        deletePromises.push(deleteDoc(doc(db, "companies", userId)));
        
        deletePromises.push(deleteDoc(doc(db, "users", userId)));
        
        await Promise.all(deletePromises);
        
        await deleteUser(currentUser);
        
        localStorage.clear();
        
        showToast("Аккаунт успешно удален", "success");
        
        setTimeout(() => {
            window.location.href = "index.html";
        }, 2000);
        
    } catch (error) {
        console.error("Ошибка удаления:", error);
        if (error.code === 'auth/wrong-password') {
            showToast("Неверный пароль", "error");
        } else {
            showToast("Ошибка: " + error.message, "error");
        }
    }
};

function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.padding = "12px 20px";
    toast.style.borderRadius = "8px";
    toast.style.backgroundColor = type === "success" ? "#28a745" : type === "error" ? "#dc3545" : "#1f6aa5";
    toast.style.color = "white";
    toast.style.zIndex = "9999";
    toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}