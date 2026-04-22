import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  doc, 
  getDoc, 
  updateDoc, 
  addDoc, 
  deleteDoc,
  writeBatch,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

let currentUser = null;
let currentUserData = null;
let contacts = [];
let friendRequests = [];
let applicationsListener = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
  
  console.log("Пользователь авторизован:", currentUser.uid);
  
  await loadProfile();
  await loadPrivacySettings();
  await loadContacts();
  await loadFriendRequests();
  await loadSuggestedStudents();
  setupRealtimeApplications();
});

async function loadProfile() {
  const userDoc = await getDoc(doc(db, "users", currentUser.uid));
  currentUserData = userDoc.exists() ? userDoc.data() : {};
  
  document.getElementById("firstName").value = currentUserData.firstName || "";
  document.getElementById("lastName").value = currentUserData.lastName || "";
  document.getElementById("phone").value = currentUserData.phone || "";
  document.getElementById("university").value = currentUserData.university || "";
  document.getElementById("course").value = currentUserData.course || "";
  document.getElementById("speciality").value = currentUserData.speciality || "";
  document.getElementById("skills").value = (currentUserData.skills || []).join(", ");
  
  const resumePreview = document.getElementById("resumePreview");
  if (resumePreview) {
    if (currentUserData.resumeUrl) {
      resumePreview.style.display = "block";
      resumePreview.innerHTML = `<a href="${currentUserData.resumeUrl}" target="_blank" style="color: #1f6aa5;">Ссылка на резюме</a>`;
    } else if (currentUserData.resumeFileName) {
      resumePreview.style.display = "block";
      resumePreview.innerHTML = `<span style="color: #1f6aa5;">Файл: ${escapeHtml(currentUserData.resumeFileName)}</span>`;
    } else {
      resumePreview.style.display = "none";
      resumePreview.innerHTML = '';
    }
  }
  
  const portfolioPreview = document.getElementById("portfolioPreview");
  if (portfolioPreview) {
    if (currentUserData.portfolioUrl) {
      portfolioPreview.style.display = "block";
      portfolioPreview.innerHTML = `<a href="${currentUserData.portfolioUrl}" target="_blank" style="color: #1f6aa5;">Ссылка на портфолио</a>`;
    } else if (currentUserData.portfolioFileName) {
      portfolioPreview.style.display = "block";
      portfolioPreview.innerHTML = `<span style="color: #1f6aa5;">Файл: ${escapeHtml(currentUserData.portfolioFileName)}</span>`;
    } else {
      portfolioPreview.style.display = "none";
      portfolioPreview.innerHTML = '';
    }
  }
}

async function loadPrivacySettings() {
  const visibility = currentUserData.profile_visible !== false;
  const appsVisibility = currentUserData.applications_visible !== false;
  
  document.getElementById("profileVisibility").checked = visibility;
  document.getElementById("applicationsVisibility").checked = appsVisibility;
}

window.togglePrivacy = async function() {
  const profileVisible = document.getElementById("profileVisibility").checked;
  const applicationsVisible = document.getElementById("applicationsVisibility").checked;
  
  await updateDoc(doc(db, "users", currentUser.uid), {
    profile_visible: profileVisible,
    applications_visible: applicationsVisible
  });
  
  showToast("Настройки приватности сохранены", "success");
};

window.saveProfile = async function() {
  const skillsText = document.getElementById("skills").value;
  const skills = skillsText.split(",").map(s => s.trim()).filter(s => s);
  
  const resumeUrl = document.getElementById("resumeUrl").value;
  const portfolioUrl = document.getElementById("portfolioUrl").value;
  
  const resumeFile = document.getElementById("resumeFile").files[0];
  const portfolioFile = document.getElementById("portfolioFile").files[0];
  
  let resumeFileName = currentUserData.resumeFileName || "";
  let portfolioFileName = currentUserData.portfolioFileName || "";
  let resumeDataUrl = currentUserData.resumeUrl || "";
  let portfolioDataUrl = currentUserData.portfolioUrl || "";
  
  if (resumeUrl) {
    resumeDataUrl = resumeUrl;
    resumeFileName = "";
  }
  
  if (resumeFile) {
    if (resumeFile.type !== "application/pdf") {
      showToast("Резюме должно быть в формате PDF", "error");
      return;
    }
    if (resumeFile.size > 5 * 1024 * 1024) {
      showToast("Размер файла не должен превышать 5 МБ", "error");
      return;
    }
    resumeFileName = resumeFile.name;
    resumeDataUrl = "";
  }
  
  if (portfolioUrl) {
    portfolioDataUrl = portfolioUrl;
    portfolioFileName = "";
  }
  
  if (portfolioFile) {
    if (portfolioFile.type !== "application/pdf") {
      showToast("Портфолио должно быть в формате PDF", "error");
      return;
    }
    if (portfolioFile.size > 5 * 1024 * 1024) {
      showToast("Размер файла не должен превышать 5 МБ", "error");
      return;
    }
    portfolioFileName = portfolioFile.name;
    portfolioDataUrl = "";
  }
  
  const profileData = {
    firstName: document.getElementById("firstName").value,
    lastName: document.getElementById("lastName").value,
    phone: document.getElementById("phone").value,
    university: document.getElementById("university").value,
    course: document.getElementById("course").value,
    speciality: document.getElementById("speciality").value,
    skills: skills,
    resumeUrl: resumeDataUrl,
    resumeFileName: resumeFileName,
    portfolioUrl: portfolioDataUrl,
    portfolioFileName: portfolioFileName,
    updated_at: new Date()
  };
  
  if (!profileData.firstName || !profileData.lastName) {
    showToast("Имя и фамилия обязательны для заполнения", "error");
    return;
  }
  
  await updateDoc(doc(db, "users", currentUser.uid), profileData);
  currentUserData = { ...currentUserData, ...profileData };
  
  const resumePreview = document.getElementById("resumePreview");
  if (resumePreview) {
    if (profileData.resumeUrl) {
      resumePreview.style.display = "block";
      resumePreview.innerHTML = `<a href="${profileData.resumeUrl}" target="_blank" style="color: #1f6aa5;">Ссылка на резюме</a>`;
    } else if (profileData.resumeFileName) {
      resumePreview.style.display = "block";
      resumePreview.innerHTML = `<span style="color: #1f6aa5;">Файл: ${escapeHtml(profileData.resumeFileName)}</span>`;
    } else {
      resumePreview.style.display = "none";
      resumePreview.innerHTML = '';
    }
  }
  
  const portfolioPreview = document.getElementById("portfolioPreview");
  if (portfolioPreview) {
    if (profileData.portfolioUrl) {
      portfolioPreview.style.display = "block";
      portfolioPreview.innerHTML = `<a href="${profileData.portfolioUrl}" target="_blank" style="color: #1f6aa5;">Ссылка на портфолио</a>`;
    } else if (profileData.portfolioFileName) {
      portfolioPreview.style.display = "block";
      portfolioPreview.innerHTML = `<span style="color: #1f6aa5;">Файл: ${escapeHtml(profileData.portfolioFileName)}</span>`;
    } else {
      portfolioPreview.style.display = "none";
      portfolioPreview.innerHTML = '';
    }
  }
  
  document.getElementById("resumeFile").value = "";
  document.getElementById("portfolioFile").value = "";
  document.getElementById("resumeUrl").value = "";
  document.getElementById("portfolioUrl").value = "";
  
  showToast("Профиль сохранен", "success");
};

function setupRealtimeApplications() {
  const q = query(collection(db, "applications"), where("user_id", "==", currentUser.uid));
  
  console.log("Настройка слушателя откликов для пользователя:", currentUser.uid);
  
  applicationsListener = onSnapshot(q, (snapshot) => {
    console.log("Получено откликов:", snapshot.size);
    
    snapshot.docChanges().forEach((change) => {
      if (change.type === "modified") {
        const newStatus = change.doc.data().status;
        const jobTitle = change.doc.data().opportunity_title;
        
        let statusText = "";
        let statusClass = "";
        
        switch(newStatus) {
          case "accepted":
            statusText = "принят. Работодатель свяжется с вами";
            statusClass = "success";
            break;
          case "rejected":
            statusText = "отклонен. Не расстраивайтесь, продолжайте искать";
            statusClass = "error";
            break;
          case "reserved":
            statusText = "добавлен в резерв. Это хороший знак";
            statusClass = "info";
            break;
          default:
            statusText = `изменен на "${newStatus}"`;
            statusClass = "info";
        }
        
        showToast(`Статус отклика на "${jobTitle}" ${statusText}`, statusClass);
      }
    });
    
    loadApplications();
  }, (error) => {
    console.error("Ошибка слушателя откликов:", error);
  });
}

async function loadApplications() {
  console.log("Загрузка откликов...");
  const q = query(collection(db, "applications"), where("user_id", "==", currentUser.uid));
  const snapshot = await getDocs(q);

  const container = document.getElementById("applications");
  if (!container) {
    console.error("Контейнер #applications не найден!");
    return;
  }
  
  console.log("Найдено откликов:", snapshot.size);
  container.innerHTML = "";

  if (snapshot.empty) {
    container.innerHTML = '<div class="empty-state">У вас пока нет откликов. Начните искать вакансии на главной странице.</div>';
    return;
  }

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const applicationId = docSnap.id;
    
    const jobDoc = await getDoc(doc(db, "opportunity", data.opportunity_id));
    const jobData = jobDoc.exists() ? jobDoc.data() : { title: "Вакансия удалена" };
    
    let companyName = "Компания не указана";
    if (jobData.company_id) {
      const companyDoc = await getDoc(doc(db, "companies", jobData.company_id));
      if (companyDoc.exists()) {
        companyName = companyDoc.data().name;
      }
    }

    const statusClass = data.status === "pending" ? "status-pending" : 
                        data.status === "accepted" ? "status-accepted" : 
                        data.status === "rejected" ? "status-rejected" : "status-reserved";
    
    const statusText = data.status === "pending" ? "На рассмотрении" : 
                       data.status === "accepted" ? "Принят" : 
                       data.status === "rejected" ? "Отклонен" : 
                       data.status === "reserved" ? "В резерве" : data.status;
    
    const appliedDate = data.applied_at ? new Date(data.applied_at.seconds * 1000).toLocaleDateString('ru-RU') : "—";
    
    let addressText = "";
    if (jobData.formatted_address) {
      addressText = jobData.formatted_address;
    } else if (jobData.city) {
      addressText = jobData.city;
      if (jobData.street) addressText += `, ${jobData.street}`;
      if (jobData.house) addressText += `, ${jobData.house}`;
    } else {
      addressText = "Адрес не указан";
    }

    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <h3>${escapeHtml(jobData.title || "Вакансия")}</h3>
      <p><strong>Компания: ${escapeHtml(companyName)}</strong></p>
      <p>Зарплата: ${jobData.salary ? jobData.salary.toLocaleString() : "—"} ₽</p>
      <p>Формат работы: ${escapeHtml(jobData.format || "—")}</p>
      ${jobData.work_hours ? `<p>Занятость: ${escapeHtml(String(jobData.work_hours))} ч/день</p>` : ""}
      ${jobData.level ? `<p>Уровень: ${escapeHtml(jobData.level)}</p>` : ""}
      <p>Адрес: ${escapeHtml(addressText)}</p>
      <p>Статус отклика: <span class="status-badge ${statusClass}">${statusText}</span></p>
      <p>Дата отклика: ${appliedDate}</p>
      <div style="display: flex; gap: 10px; margin-top: 10px;">
        <button onclick="viewJobDetails('${data.opportunity_id}')" style="background: #1f6aa5;">Просмотреть вакансию</button>
        ${data.status === "pending" ? `<button onclick="withdrawApplication('${applicationId}', '${escapeHtml(jobData.title).replace(/'/g, "\\'")}')" style="background: #dc3545;">Отозвать отклик</button>` : ""}
      </div>
    `;

    container.appendChild(div);
  }
  console.log("Отклики отображены");
}

window.withdrawApplication = async function(applicationId, jobTitle) {
  if (!confirm(`Вы уверены, что хотите отозвать отклик на "${jobTitle}"?`)) return;
  
  try {
    await deleteDoc(doc(db, "applications", applicationId));
    showToast(`Отклик на "${jobTitle}" отозван`, "info");
    loadApplications();
  } catch (error) {
    console.error("Ошибка отзыва отклика:", error);
    showToast("Ошибка при отзыве отклика", "error");
  }
};

async function loadContacts() {
  const contactsSnap = await getDocs(
    query(collection(db, "contacts"), where("userId", "==", currentUser.uid))
  );
  
  const container = document.getElementById("contactsList");
  if (!container) return;
  
  contacts = [];
  
  if (contactsSnap.empty) {
    container.innerHTML = '<div class="empty-state">У вас пока нет контактов. Найдите студентов в разделе поиска и добавьте их в контакты.</div>';
    return;
  }
  
  container.innerHTML = '<div class="contacts-container" id="contactsContainer"></div>';
  const contactsContainer = document.getElementById("contactsContainer");
  
  for (const contactDoc of contactsSnap.docs) {
    const contactData = contactDoc.data();
    const contactUserDoc = await getDoc(doc(db, "users", contactData.contactId));
    
    if (contactUserDoc.exists()) {
      const contact = { id: contactDoc.id, contactId: contactData.contactId, ...contactUserDoc.data() };
      contacts.push(contact);
      
      const commonSkills = getCommonSkills(currentUserData.skills || [], contact.skills || []);
      
      const div = document.createElement("div");
      div.className = "contact-card";
      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div>
            <h3 style="margin: 0 0 5px 0;">${escapeHtml(contact.firstName)} ${escapeHtml(contact.lastName)}</h3>
            <p style="margin: 5px 0; color: #666; font-size: 13px;">Учебное заведение: ${escapeHtml(contact.university || "Не указано")}</p>
            <p style="margin: 5px 0; color: #666; font-size: 13px;">Специальность: ${escapeHtml(contact.speciality || "Не указана")}</p>
            ${contact.course ? `<p style="margin: 5px 0; color: #666; font-size: 13px;">Курс: ${escapeHtml(contact.course)}</p>` : ""}
          </div>
          <button onclick="removeContact('${contact.contactId}')" style="background: #dc3545; padding: 6px 12px; font-size: 12px;">Удалить</button>
        </div>
        ${commonSkills.length > 0 ? `
          <div style="margin-top: 10px;">
            <strong style="font-size: 12px;">Общие навыки:</strong>
            <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px;">
              ${commonSkills.map(skill => `<span class="skill-tag-small">${escapeHtml(skill)}</span>`).join('')}
            </div>
          </div>
        ` : ""}
        <div style="margin-top: 10px; display: flex; gap: 8px;">
          <button onclick="viewStudentProfile('${contact.contactId}')" style="background: #28a745; padding: 6px 12px; font-size: 12px;">Просмотреть профиль</button>
          <button onclick="recommendJob('${contact.contactId}')" style="background: #1f6aa5; padding: 6px 12px; font-size: 12px;">Рекомендовать вакансию</button>
        </div>
      `;
      contactsContainer.appendChild(div);
    }
  }
}

async function loadFriendRequests() {
  const requestsSnap = await getDocs(
    query(collection(db, "friend_requests"), where("to_user_id", "==", currentUser.uid))
  );
  
  friendRequests = [];
  
  for (const requestDoc of requestsSnap.docs) {
    const request = requestDoc.data();
    const fromUserDoc = await getDoc(doc(db, "users", request.from_user_id));
    if (fromUserDoc.exists()) {
      friendRequests.push({
        id: requestDoc.id,
        from_user_id: request.from_user_id,
        from_user_name: `${fromUserDoc.data().firstName} ${fromUserDoc.data().lastName}`,
        created_at: request.created_at
      });
    }
  }
  
  updateSidebarRequests();
}

function updateSidebarRequests() {
  const container = document.getElementById("sidebarRequests");
  if (!container) return;
  
  if (friendRequests.length === 0) {
    container.innerHTML = '<div class="empty-sidebar">Нет новых заявок</div>';
    return;
  }
  
  container.innerHTML = '';
  
  friendRequests.forEach(request => {
    const div = document.createElement("div");
    div.className = "sidebar-card";
    div.innerHTML = `
      <div class="contact-info">
        <h4>${escapeHtml(request.from_user_name)}</h4>
        <p>Хочет добавить вас в контакты</p>
        <p style="font-size: 11px; color: #999;">${request.created_at ? new Date(request.created_at.seconds * 1000).toLocaleDateString('ru-RU') : "—"}</p>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 10px;">
        <button onclick="acceptFriendRequest('${request.id}', '${request.from_user_id}')" style="background: #28a745;">Принять</button>
        <button onclick="declineFriendRequest('${request.id}')" style="background: #dc3545;">Отклонить</button>
      </div>
    `;
    container.appendChild(div);
  });
}

window.addContact = async function(contactId) {
  console.log(`[DEBUG] Попытка добавить в контакты: ${contactId}`);
  
  if (contactId === currentUser?.uid) {
    showToast("Вы не можете добавить себя в контакты", "info");
    return;
  }

  try {
    const existing = await getDocs(
      query(collection(db, "contacts"), 
        where("userId", "==", currentUser.uid), 
        where("contactId", "==", contactId)
      )
    );
    
    if (!existing.empty) {
      showToast("Этот пользователь уже в ваших контактах", "info");
      updateSearchResultButton(contactId, true);
      return;
    }
    
    const existingRequest = await getDocs(
      query(collection(db, "friend_requests"), 
        where("from_user_id", "==", currentUser.uid), 
        where("to_user_id", "==", contactId)
      )
    );
    
    if (!existingRequest.empty) {
      showToast("Заявка уже отправлена", "info");
      updateSearchResultButton(contactId, false, true);
      return;
    }
    
    await addDoc(collection(db, "friend_requests"), {
      from_user_id: currentUser.uid,
      to_user_id: contactId,
      from_user_name: `${currentUserData.firstName || ""} ${currentUserData.lastName || ""}`.trim() || "Пользователь",
      created_at: new Date(),
      status: "pending"
    });
    
    showToast("Заявка в контакты отправлена", "success");
    
    updateSearchResultButton(contactId, false, true);
    await loadSuggestedStudents();
    
  } catch (error) {
    console.error("Ошибка отправки заявки:", error);
    showToast("Ошибка при отправке заявки", "error");
  }
};

function updateSearchResultButton(contactId, isContact = false, requestSent = false) {
  const buttons = document.querySelectorAll(`#searchResults button[onclick*="addContact('${contactId}')"]`);
  
  buttons.forEach(btn => {
    if (isContact) {
      btn.textContent = "Уже в контактах";
      btn.disabled = true;
      btn.style.background = "#6c757d";
    } else if (requestSent) {
      btn.textContent = "Заявка отправлена";
      btn.disabled = true;
      btn.style.background = "#6c757d";
    } else {
      btn.textContent = "Добавить в контакты";
      btn.disabled = false;
      btn.style.background = "#28a745";
    }
  });
}

window.acceptFriendRequest = async function(requestId, fromUserId) {
  try {
    await addDoc(collection(db, "contacts"), {
      userId: currentUser.uid,
      contactId: fromUserId,
      createdAt: new Date()
    });
    
    await addDoc(collection(db, "contacts"), {
      userId: fromUserId,
      contactId: currentUser.uid,
      createdAt: new Date()
    });
    
    await deleteDoc(doc(db, "friend_requests", requestId));
    
    showToast("Контакт добавлен", "success");
    
    await loadContacts();
    await loadFriendRequests();
    await loadSuggestedStudents();
    
    const searchInput = document.getElementById("searchStudent");
    if (searchInput && searchInput.value) {
      searchStudents(searchInput.value);
    }
    
    await loadSidebarContacts();
    
  } catch (error) {
    console.error("Ошибка принятия заявки:", error);
    showToast("Ошибка при принятии заявки", "error");
  }
};

window.declineFriendRequest = async function(requestId) {
  try {
    await deleteDoc(doc(db, "friend_requests", requestId));
    showToast("Заявка отклонена", "info");
    await loadFriendRequests();
  } catch (error) {
    console.error("Ошибка отклонения заявки:", error);
    showToast("Ошибка при отклонении заявки", "error");
  }
};

window.removeContact = async function(contactId) {
  if (!confirm("Удалить пользователя из контактов?")) return;
  
  try {
    const contactUserDoc = await getDoc(doc(db, "users", contactId));
    const contactName = contactUserDoc.exists() 
      ? `${contactUserDoc.data().firstName} ${contactUserDoc.data().lastName}` 
      : "пользователя";
    
    console.log(`[DEBUG] Удаление контакта: ${contactId}, текущий пользователь: ${currentUser.uid}`);
    
    const q1 = query(
      collection(db, "contacts"), 
      where("userId", "==", currentUser.uid), 
      where("contactId", "==", contactId)
    );
    const snap1 = await getDocs(q1);
    
    const q2 = query(
      collection(db, "contacts"), 
      where("userId", "==", contactId), 
      where("contactId", "==", currentUser.uid)
    );
    const snap2 = await getDocs(q2);
    
    const deletePromises = [];
    snap1.forEach(docSnap => {
      console.log(`[DEBUG] Удаление документа 1: ${docSnap.id}`);
      deletePromises.push(deleteDoc(docSnap.ref));
    });
    snap2.forEach(docSnap => {
      console.log(`[DEBUG] Удаление документа 2: ${docSnap.id}`);
      deletePromises.push(deleteDoc(docSnap.ref));
    });
    
    console.log(`[DEBUG] Всего документов к удалению: ${deletePromises.length}`);
    
    await Promise.all(deletePromises);
    
    showToast(`Контакт "${contactName}" удален из контактов`, "success");
    
    await loadContacts();
    await loadSuggestedStudents();
    await loadSidebarContacts();
    
    const searchInput = document.getElementById("searchStudent");
    if (searchInput && searchInput.value) {
      searchStudents(searchInput.value);
    }
    
  } catch (error) {
    console.error("Ошибка удаления контакта:", error);
    
    // Если ошибка прав доступа - пробуем удалить только свой контакт
    if (error.code === 'permission-denied' || error.message?.includes('permission')) {
      console.log("[DEBUG] Пробуем удалить только свой контакт...");
      try {
        const q1 = query(
          collection(db, "contacts"), 
          where("userId", "==", currentUser.uid), 
          where("contactId", "==", contactId)
        );
        const snap1 = await getDocs(q1);
        
        const deletePromises = [];
        snap1.forEach(docSnap => deletePromises.push(deleteDoc(docSnap.ref)));
        await Promise.all(deletePromises);
        
        showToast(`Контакт удален из вашего списка контактов`, "success");
        
        await loadContacts();
        await loadSuggestedStudents();
        await loadSidebarContacts();
        
        const searchInput = document.getElementById("searchStudent");
        if (searchInput && searchInput.value) {
          searchStudents(searchInput.value);
        }
      } catch (e) {
        console.error("Повторная ошибка:", e);
        showToast("Не удалось удалить контакт", "error");
      }
    } else {
      showToast("Ошибка при удалении из контактов", "error");
    }
  }
};


function getCommonSkills(userSkills, contactSkills) {
  if (!userSkills || !contactSkills) return [];
  return userSkills.filter(skill => contactSkills.includes(skill));
}

async function loadSuggestedStudents() {
  const container = document.getElementById("suggestedStudentsList");
  if (!container) return;

  container.innerHTML = "";

  const mySkills = Array.isArray(currentUserData?.skills) ? currentUserData.skills : [];
  if (mySkills.length === 0) {
    container.innerHTML = '<div class="empty-state">Добавьте навыки в профиле, чтобы мы могли подбирать контакты.</div>';
    return;
  }

  const mySkillsNorm = mySkills.map(s => (s ?? "").toString().trim().toLowerCase()).filter(Boolean);
  const contactIds = new Set((contacts || []).map(c => c.contactId));

  const usersSnap = await getDocs(collection(db, "users"));
  const candidates = [];

  for (const docSnap of usersSnap.docs) {
    const user = docSnap.data();
    const userId = docSnap.id;

    if (user.role !== "student") continue;
    if (userId === currentUser?.uid) continue;
    if (user.profile_visible === false) continue;
    if (contactIds.has(userId)) continue;

    const skills = Array.isArray(user.skills) ? user.skills : [];
    const skillsNorm = skills.map(s => (s ?? "").toString().trim().toLowerCase()).filter(Boolean);

    const common = mySkillsNorm.filter(s => skillsNorm.includes(s));
    if (common.length === 0) continue;

    candidates.push({
      id: userId,
      score: common.length,
      commonSkills: common.slice(0, 6),
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      university: user.university || "",
      speciality: user.speciality || ""
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 6);

  if (top.length === 0) {
    container.innerHTML = '<div class="empty-state">Пока не нашли подходящих студентов. Попробуйте позже или уточните навыки.</div>';
    return;
  }

  top.forEach(c => {
    const div = document.createElement("div");
    div.className = "contact-card";
    div.style.marginBottom = "12px";

    const skillsHtml = c.commonSkills.map(s => `<span class="skill-tag-small">${escapeHtml(s)}</span>`).join("");

    div.innerHTML = `
      <div style="display:flex; justify-content: space-between; align-items:flex-start; gap:12px;">
        <div>
          <h3 style="margin: 0 0 6px 0;">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</h3>
          <p style="margin: 5px 0; color: #666; font-size: 13px;">Учебное заведение: ${escapeHtml(c.university || "Не указано")}</p>
          <p style="margin: 5px 0; color: #666; font-size: 13px;">Специальность: ${escapeHtml(c.speciality || "Не указана")}</p>
          <div style="margin-top: 10px;">
            <strong style="font-size: 12px;">Совпадения:</strong>
            <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top: 5px;">${skillsHtml}</div>
          </div>
        </div>
        <div>
          <button onclick="addContact('${c.id}')" style="background: #28a745; padding: 8px 12px; font-size: 12px; border-radius: 10px; border: none; cursor: pointer;">
            Добавить в контакты
          </button>
        </div>
      </div>
    `;

    container.appendChild(div);
  });
}

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
  toast.style.animation = "slideIn 0.3s ease";
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = "slideOut 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

const searchInput = document.getElementById("searchStudent");
if (searchInput) {
  let searchTimeout;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchStudents(e.target.value);
    }, 300);
  });
}


async function searchStudents(searchText) {
  if (!searchText || searchText.length < 2) {
    document.getElementById("searchResults").innerHTML = "";
    return;
  }
  
  const queryLower = searchText.toLowerCase();
  
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const results = [];
    
    const sentRequestsSnap = await getDocs(
      query(collection(db, "friend_requests"), where("from_user_id", "==", currentUser.uid))
    );
    const sentRequestIds = new Set();
    sentRequestsSnap.forEach(doc => {
      sentRequestIds.add(doc.data().to_user_id);
    });
    
    for (const docSnap of usersSnap.docs) {
      const user = docSnap.data();
      const userId = docSnap.id;
      
      // Только студенты, не сам пользователь, и профиль видимый
      if (user.role !== "student") continue;
      if (userId === currentUser?.uid) continue;
      if (user.profile_visible === false) continue;
      
      const fullName = `${user.firstName || ""} ${user.lastName || ""}`.toLowerCase();
      const university = (user.university || "").toLowerCase();
      const skills = (user.skills || []).join(" ").toLowerCase();
      
      if (fullName.includes(queryLower) || 
          university.includes(queryLower) || 
          skills.includes(queryLower)) {
        
        const isContact = contacts.some(c => c.contactId === userId);
        const requestSent = sentRequestIds.has(userId);
        
        results.push({ 
          id: userId, 
          ...user, 
          isContact,
          requestSent
        });
      }
    }
    
    const container = document.getElementById("searchResults");
    
    if (results.length === 0) {
      container.innerHTML = '<div class="empty-state">Ничего не найдено</div>';
      return;
    }
    
    container.innerHTML = '<div class="contacts-container"></div>';
    const resultsContainer = container.querySelector(".contacts-container");
    
    results.forEach(user => {
      const div = document.createElement("div");
      div.className = "contact-card";
      
      let buttonHtml = "";
      if (user.isContact) {
        buttonHtml = `<button disabled style="background: #6c757d;">Уже в контактах</button>`;
      } else if (user.requestSent) {
        buttonHtml = `<button disabled style="background: #6c757d;">Заявка отправлена</button>`;
      } else {
        buttonHtml = `<button onclick="addContact('${user.id}')" style="background: #28a745;">Добавить в контакты</button>`;
      }
      
      div.innerHTML = `
        <h3 style="margin: 0 0 5px 0;">${escapeHtml(user.firstName || "")} ${escapeHtml(user.lastName || "")}</h3>
        <p style="margin: 5px 0; color: #666; font-size: 13px;">Учебное заведение: ${escapeHtml(user.university || "Не указано")}</p>
        <p style="margin: 5px 0; color: #666; font-size: 13px;">Специальность: ${escapeHtml(user.speciality || "Не указана")}</p>
        ${user.skills && user.skills.length > 0 ? `
          <div style="margin-top: 10px;">
            <strong style="font-size: 12px;">Навыки:</strong>
            <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px;">
              ${user.skills.slice(0, 5).map(skill => `<span class="skill-tag-small">${escapeHtml(skill)}</span>`).join('')}
            </div>
          </div>
        ` : ""}
        <div style="margin-top: 10px;">
          ${buttonHtml}
          <button onclick="viewStudentProfile('${user.id}')" style="background: #1f6aa5; margin-left: 8px;">Профиль</button>
        </div>
      `;
      resultsContainer.appendChild(div);
    });
    
  } catch (error) {
    console.error("Ошибка поиска студентов:", error);
    document.getElementById("searchResults").innerHTML = '<div class="empty-state">Ошибка при поиске</div>';
  }
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.viewStudentProfile = async function(studentId) {
  const studentDoc = await getDoc(doc(db, "users", studentId));
  if (!studentDoc.exists()) {
    showToast("Профиль не найден", "error");
    return;
  }
  
  const student = studentDoc.data();
  
  if (student.profile_visible === false) {
    showToast("Этот пользователь скрыл свой профиль", "info");
    return;
  }
  
  const applicationsVisible = student.applications_visible !== false;
  
  let applications = [];
  if (applicationsVisible) {
    const appsSnap = await getDocs(
      query(collection(db, "applications"), where("user_id", "==", studentId))
    );
    for (const appDoc of appsSnap.docs) {
      const app = appDoc.data();
      const jobDoc = await getDoc(doc(db, "opportunity", app.opportunity_id));
      if (jobDoc.exists()) {
        applications.push({
          title: jobDoc.data().title,
          status: app.status
        });
      }
    }
  }
  
  const existingModal = document.getElementById("studentProfileModal");
  if (existingModal) existingModal.remove();
  
  const modal = document.createElement("div");
  modal.id = "studentProfileModal";
  modal.className = "profile-modal";
  
  modal.innerHTML = `
    <div class="profile-modal-content">
      <div class="profile-modal-header">
        <h2>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</h2>
        <button class="profile-modal-close" onclick="closeStudentProfileModal()">&times;</button>
      </div>
      <div class="profile-modal-body">
        <div class="info-row">
          <div class="info-label">Телефон</div>
          <div class="info-value">${escapeHtml(student.phone || "Не указан")}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Учебное заведение</div>
          <div class="info-value">${escapeHtml(student.university || "Не указано")}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Курс</div>
          <div class="info-value">${escapeHtml(student.course || "Не указан")}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Специальность</div>
          <div class="info-value">${escapeHtml(student.speciality || "Не указана")}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Навыки</div>
          <div class="info-value">
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px;">
              ${(student.skills || []).map(skill => `<span class="skill-tag-small">${escapeHtml(skill)}</span>`).join('') || "Не указаны"}
            </div>
          </div>
        </div>
        <div class="info-row">
          <div class="info-label">Портфолио</div>
          <div class="info-value">${escapeHtml(student.portfolio || "Не указано")}</div>
        </div>
        ${student.resumeUrl ? `
          <div class="info-row">
            <div class="info-label">Резюме</div>
            <div class="info-value"><a href="${student.resumeUrl}" target="_blank">Скачать резюме</a></div>
          </div>
        ` : ""}
        
        ${applicationsVisible ? `
          <div class="info-row">
            <div class="info-label">Отклики (${applications.length})</div>
            <div class="info-value">
              ${applications.map(app => `
                <div style="background: #f8f9fa; padding: 8px; margin-top: 5px; border-radius: 8px;">
                  <strong>${escapeHtml(app.title)}</strong><br>
                  <span class="status-badge ${app.status === 'pending' ? 'status-pending' : app.status === 'accepted' ? 'status-accepted' : 'status-rejected'}">
                    ${app.status === "pending" ? "На рассмотрении" : app.status === "accepted" ? "Принят" : "Отклонен"}
                  </span>
                </div>
              `).join('') || "Нет откликов"}
            </div>
          </div>
        ` : "<p>Пользователь скрыл свои отклики</p>"}
      </div>
      <div class="profile-modal-footer">
        <button onclick="recommendJob('${studentId}'); closeStudentProfileModal();" style="background: #1f6aa5; width: 100%;">Рекомендовать вакансию</button>
      </div>
    </div>
  `;
  
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeStudentProfileModal();
    }
  });
  
  document.body.appendChild(modal);
};

window.closeStudentProfileModal = function() {
  const modal = document.getElementById("studentProfileModal");
  if (modal) modal.remove();
};

window.recommendJob = async function(studentId) {
  const jobsSnap = await getDocs(collection(db, "opportunity"));
  const recommendedJobs = [];
  
  for (const jobDoc of jobsSnap.docs) {
    const job = jobDoc.data();
    if (job.moderation_status !== "approved" && job.moderation_status !== undefined) continue;
    recommendedJobs.push({ id: jobDoc.id, ...job });
  }
  
  if (recommendedJobs.length === 0) {
    showToast("Нет доступных вакансий для рекомендации", "info");
    return;
  }
  
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
  modal.style.zIndex = "1001";
  
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; padding: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0;">Рекомендовать вакансию</h2>
        <button onclick="this.closest('div[style*=\\'position: fixed\\']').remove()" style="background: none; border: none; font-size: 28px; cursor: pointer;">&times;</button>
      </div>
      
      ${recommendedJobs.map(job => `
        <div class="card" style="margin-bottom: 10px; cursor: pointer;" onclick="sendRecommendation('${studentId}', '${job.id}')">
          <h3>${escapeHtml(job.title)}</h3>
          <p>Зарплата: ${job.salary ? job.salary.toLocaleString() : "—"} ₽</p>
          <p>Формат работы: ${escapeHtml(job.format || "—")}</p>
        </div>
      `).join('')}
    </div>
  `;
  
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  
  document.body.appendChild(modal);
};

window.sendRecommendation = async function(studentId, jobId) {
  const jobDoc = await getDoc(doc(db, "opportunity", jobId));
  const job = jobDoc.data();
  
  await addDoc(collection(db, "recommendations"), {
    from_user_id: currentUser.uid,
    to_user_id: studentId,
    job_id: jobId,
    job_title: job.title,
    message: `${currentUserData.firstName} ${currentUserData.lastName} рекомендует вам вакансию: ${job.title}`,
    created_at: new Date(),
    status: "pending"
  });
  
  showToast("Рекомендация отправлена", "success");
  
  const jobModal = document.querySelector("div[style*='position: fixed']:not(#studentProfileModal)");
  if (jobModal) jobModal.remove();
  closeStudentProfileModal();
};

window.viewJobDetails = function(jobId) {
  window.location.href = `item-detail.html?id=${jobId}`;
};

window.logout = async function() {
  if (applicationsListener) {
    applicationsListener();
  }
  await auth.signOut();
  window.location.href = "index.html";
};

window.goHome = function() {
  window.location.href = "index.html";
};

window.toggleSidebar = function() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  
  if (sidebar.classList.contains("open")) {
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
  } else {
    sidebar.classList.add("open");
    overlay.classList.add("active");
    loadSidebarContacts();
    loadSidebarRecommendations();
  }
};

window.switchSidebarTab = function(tabName) {
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  event.target.classList.add('active');
  
  document.querySelectorAll('.sidebar-section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(`${tabName}Tab`).classList.add('active');
};

async function loadSidebarContacts() {
  const container = document.getElementById("sidebarContacts");
  if (!container) return;
  
  const contactsSnap = await getDocs(
    query(collection(db, "contacts"), where("userId", "==", currentUser.uid))
  );
  
  if (contactsSnap.empty) {
    container.innerHTML = '<div class="empty-sidebar">У вас пока нет контактов</div>';
    return;
  }
  
  container.innerHTML = '';
  
  for (const contactDoc of contactsSnap.docs) {
    const contactData = contactDoc.data();
    const contactUserDoc = await getDoc(doc(db, "users", contactData.contactId));
    
    if (contactUserDoc.exists()) {
      const contact = contactUserDoc.data();
      const div = document.createElement("div");
      div.className = "sidebar-card contact-card-small";
      div.innerHTML = `
        <div class="contact-info">
          <h4>${escapeHtml(contact.firstName)} ${escapeHtml(contact.lastName)}</h4>
          <p>Учебное заведение: ${escapeHtml(contact.university || "—")}</p>
        </div>
        <div>
          <button onclick="viewStudentProfile('${contactData.contactId}'); toggleSidebar();" style="padding: 6px 10px;">Просмотр</button>
          <button onclick="removeContact('${contactData.contactId}'); setTimeout(loadSidebarContacts, 500);" style="padding: 6px 10px; background: #dc3545;">Удалить</button>
        </div>
      `;
      container.appendChild(div);
    }
  }
}

async function loadSidebarRecommendations() {
  const container = document.getElementById("sidebarRecommendations");
  if (!container) return;
  
  const recSnap = await getDocs(
    query(collection(db, "recommendations"), 
      where("to_user_id", "==", currentUser.uid),
      where("status", "!=", "read")
    )
  );
  
  if (recSnap.empty) {
    container.innerHTML = '<div class="empty-sidebar">Нет новых рекомендаций</div>';
    return;
  }
  
  container.innerHTML = '';
  
  for (const recDoc of recSnap.docs) {
    const rec = recDoc.data();
    const senderDoc = await getDoc(doc(db, "users", rec.from_user_id));
    const senderName = senderDoc.exists() ? `${senderDoc.data().firstName} ${senderDoc.data().lastName}` : "Пользователь";
    
    const div = document.createElement("div");
    div.className = "sidebar-card recommendation-card";
    div.innerHTML = `
      <div><strong>${escapeHtml(rec.job_title)}</strong></div>
      <div class="recommendation-sender">${escapeHtml(senderName)} рекомендует вам эту вакансию</div>
      <div style="margin-top: 10px; display: flex; gap: 8px;">
        <button onclick="viewJobDetails('${rec.job_id}'); toggleSidebar();" style="padding: 6px 12px; background: #1f6aa5;">Посмотреть</button>
        <button onclick="markRecommendationRead('${recDoc.id}')" style="padding: 6px 12px; background: #28a745;">ОК</button>
      </div>
    `;
    container.appendChild(div);
  }
}

window.markRecommendationRead = async function(recId) {
  try {
    await updateDoc(doc(db, "recommendations", recId), {
      status: "read",
      read_at: new Date()
    });
    showToast("Рекомендация отмечена как прочитанная", "success");
    await loadSidebarRecommendations();
  } catch (error) {
    console.error("Ошибка отметки рекомендации:", error);
    showToast("Ошибка при отметке рекомендации", "error");
  }
};

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
`;
document.head.appendChild(style);
window.loadSidebarContacts = loadSidebarContacts;
window.loadSidebarRecommendations = loadSidebarRecommendations;
window.loadContacts = loadContacts;
window.loadFriendRequests = loadFriendRequests;
window.loadSuggestedStudents = loadSuggestedStudents;
window.toggleSidebar = toggleSidebar;
window.switchSidebarTab = switchSidebarTab;
window.markRecommendationRead = markRecommendationRead;
window.viewStudentProfile = viewStudentProfile;
window.closeStudentProfileModal = closeStudentProfileModal;
window.recommendJob = recommendJob;
window.sendRecommendation = sendRecommendation;
window.withdrawApplication = withdrawApplication;
window.togglePrivacy = togglePrivacy;
window.saveProfile = saveProfile;
window.addContact = addContact;
window.acceptFriendRequest = acceptFriendRequest;
window.declineFriendRequest = declineFriendRequest;
window.removeContact = removeContact;
window.viewJobDetails = viewJobDetails;
window.logout = logout;
window.goHome = goHome;